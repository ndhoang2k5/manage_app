"""
Dữ liệu chỉ đọc cho tích hợp bên ngoài (Google Sheets của Unbee): BOM, giá vốn, danh mục NPL,
lệnh sản xuất theo SKU, nhập/cấp/trả vật tư, phiếu nhập NCC, nhập kho thành phẩm theo đợt, tồn vật tư.

Web lưu BOM theo từng lệnh sản xuất, không theo mã sản phẩm. Mã sản phẩm (VD QA388) được
suy ra từ các dòng SKU của lệnh (production_order_items.size_label = "SKU:QA38801||TEN:...").
Một mã sản phẩm lấy theo lệnh gần nhất (id lớn nhất, bỏ lệnh đã hủy) có chứa mã đó.

Nguồn dòng vật tư giống màn "Quản lý đơn":
- Lệnh nháp / chờ NVL: bảng bom_materials (định mức kế hoạch).
- Lệnh đang SX / hoàn thành: bảng production_material_reservations (lượng NVL đã giữ/cấp).
"""
import bisect
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from services.productionService import ProductionService

VN_TZ = timezone(timedelta(hours=7))
FABRIC_UNITS = {"kg", "kkg", "m", "mét", "met", "yard", "yd"}
MODEL_CODE_RE = re.compile(r"^([A-Za-z]{2}\d{3})\d{0,2}$")
NPL_META_MARKERS = ("__NPLMETA__:", "__NPLMETA:")
SKU_SP_NAME_SEPARATOR = "||TEN:"
EDIT_SNAPSHOT_EVENTS = ("create_quick", "update_after")
RESERVATION_STATUSES = ("in_progress", "completed")
SIZE_ALL = "Tất cả"
STATUS_COMPLETE = "đủ dữ liệu"
STATUS_ESTIMATE = "tạm tính"

# Lệnh SX
ORDER_NOT_CUT = "chưa cắt"
ORDER_SEWING = "đang may"
ORDER_RECEIVED = "đã về"
ORDER_CLOSED = "đóng"
ORDER_CANCELLED = "đã hủy"
# Hủy lệnh đổi mã thành "<mã cũ>_C_<unix time>" để giải phóng mã.
CANCELLED_CODE_RE = re.compile(r"^(.*)_C_(\d{9,11})$")
SIZE_SUFFIX_RE = re.compile(
    r"^(?P<mau>.*?)[\s,;/\-]*(?:\b(?:sz|size)\s*)?\b(?P<size>"
    r"\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?\s*(?:m|y|t)?"
    r"|\d+\s*(?:m|y|t)"
    r"|free\s*size"
    r"|x{0,3}[sml]|\d?xl"
    r")$",
    re.IGNORECASE,
)

# Nhập/xuất vật tư
MOVE_PURCHASE = "nhập từ NCC"
MOVE_ISSUE = "cấp cho xưởng"
MOVE_RETURN = "xưởng trả lại"
MOVE_TRANSFER = "chuyển kho"
MOVE_WORKSHOP_TRANSFER = "chuyển xưởng"
MOVE_ADJUST = "điều chỉnh"
MOVE_CONSUME = "xưởng dùng cho lệnh"
MOVE_CONSUME_RETURN = "lệnh hoàn lại xưởng"
DOC_DRAFT = "nháp"
DOC_APPROVED = "đã duyệt"
CENTRAL_LABEL = "kho tổng"
WORKSHOP_LABEL = "xưởng"
TRANSFER_TAG_RE = re.compile(r"\[TRF:([^\]]+)\]\s*")
# Dòng sổ kho do lệnh SX sinh ra không ghi người làm: lấy người của snapshot lệnh gần nhất trong khoảng này.
ACTOR_MATCH_SECONDS = 300
PURCHASE_DELETION_TABLE = "purchase_order_item_deletions"

FINISHED_GOOD = "Thành phẩm"
RECEIVE_BATCH = "trả hàng"
RECEIVE_ADJUST = "sửa số đã trả"


def classify_material(base_unit: Optional[str], group_name: Optional[str] = None) -> str:
    """
    Web chưa phân loại vật tư; tạm suy ra từ đơn vị tính (kg/m... là vải). Nhiều loại vải bị gõ mã/tên vải
    vào ô ĐVT (ĐVT "H24007" của nhóm "H24007"): ĐVT trùng tên nhóm vật tư cũng tính là vải.
    """
    unit = re.sub(r"\s+", " ", str(base_unit or "")).strip().lower()
    if unit in FABRIC_UNITS or "vải" in unit:
        return "Vải"
    if unit and unit == re.sub(r"\s+", " ", str(group_name or "")).strip().lower():
        return "Vải"
    return "NPL"


def parse_npl_note(note: Optional[str]) -> Dict:
    raw = str(note or "")
    marker_idx, marker = -1, None
    for m in NPL_META_MARKERS:
        idx = raw.find(m)
        if idx >= 0 and (marker_idx < 0 or idx < marker_idx):
            marker_idx, marker = idx, m
    if marker_idx < 0:
        return {"note": raw.strip(), "rate": None, "product_qty": None}
    meta = {}
    try:
        meta = json.loads(raw[marker_idx + len(marker):])
    except (ValueError, TypeError):
        pass

    def _num(key):
        try:
            return float(meta[key]) if meta.get(key) is not None else None
        except (TypeError, ValueError):
            return None

    return {"note": raw[:marker_idx].strip(), "rate": _num("consumptionRate"), "product_qty": _num("productQuantity")}


def model_code_from_label(size_label: Optional[str]) -> Optional[str]:
    raw = str(size_label or "").strip()
    if not raw.upper().startswith("SKU:"):
        return None
    sku = raw[4:].split(SKU_SP_NAME_SEPARATOR, 1)[0].strip()
    match = MODEL_CODE_RE.match(sku)
    return match.group(1).upper() if match else None


def to_iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=VN_TZ)
    return value.isoformat(timespec="seconds")


def parse_updated_since(value: Optional[str]) -> Optional[datetime]:
    """ISO 8601 -> datetime naive theo giờ VN (giờ lưu trong DB). Không có múi giờ = giờ VN."""
    if value is None or str(value).strip() == "":
        return None
    raw = str(value).strip().replace(" ", "T")
    if raw.endswith("Z") or raw.endswith("z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        raise ValueError("updated_since phải theo định dạng ISO 8601, VD 2026-10-08T09:00:00+07:00")
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(VN_TZ).replace(tzinfo=None)
    return parsed


def paginate(rows: List[Dict], page: int, page_size: int) -> Dict:
    total = len(rows)
    start = (page - 1) * page_size
    return {
        "data": rows[start:start + page_size],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if total else 0,
        "generated_at": to_iso(datetime.now(VN_TZ)),
    }


def _f(value, digits: int = 2) -> Optional[float]:
    if value is None:
        return None
    return round(float(value), digits)


def _ids_csv(ids) -> str:
    return ",".join(str(int(x)) for x in ids)


def _iso_date(value) -> Optional[str]:
    if value is None:
        return None
    return (value.date() if isinstance(value, datetime) else value).isoformat()


def parse_item_label(label: Optional[str], note: Optional[str] = None):
    """size_label dòng lệnh "SKU:QA38801||TEN:be 6-9m" -> (sku, tên SKU); dòng size thường -> (None, size)."""
    raw = str(label or "").strip()
    if raw.upper().startswith("SKU:"):
        sku, _, sku_name = raw[4:].partition(SKU_SP_NAME_SEPARATOR)
        return sku.strip() or None, sku_name.strip() or str(note or "").strip()
    return None, raw


def split_size_color(name: Optional[str]):
    """Tên SKU web gộp màu/mẫu và size ("be 6-9m", "cappy sz 0-3m") -> (size, màu)."""
    raw = re.sub(r"\s+", " ", str(name or "")).strip()
    if not raw:
        return None, None
    match = SIZE_SUFFIX_RE.match(raw)
    if not match:
        return None, raw
    return match.group("size").strip(), match.group("mau").strip() or None


def parse_cancelled_code(code: Optional[str]):
    """Mã lệnh đã hủy "HĐ26ub59_C_1759650000" -> ("HĐ26ub59", thời điểm hủy theo giờ VN)."""
    raw = (code or "").strip()
    match = CANCELLED_CODE_RE.match(raw)
    if not match:
        return raw, None
    cancelled_at = datetime.fromtimestamp(int(match.group(2)), VN_TZ).replace(tzinfo=None)
    return match.group(1).strip(), cancelled_at


def order_line_status(order_status: str, qty_planned: float, qty_finished: float) -> str:
    if order_status == "cancelled":
        return ORDER_CANCELLED
    if order_status == "completed":
        return ORDER_CLOSED
    if order_status == "in_progress":
        return ORDER_RECEIVED if qty_planned > 0 and qty_finished >= qty_planned else ORDER_SEWING
    return ORDER_NOT_CUT


def classify_transfer(from_central: Optional[bool], to_central: Optional[bool]) -> str:
    if from_central is None or to_central is None:
        # Chỉ có 1 vế (vế kia đã mất): tồn chỉ đổi ở 1 nơi.
        return MOVE_ADJUST
    if from_central and not to_central:
        return MOVE_ISSUE
    if not from_central and to_central:
        return MOVE_RETURN
    return MOVE_TRANSFER if from_central else MOVE_WORKSHOP_TRANSFER


def classify_material_filter(kind: Optional[str]):
    """Tham số loai_vat_tu=vai|npl -> nhãn loại vật tư cần giữ (None = mọi vật tư)."""
    return {"vai": "Vải", "npl": "NPL"}.get((kind or "").strip().lower())


def nearest_actor(snapshots: List[tuple], at: Optional[datetime], max_seconds: int = ACTOR_MATCH_SECONDS):
    """snapshots = [(thời điểm, người)] đã sắp theo thời điểm -> người của snapshot gần `at` nhất trong max_seconds."""
    if not snapshots or at is None:
        return None
    idx = bisect.bisect_left(snapshots, (at,))
    best, best_gap = None, None
    for cand in snapshots[max(idx - 1, 0):idx + 1]:
        gap = abs((cand[0] - at).total_seconds())
        if gap <= max_seconds and (best_gap is None or gap < best_gap):
            best, best_gap = cand[1], gap
    return best


def pair_transfers(rows: List[Dict]) -> List[tuple]:
    """
    Phiếu điều chuyển ghi 2 dòng sổ kho liền nhau (transfer_out ở kho đi rồi transfer_in ở kho đến),
    cùng thẻ [TRF:...], cùng vật tư, lượng đối nhau. Ghép mỗi dòng đi với dòng đến khớp gần nhất
    phía sau; dòng không ghép được trả về với vế còn lại là None.
    """
    def key(r):
        return (r["tag"] or "", r["material_id"], round(abs(r["qty"]), 6))

    pending_in: Dict[tuple, List[Dict]] = {}
    for r in sorted(rows, key=lambda x: x["id"]):
        if r["type"] == "transfer_in":
            pending_in.setdefault(key(r), []).append(r)
    pairs = []
    for r in sorted(rows, key=lambda x: x["id"]):
        if r["type"] != "transfer_out":
            continue
        bucket = pending_in.get(key(r), [])
        idx = next((i for i, x in enumerate(bucket) if x["id"] > r["id"]), None)
        pairs.append((r, bucket.pop(idx) if idx is not None else None))
    pairs.extend((None, r) for bucket in pending_in.values() for r in bucket)
    return pairs


def transfer_tag(note: Optional[str]) -> Optional[str]:
    match = TRANSFER_TAG_RE.search(note or "")
    return match.group(1) if match else None


class IntegrationService:
    def __init__(self, db: Session, brand_ids: Optional[List[int]] = None):
        self.db = db
        # None = mọi nhãn; danh sách = chỉ lệnh/vật tư của các nhãn này.
        self.brand_ids = brand_ids

    # ---------- nạp dữ liệu ----------
    def _load_orders(self) -> List[Dict]:
        brand_filter = ""
        if self.brand_ids is not None:
            if not self.brand_ids:
                return []
            brand_filter = f"AND COALESCE(ow.brand_id, w.brand_id) IN ({_ids_csv(self.brand_ids)})"
        rows = self.db.execute(text(f"""
            SELECT po.id, po.code, po.status, po.quantity_planned,
                   po.labor_fee, po.shipping_fee, po.other_fee,
                   po.marketing_fee, po.packaging_fee, po.print_fee,
                   u.full_name, pv.id, pv.sku, pv.variant_name, b.name
            FROM production_orders po
            JOIN product_variants pv ON pv.id = po.product_variant_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            LEFT JOIN warehouses ow ON ow.id = po.owner_central_id
            LEFT JOIN brands b ON b.id = COALESCE(ow.brand_id, w.brand_id)
            LEFT JOIN users u ON u.id = po.created_by
            WHERE po.status <> 'cancelled'
              {brand_filter}
            ORDER BY po.id
        """)).fetchall()
        orders = [
            {
                "id": int(r[0]),
                "code": (r[1] or "").strip(),
                "status": r[2],
                "qty_planned": float(r[3] or 0),
                "labor_fee": float(r[4] or 0),
                "other_fees": sum(float(x or 0) for x in (r[5], r[6], r[7], r[8], r[9])),
                "lead": r[10],
                "product_variant_id": int(r[11]),
                "product_sku": (r[12] or "").strip(),
                "product_name": (r[13] or "").strip(),
                "brand": r[14],
                "model_codes": [],
                "edited_at": None,
                "edited_by": None,
                "lines": [],
            }
            for r in rows
        ]
        if not orders:
            return []
        by_id = {o["id"]: o for o in orders}
        ids = _ids_csv(by_id)

        for oid, label in self.db.execute(text(f"""
            SELECT production_order_id, size_label
            FROM production_order_items
            WHERE production_order_id IN ({ids})
            ORDER BY id
        """)).fetchall():
            code = model_code_from_label(label)
            codes = by_id[int(oid)]["model_codes"]
            if code and code not in codes:
                codes.append(code)

        events = ",".join(f"'{e}'" for e in EDIT_SNAPSHOT_EVENTS)
        for oid, created_at, actor_name in self.db.execute(text(f"""
            SELECT s.production_order_id, s.created_at, u.full_name
            FROM production_order_snapshots s
            JOIN (
                SELECT production_order_id, MAX(id) AS max_id
                FROM production_order_snapshots
                WHERE event_type IN ({events})
                  AND production_order_id IN ({ids})
                GROUP BY production_order_id
            ) t ON t.max_id = s.id
            LEFT JOIN users u ON u.id = s.actor_user_id
        """)).fetchall():
            by_id[int(oid)]["edited_at"] = created_at
            by_id[int(oid)]["edited_by"] = actor_name

        self._load_material_lines(orders)
        return orders

    def _load_material_lines(self, orders: List[Dict]):
        bom_orders = [o for o in orders if o["status"] not in RESERVATION_STATUSES]
        res_orders = [o for o in orders if o["status"] in RESERVATION_STATUSES]

        # BOM của mọi lệnh: nguồn dòng cho lệnh nháp, và nguồn định mức gốc cho lệnh đã giữ NVL
        # khi dòng giữ NVL không còn ghi chú định mức.
        orders_by_variant: Dict[int, List[Dict]] = {}
        for o in orders:
            orders_by_variant.setdefault(o["product_variant_id"], []).append(o)
        bom_by_order: Dict[int, List[Dict]] = {o["id"]: [] for o in orders}
        for r in self.db.execute(text(f"""
            SELECT b.product_variant_id, bm.id, bm.material_variant_id, bm.quantity_needed, bm.note
            FROM bom b
            JOIN bom_materials bm ON bm.bom_id = b.id
            WHERE b.product_variant_id IN ({_ids_csv(orders_by_variant)})
            ORDER BY bm.id
        """)).fetchall():
            for o in orders_by_variant.get(int(r[0]), []):
                meta = parse_npl_note(r[4])
                per_unit = float(r[3] or 0)
                bom_by_order[o["id"]].append({
                    "line_id": int(r[1]),
                    "material_id": int(r[2]),
                    "total_qty": per_unit * o["qty_planned"],
                    "per_unit": per_unit,
                    **meta,
                })

        for o in bom_orders:
            o["lines"] = bom_by_order[o["id"]]

        if res_orders:
            res_by_id = {o["id"]: o for o in res_orders}
            for r in self.db.execute(text(f"""
                SELECT production_order_id, id, material_variant_id, quantity_reserved, note
                FROM production_material_reservations
                WHERE production_order_id IN ({_ids_csv(res_by_id)})
                ORDER BY id
            """)).fetchall():
                o = res_by_id[int(r[0])]
                total_qty = float(r[3] or 0)
                meta = parse_npl_note(r[4])
                if meta["rate"] is None:
                    meta = self._borrow_bom_meta(bom_by_order[o["id"]], int(r[2]), total_qty) or meta
                o["lines"].append({
                    "line_id": int(r[1]),
                    "material_id": int(r[2]),
                    "total_qty": total_qty,
                    "per_unit": total_qty / o["qty_planned"] if o["qty_planned"] else None,
                    **meta,
                })

    @staticmethod
    def _borrow_bom_meta(bom_lines: List[Dict], material_id: int, total_qty: float) -> Optional[Dict]:
        """Dòng giữ NVL chưa sửa từ lúc bắt đầu SX thì khớp lượng với dòng BOM gốc -> dùng lại định mức gốc."""
        for line in bom_lines:
            if line["material_id"] != material_id or line["rate"] is None:
                continue
            if abs(line["total_qty"] - total_qty) <= max(1e-3, abs(total_qty) * 1e-3):
                return {"note": line["note"], "rate": line["rate"], "product_qty": line["product_qty"]}
        return None

    def _load_materials(self, material_ids=None) -> Dict[int, Dict]:
        where = "WHERE p.type = 'material'" if material_ids is None else (
            f"WHERE v.id IN ({_ids_csv(material_ids)})" if material_ids else "WHERE 1 = 0"
        )
        materials = {
            int(r[0]): {
                "id": int(r[0]),
                "sku": (r[1] or "").strip(),
                "name": (r[2] or "").strip(),
                "unit": (r[3] or "").strip(),
                "price": float(r[4]) if r[4] is not None else None,
                "group": (r[5] or "").strip() or None,
                "color": (r[6] or "").strip() or None,
                "supplier": None,
                "price_changed_at": None,
            }
            for r in self.db.execute(text(f"""
                SELECT v.id, v.sku, v.variant_name, p.base_unit, v.cost_price, p.name, v.color
                FROM product_variants v
                JOIN products p ON p.id = v.product_id
                {where}
            """)).fetchall()
        }
        if not materials:
            return materials
        ids = _ids_csv(materials)

        # NCC = nhà cung cấp của phiếu nhập gần nhất (web chưa gắn NCC cố định cho vật tư).
        for vid, supplier in self.db.execute(text(f"""
            SELECT poi.product_variant_id, s.name
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchase_order_id
            JOIN suppliers s ON s.id = po.supplier_id
            WHERE po.status <> 'cancelled'
              AND poi.product_variant_id IN ({ids})
            ORDER BY po.order_date DESC, po.id DESC
        """)).fetchall():
            m = materials[int(vid)]
            if m["supplier"] is None:
                m["supplier"] = supplier

        # Giá vật tư = giá bình quân, đổi mỗi lần nhập hàng.
        for vid, last_in in self.db.execute(text(f"""
            SELECT product_variant_id, MAX(created_at)
            FROM inventory_transactions
            WHERE transaction_type = 'purchase_in'
              AND product_variant_id IN ({ids})
            GROUP BY product_variant_id
        """)).fetchall():
            materials[int(vid)]["price_changed_at"] = last_in
        return materials

    @staticmethod
    def _product_entries(orders: List[Dict], latest_only: bool):
        """Cặp (mã SP, lệnh). Lệnh không có SKU dạng mã SP thì dùng SKU thành phẩm của lệnh."""
        pairs = []
        for o in orders:
            for code in (o["model_codes"] or [o["product_sku"]]):
                pairs.append((code, o))
        if latest_only:
            latest: Dict[str, Dict] = {}
            for code, o in pairs:
                if code not in latest or o["id"] > latest[code]["id"]:
                    latest[code] = o
            pairs = list(latest.items())
        pairs.sort(key=lambda p: (p[0].upper(), -p[1]["id"]))
        return pairs

    # ---------- điểm lấy dữ liệu ----------
    def get_bom(self, latest_only: bool = True, updated_since: Optional[datetime] = None) -> List[Dict]:
        orders = self._load_orders()
        materials = self._load_materials({l["material_id"] for o in orders for l in o["lines"]})
        rows = []
        for code, o in self._product_entries(orders, latest_only):
            if updated_since and (o["edited_at"] is None or o["edited_at"] < updated_since):
                continue
            for line in o["lines"]:
                m = materials.get(line["material_id"], {})
                product_qty = line["product_qty"]
                applies_all = not product_qty or product_qty >= o["qty_planned"]
                rows.append({
                    "ma_sp": code,
                    "ma_sx": o["code"],
                    "ten_sp": o["product_name"],
                    "nhan_hang": o["brand"],
                    "trang_thai_lenh": o["status"],
                    "lead_sx": o["lead"],
                    "loai_vat_tu": classify_material(m.get("unit"), m.get("group")),
                    "hang_muc": None,
                    "id_vat_tu": line["material_id"],
                    "ma_vat_tu": m.get("sku"),
                    "ten_vat_tu": m.get("name"),
                    "dvt": m.get("unit"),
                    "dinh_muc": _f(line["rate"] if line["rate"] is not None else line["per_unit"], 6),
                    "size_ap_dung": SIZE_ALL if applies_all else f"{int(product_qty)}/{int(o['qty_planned'])} SP",
                    "so_sp_ap_dung": int(product_qty) if product_qty else int(o["qty_planned"]),
                    "tong_luong": _f(line["total_qty"], 6),
                    "ncc": m.get("supplier"),
                    "don_gia": _f(m.get("price")),
                    "ghi_chu": line["note"] or None,
                    "cap_nhat_luc": to_iso(o["edited_at"]),
                    "nguoi_cap_nhat": o["edited_by"],
                })
        return rows

    def get_cost(self, latest_only: bool = True, updated_since: Optional[datetime] = None) -> List[Dict]:
        orders = self._load_orders()
        materials = self._load_materials({l["material_id"] for o in orders for l in o["lines"]})
        rows = []
        for code, o in self._product_entries(orders, latest_only):
            qty = o["qty_planned"]
            fabric_total = npl_total = 0.0
            missing_price = 0
            last_change = o["edited_at"]
            for line in o["lines"]:
                m = materials.get(line["material_id"], {})
                price = m.get("price") or 0.0
                if price <= 0 and line["total_qty"] > 0:
                    missing_price += 1
                amount = line["total_qty"] * price
                if classify_material(m.get("unit"), m.get("group")) == "Vải":
                    fabric_total += amount
                else:
                    npl_total += amount
                changed = m.get("price_changed_at")
                if changed and (last_change is None or changed > last_change):
                    last_change = changed
            if updated_since and (last_change is None or last_change < updated_since):
                continue

            reasons = []
            if o["status"] not in RESERVATION_STATUSES:
                reasons.append("lệnh chưa sản xuất, tính theo định mức kế hoạch")
            if not o["lines"]:
                reasons.append("chưa có dòng vật tư")
            if missing_price:
                reasons.append(f"{missing_price} vật tư chưa có đơn giá")
            if o["labor_fee"] <= 0:
                reasons.append("chưa nhập tiền gia công")
            if qty <= 0:
                reasons.append("số lượng kế hoạch bằng 0")

            per_unit = (lambda total: _f(total / qty) if qty > 0 else None)
            vai, npl = per_unit(fabric_total), per_unit(npl_total)
            gia_cong, chi_phi_khac = per_unit(o["labor_fee"]), per_unit(o["other_fees"])
            rows.append({
                "ma_sp": code,
                "ma_sx": o["code"],
                "ten_sp": o["product_name"],
                "nhan_hang": o["brand"],
                "so_luong_ke_hoach": int(qty),
                "vai": vai,
                "npl": npl,
                "gia_cong": gia_cong,
                "chi_phi_khac": chi_phi_khac,
                "gia_von": _f(sum(x for x in (vai, npl, gia_cong, chi_phi_khac) if x is not None)) if qty > 0 else None,
                "trang_thai": STATUS_ESTIMATE if reasons else STATUS_COMPLETE,
                "ly_do_tam_tinh": "; ".join(reasons) or None,
                "cap_nhat_luc": to_iso(last_change),
            })
        return rows

    def get_npl(self, updated_since: Optional[datetime] = None) -> List[Dict]:
        materials = self._load_materials()
        if self.brand_ids is not None:
            allowed = self._material_ids_for_brands()
            materials = {k: v for k, v in materials.items() if k in allowed}
        rows = []
        for m in sorted(materials.values(), key=lambda x: (x["sku"].upper(), x["id"])):
            if updated_since and (m["price_changed_at"] is None or m["price_changed_at"] < updated_since):
                continue
            rows.append({
                "id_vat_tu": m["id"],
                "ma_npl": m["sku"],
                "ten": m["name"],
                "nhom_vat_tu": m["group"],
                "mau_hoa_tiet": m["color"],
                "loai_vat_tu": classify_material(m["unit"], m["group"]),
                "dvt": m["unit"],
                "ncc": m["supplier"],
                "don_gia": _f(m["price"]),
                "leadtime_tuan": None,
                "lo_toi_thieu": None,
                "cap_nhat_luc": to_iso(m["price_changed_at"]),
            })
        return rows

    def get_production_orders(self, updated_since: Optional[datetime] = None) -> List[Dict]:
        """
        Mỗi dòng = 1 dòng SKU của 1 lệnh. Web không có ô "số cắt thực tế" riêng: lệnh được tạo sau khi
        cắt và NVL được trừ theo SL của lệnh lúc bắt đầu SX, nên số cắt = SL dòng SKU khi lệnh đã chạy.
        """
        brand_filter = ""
        if self.brand_ids is not None:
            if not self.brand_ids:
                return []
            brand_filter = f"WHERE COALESCE(ow.brand_id, w.brand_id) IN ({_ids_csv(self.brand_ids)})"
        orders: Dict[int, Dict] = {}
        for r in self.db.execute(text(f"""
            SELECT po.id, po.code, po.status, po.start_date, po.due_date,
                   w.name, b.name, u.full_name, pv.sku
            FROM production_orders po
            LEFT JOIN product_variants pv ON pv.id = po.product_variant_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            LEFT JOIN warehouses ow ON ow.id = po.owner_central_id
            LEFT JOIN brands b ON b.id = COALESCE(ow.brand_id, w.brand_id)
            LEFT JOIN users u ON u.id = po.created_by
            {brand_filter}
        """)).fetchall():
            code, cancelled_at = parse_cancelled_code(r[1])
            orders[int(r[0])] = {
                "code": code,
                "status": r[2],
                "start_date": r[3],
                "due_date": r[4],
                "workshop": r[5],
                "brand": r[6],
                "lead": r[7],
                "fallback_code": parse_cancelled_code(r[8])[0] or None,
                "created_at": None,
                "changed_at": cancelled_at,
                "items": [],
            }
        if not orders:
            return []

        def _touch(o, at):
            if at and (o["changed_at"] is None or at > o["changed_at"]):
                o["changed_at"] = at

        # Lệnh không có cột created_at: lấy từ snapshot tạo lệnh; mọi sửa/bắt đầu/nhập hàng đều ghi snapshot.
        for oid, created_quick, first_at, last_at in self.db.execute(text("""
            SELECT production_order_id,
                   MIN(CASE WHEN event_type = 'create_quick' THEN created_at END),
                   MIN(created_at), MAX(created_at)
            FROM production_order_snapshots
            GROUP BY production_order_id
        """)).fetchall():
            o = orders.get(int(oid))
            if o:
                o["created_at"] = created_quick or first_at
                _touch(o, last_at)
        for oid, last_at in self.db.execute(text("""
            SELECT production_order_id, MAX(received_at)
            FROM production_receive_logs
            GROUP BY production_order_id
        """)).fetchall():
            o = orders.get(int(oid)) if oid is not None else None
            if o:
                _touch(o, last_at)

        for r in self.db.execute(text("""
            SELECT id, production_order_id, size_label, quantity_planned, quantity_finished, note
            FROM production_order_items
            ORDER BY production_order_id, id
        """)).fetchall():
            o = orders.get(int(r[1])) if r[1] is not None else None
            if o:
                o["items"].append(r)

        rows = []
        for oid in sorted(orders):
            o = orders[oid]
            if updated_since and (o["changed_at"] is None or o["changed_at"] < updated_since):
                continue
            order_code = next(
                (c for c in (model_code_from_label(i[2]) for i in o["items"]) if c), o["fallback_code"]
            )
            started = o["status"] in RESERVATION_STATUSES
            for item_id, _, label, planned, finished, note in o["items"]:
                sku, sku_name = parse_item_label(label, note)
                size, color = split_size_color(sku_name)
                planned, finished = int(planned or 0), int(finished or 0)
                if started:
                    cut_qty = planned
                elif o["status"] == "cancelled":
                    cut_qty = 0
                else:
                    cut_qty = None
                rows.append({
                    "ma_sx": o["code"],
                    "ma_sp": model_code_from_label(label) or order_code,
                    "sku": sku,
                    "ten_sku": sku_name or None,
                    "size": size,
                    "mau": color,
                    "so_luong_ke_hoach": planned,
                    "so_luong_cat_thuc_te": cut_qty,
                    "so_luong_da_ve": finished,
                    "xuong": o["workshop"],
                    "ngay_tao": _iso_date(o["created_at"]),
                    "ngay_cat": _iso_date(o["start_date"]) if started else None,
                    "ngay_du_kien_ve": _iso_date(o["due_date"]),
                    "trang_thai": order_line_status(o["status"], planned, finished),
                    "trang_thai_web": o["status"],
                    "nhan_hang": o["brand"],
                    "lead_sx": o["lead"],
                    "id_dong": int(item_id),
                    "cap_nhat_luc": to_iso(o["changed_at"]),
                })
        return rows

    def get_material_movements(self, updated_since: Optional[datetime] = None, include_consumption: bool = False,
                               material_kind: Optional[str] = None) -> List[Dict]:
        """
        Nhập từ NCC: mỗi dòng = 1 dòng phiếu nhập theo số hiện tại trên web; dòng/phiếu bị xóa từ 12/10/2026
        vẫn trả về với da_xoa = true (lấy từ bảng ghi xóa).
        Cấp/trả/chuyển kho/chuyển xưởng: lấy từ sổ kho (inventory_transactions), mỗi phiếu điều chuyển ghép 1 dòng.
        so_luong luôn dương; chiều đi/đến xem kho_xuat/kho_nhap.
        """
        warehouses = {
            int(r[0]): {"name": r[1], "central": bool(r[2]), "brand_id": r[3]}
            for r in self.db.execute(text("SELECT id, name, is_central, brand_id FROM warehouses")).fetchall()
        }
        brands = {int(r[0]): r[1] for r in self.db.execute(text("SELECT id, name FROM brands")).fetchall()}
        kind_label = classify_material_filter(material_kind)

        def _allowed(*wids):
            return self.brand_ids is None or any(
                wid in warehouses and warehouses[wid]["brand_id"] in self.brand_ids for wid in wids if wid
            )

        since_filter = "AND t.created_at >= :since" if updated_since else ""
        ledger = [
            {
                "id": int(r[0]),
                "type": r[1],
                "warehouse_id": int(r[2]) if r[2] is not None else None,
                "material_id": int(r[3]),
                "qty": float(r[4] or 0),
                "ref": int(r[5]) if r[5] is not None else None,
                "tag": transfer_tag(r[6]),
                "note": TRANSFER_TAG_RE.sub("", r[6] or "").strip() or None,
                "created_at": r[7],
                "created_by": r[8],
            }
            for r in self.db.execute(text(f"""
                SELECT t.id, t.transaction_type, t.warehouse_id, t.product_variant_id,
                       t.quantity, t.reference_id, t.note, t.created_at, t.created_by
                FROM inventory_transactions t
                JOIN product_variants v ON v.id = t.product_variant_id
                JOIN products p ON p.id = v.product_id
                WHERE p.type = 'material'
                  AND t.quantity <> 0
                  AND t.transaction_type IN ('transfer_out', 'transfer_in', 'production_out', 'production_in')
                  {since_filter}
                ORDER BY t.id
            """), {"since": updated_since}).fetchall()
        ]
        # Phiếu nhập không có cột cập nhật: lấy lần cuối dòng phiếu làm đổi tồn (tạo/sửa), không có thì ngày phiếu.
        purchase_lines = []
        for r in self.db.execute(text("""
            SELECT poi.id, poi.product_variant_id, poi.quantity, po.po_code, po.order_date,
                   po.warehouse_id, s.name, lt.last_at, po.id, po.status
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchase_order_id
            JOIN product_variants v ON v.id = poi.product_variant_id
            JOIN products p ON p.id = v.product_id
            LEFT JOIN suppliers s ON s.id = po.supplier_id
            LEFT JOIN (
                SELECT reference_id, product_variant_id, MAX(created_at) AS last_at
                FROM inventory_transactions
                WHERE transaction_type = 'purchase_in'
                GROUP BY reference_id, product_variant_id
            ) lt ON lt.reference_id = po.id AND lt.product_variant_id = poi.product_variant_id
            WHERE p.type = 'material'
              AND poi.quantity <> 0
            ORDER BY poi.id
        """)).fetchall():
            changed_at = r[7] or (datetime.combine(r[4], datetime.min.time()) if r[4] else None)
            if updated_since and (changed_at is None or changed_at < updated_since):
                continue
            purchase_lines.append({
                "id": int(r[0]),
                "material_id": int(r[1]),
                "qty": float(r[2] or 0),
                "code": r[3],
                "date": r[4],
                "warehouse_id": int(r[5]) if r[5] is not None else None,
                "supplier": r[6],
                "created_at": changed_at,
                "po_id": int(r[8]),
                "status": r[9],
                "deleted": r[9] == "cancelled",
                "deleted_by": None,
            })
        purchase_lines += [
            d for d in self._deleted_purchase_lines(updated_since) if d["product_type"] == "material"
        ]
        if not ledger and not purchase_lines:
            return []

        orders = {
            int(r[0]): {"code": parse_cancelled_code(r[1])[0], "warehouse_id": r[2]}
            for r in self.db.execute(text("SELECT id, code, warehouse_id FROM production_orders")).fetchall()
        }
        materials = self._load_materials({r["material_id"] for r in ledger + purchase_lines})
        if kind_label:
            keep = {mid for mid, m in materials.items() if classify_material(m["unit"], m["group"]) == kind_label}
            ledger = [r for r in ledger if r["material_id"] in keep]
            purchase_lines = [r for r in purchase_lines if r["material_id"] in keep]
        users = self._user_names()
        order_actors = self._order_actors({r["ref"] for r in ledger if r["ref"] is not None})
        purchase_creators = self._purchase_creators(users)

        def _wh(wid):
            return warehouses.get(wid, {}).get("name") if wid else None

        def _wh_kind(wid):
            if not wid or wid not in warehouses:
                return None
            return CENTRAL_LABEL if warehouses[wid]["central"] else WORKSHOP_LABEL

        def _ledger_creator(r, from_order: bool):
            if r["created_by"] is not None:
                return users.get(int(r["created_by"]))
            if from_order and r["ref"] is not None:
                return nearest_actor(order_actors.get(r["ref"], []), r["created_at"])
            return None

        def _entry(r, move_type, qty, from_wid, to_wid, place_wid=None, doc=None, ma_sx=None, supplier=None,
                   day=None, note=None, id_prefix="SK", status=DOC_APPROVED, deleted=False, creator=None):
            m = materials.get(r["material_id"], {})
            row_id = f"{id_prefix}-{r['id']}"
            place_wid = place_wid or to_wid or from_wid
            return {
                "id_dong": row_id,
                "ngay": _iso_date(day or r["created_at"]),
                "loai_phieu": move_type,
                "so_phieu": doc,
                "trang_thai": status,
                "da_xoa": deleted,
                "id_vat_tu": r["material_id"],
                "ma_vat_tu": m.get("sku"),
                "ten_vat_tu": m.get("name"),
                "nhom_vat_tu": m.get("group"),
                "mau_hoa_tiet": m.get("color"),
                "loai_vat_tu": classify_material(m.get("unit"), m.get("group")),
                "dvt": m.get("unit"),
                "so_luong": _f(abs(qty), 6),
                "so_cay": None,
                "ma_sx": ma_sx,
                "kho_xuat": _wh(from_wid),
                "loai_kho_xuat": _wh_kind(from_wid),
                "kho_nhap": _wh(to_wid),
                "loai_kho_nhap": _wh_kind(to_wid),
                "kho_hoac_xuong": _wh(place_wid),
                "ncc": supplier,
                "nhan_hang": brands.get(warehouses.get(place_wid, {}).get("brand_id")),
                "nguoi_tao": creator,
                "ghi_chu": note,
                "cap_nhat_luc": to_iso(r["created_at"]),
                "_sort": (r["created_at"] or datetime.min, row_id),
            }

        rows = []
        for r in purchase_lines:
            if not _allowed(r["warehouse_id"]):
                continue
            wid = r["warehouse_id"]
            note = None
            if r.get("deleted_at"):
                deleter = users.get(int(r["deleted_by"])) if r["deleted_by"] is not None else None
                note = f"Đã xóa trên web bởi {deleter}" if deleter else "Đã xóa trên web"
            rows.append(_entry(
                r, MOVE_PURCHASE, r["qty"], None if r["qty"] > 0 else wid, wid if r["qty"] > 0 else None,
                doc=r["code"], supplier=r["supplier"], day=r["date"], note=note, id_prefix="PN",
                status=DOC_DRAFT if r["status"] == "pending" else DOC_APPROVED, deleted=r["deleted"],
                creator=purchase_creators.get((r["po_id"], r["material_id"])),
            ))

        for r in ledger:
            if r["type"] not in ("production_out", "production_in"):
                continue
            wid = r["warehouse_id"]
            order = orders.get(r["ref"], {})
            # Xuất cho lệnh ghi âm, hoàn về ghi dương: net > 0 là NVL rời kho/xưởng sang lệnh.
            net = -r["qty"]
            creator = _ledger_creator(r, from_order=True)
            if warehouses.get(wid, {}).get("central"):
                # NVL đi thẳng từ kho tổng cho lệnh / trả về kho tổng khi hủy hoặc sửa lệnh: tồn xưởng không đổi,
                # nên vế xưởng để trống, xưởng của lệnh chỉ ghi ở kho_hoac_xuong.
                if not _allowed(wid):
                    continue
                workshop = order.get("warehouse_id") if order.get("warehouse_id") != wid else None
                if net > 0:
                    rows.append(_entry(r, MOVE_ISSUE, net, wid, None, place_wid=workshop or wid,
                                       ma_sx=order.get("code"), note=r["note"], creator=creator))
                else:
                    rows.append(_entry(r, MOVE_RETURN, net, None, wid, place_wid=workshop or wid,
                                       ma_sx=order.get("code"), note=r["note"], creator=creator))
            elif include_consumption and _allowed(wid):
                if net > 0:
                    rows.append(_entry(r, MOVE_CONSUME, net, wid, None, ma_sx=order.get("code"),
                                       note=r["note"], creator=creator))
                else:
                    rows.append(_entry(r, MOVE_CONSUME_RETURN, net, None, wid, ma_sx=order.get("code"),
                                       note=r["note"], creator=creator))

        for out_row, in_row in pair_transfers([r for r in ledger if r["type"] in ("transfer_out", "transfer_in")]):
            base = out_row or in_row
            from_wid = out_row["warehouse_id"] if out_row else None
            to_wid = in_row["warehouse_id"] if in_row else None
            if not _allowed(from_wid, to_wid):
                continue
            from_central = warehouses[from_wid]["central"] if from_wid in warehouses else None
            to_central = warehouses[to_wid]["central"] if to_wid in warehouses else None
            move_type = classify_transfer(from_central, to_central)
            place = from_wid if move_type == MOVE_RETURN else (to_wid or from_wid)
            auto = (base["tag"] or "").startswith("AUTO:")
            ma_sx = orders.get(base["ref"], {}).get("code") if auto else None
            rows.append(_entry(
                base, move_type, base["qty"], from_wid, to_wid, place_wid=place,
                doc=base["tag"] or f"DC-{base['id']}", ma_sx=ma_sx, note=base["note"],
                creator=_ledger_creator(base, from_order=auto),
            ))

        rows.sort(key=lambda x: x.pop("_sort"))
        return rows

    def _user_names(self) -> Dict[int, str]:
        return {
            int(r[0]): (r[1] or "").strip() or r[2]
            for r in self.db.execute(text("SELECT id, full_name, username FROM users")).fetchall()
        }

    def _order_actors(self, order_ids) -> Dict[int, List[tuple]]:
        """Lệnh -> [(thời điểm snapshot, người làm)] để đoán người tạo các dòng sổ kho do lệnh sinh ra."""
        if not order_ids:
            return {}
        actors: Dict[int, List[tuple]] = {}
        for oid, created_at, full_name, username in self.db.execute(text(f"""
            SELECT s.production_order_id, s.created_at, u.full_name, u.username
            FROM production_order_snapshots s
            JOIN users u ON u.id = s.actor_user_id
            WHERE s.production_order_id IN ({_ids_csv(order_ids)})
        """)).fetchall():
            if created_at is not None:
                actors.setdefault(int(oid), []).append((created_at, (full_name or "").strip() or username))
        for lst in actors.values():
            lst.sort(key=lambda x: x[0])
        return actors

    def _purchase_creators(self, users: Dict[int, str]) -> Dict[tuple, str]:
        """(phiếu nhập, vật tư) -> người của dòng sổ kho nhập đầu tiên có ghi người làm (ghi từ 12/10/2026)."""
        creators: Dict[tuple, str] = {}
        for ref, vid, uid in self.db.execute(text("""
            SELECT reference_id, product_variant_id, created_by
            FROM inventory_transactions
            WHERE transaction_type = 'purchase_in' AND created_by IS NOT NULL AND reference_id IS NOT NULL
            ORDER BY id
        """)).fetchall():
            creators.setdefault((int(ref), int(vid)), users.get(int(uid)))
        return creators

    def _deleted_purchase_lines(self, updated_since: Optional[datetime] = None) -> List[Dict]:
        """Dòng phiếu nhập đã xóa (web ghi lại từ 12/10/2026). Bảng chưa có thì chưa có dòng nào bị xóa."""
        exists = self.db.execute(text("""
            SELECT COUNT(1) FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = :t
        """), {"t": PURCHASE_DELETION_TABLE}).scalar()
        if not exists:
            return []
        since_filter = "AND d.deleted_at >= :since" if updated_since else ""
        return [
            {
                "id": int(r[0]),
                "po_id": int(r[1]),
                "code": r[2],
                "date": r[3],
                "status": r[4],
                "warehouse_id": int(r[5]) if r[5] is not None else None,
                "supplier": r[6],
                "material_id": int(r[7]),
                "qty": float(r[8] or 0),
                "price": float(r[9]) if r[9] is not None else None,
                "deleted_by": r[10],
                "deleted_at": r[11],
                "created_at": r[11],
                "deleted": True,
                "product_type": r[12],
                "sku": (r[13] or "").strip() or None,
                "name": (r[14] or "").strip() or None,
                "unit": (r[15] or "").strip() or None,
                "warehouse": r[16],
                "brand": r[17],
                "brand_id": r[18],
                "group": r[19],
            }
            for r in self.db.execute(text(f"""
                SELECT d.purchase_order_item_id, d.purchase_order_id, d.po_code, d.order_date, d.po_status,
                       d.warehouse_id, d.supplier_name, d.product_variant_id, d.quantity, d.unit_price,
                       d.deleted_by, d.deleted_at, p.type, v.sku, v.variant_name, p.base_unit,
                       w.name, b.name, w.brand_id, p.name
                FROM {PURCHASE_DELETION_TABLE} d
                JOIN product_variants v ON v.id = d.product_variant_id
                JOIN products p ON p.id = v.product_id
                LEFT JOIN warehouses w ON w.id = d.warehouse_id
                LEFT JOIN brands b ON b.id = w.brand_id
                WHERE 1 = 1 {since_filter}
                ORDER BY d.id
            """), {"since": updated_since}).fetchall()
        ]

    def get_purchases(self, updated_since: Optional[datetime] = None) -> List[Dict]:
        """
        Mỗi dòng = 1 dòng hàng của 1 phiếu nhập NCC (màn "Nhập Hàng"), kèm đơn giá và thành tiền.
        Phiếu/dòng bị xóa từ 12/10/2026 vẫn trả về với da_xoa = true. Web không lưu thời điểm sửa phiếu:
        cap_nhat_luc = lần cuối dòng làm đổi tồn kho (tạo, sửa số lượng), không có thì ngày phiếu.
        """
        brand_filter = ""
        if self.brand_ids is not None:
            if not self.brand_ids:
                return []
            brand_filter = f"AND w.brand_id IN ({_ids_csv(self.brand_ids)})"
        rows = []
        for r in self.db.execute(text(f"""
            SELECT poi.id, po.po_code, po.order_date, po.status, s.name, w.name, b.name,
                   v.sku, v.variant_name, p.type, p.base_unit,
                   poi.quantity, poi.unit_price, poi.subtotal, po.total_amount, lt.last_at, v.id, p.name
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchase_order_id
            JOIN product_variants v ON v.id = poi.product_variant_id
            JOIN products p ON p.id = v.product_id
            LEFT JOIN suppliers s ON s.id = po.supplier_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            LEFT JOIN brands b ON b.id = w.brand_id
            LEFT JOIN (
                SELECT reference_id, product_variant_id, MAX(created_at) AS last_at
                FROM inventory_transactions
                WHERE transaction_type = 'purchase_in'
                GROUP BY reference_id, product_variant_id
            ) lt ON lt.reference_id = po.id AND lt.product_variant_id = poi.product_variant_id
            WHERE 1 = 1 {brand_filter}
            ORDER BY poi.id
        """)).fetchall():
            changed_at = r[15] or (datetime.combine(r[2], datetime.min.time()) if r[2] else None)
            if updated_since and (changed_at is None or changed_at < updated_since):
                continue
            unit = (r[10] or "").strip() or None
            rows.append({
                "id": f"PN-{r[0]}",
                "so_phieu": r[1],
                "ngay": _iso_date(r[2]),
                "trang_thai": r[3],
                "ncc": r[4],
                "kho": r[5],
                "nhan_hang": r[6],
                "id_vat_tu": int(r[16]),
                "ma_hang": (r[7] or "").strip() or None,
                "ten_hang": (r[8] or "").strip() or None,
                "loai_hang": FINISHED_GOOD if r[9] == "finished_good" else classify_material(unit, r[17]),
                "dvt": unit,
                "so_luong": _f(r[11], 4),
                "don_gia": _f(r[12]),
                "thanh_tien": _f(r[13]),
                "tong_tien_phieu": _f(r[14]),
                "da_xoa": r[3] == "cancelled",
                "cap_nhat_luc": to_iso(changed_at),
            })
        for d in self._deleted_purchase_lines(updated_since):
            if self.brand_ids is not None and d["brand_id"] not in self.brand_ids:
                continue
            rows.append({
                "id": f"PN-{d['id']}",
                "so_phieu": d["code"],
                "ngay": _iso_date(d["date"]),
                "trang_thai": d["status"],
                "ncc": d["supplier"],
                "kho": d["warehouse"],
                "nhan_hang": d["brand"],
                "id_vat_tu": d["material_id"],
                "ma_hang": d["sku"],
                "ten_hang": d["name"],
                "loai_hang": FINISHED_GOOD if d["product_type"] == "finished_good" else classify_material(d["unit"], d["group"]),
                "dvt": d["unit"],
                "so_luong": _f(d["qty"], 4),
                "don_gia": _f(d["price"]),
                "thanh_tien": _f(d["qty"] * d["price"]) if d["price"] is not None else None,
                "tong_tien_phieu": None,
                "da_xoa": True,
                "cap_nhat_luc": to_iso(d["deleted_at"]),
            })
        return rows

    def get_finished_receipts(self, updated_since: Optional[datetime] = None) -> List[Dict]:
        """
        Nhập kho thành phẩm theo đợt: mỗi dòng = 1 đợt xưởng trả hàng của 1 dòng SKU/size,
        cộng các lần sửa tay số "Đã trả" (so_luong = chênh lệch, có thể âm).
        Tổng so_luong theo id_dong = so_luong_da_ve của /lenh-sx (trừ đợt bị hoàn tác: web xóa hẳn đợt đó).
        """
        brand_filter = ""
        if self.brand_ids is not None:
            if not self.brand_ids:
                return []
            brand_filter = f"AND COALESCE(ow.brand_id, w.brand_id) IN ({_ids_csv(self.brand_ids)})"
        order_join = f"""
            JOIN production_order_items i ON i.id = l.production_order_item_id
            JOIN production_orders po ON po.id = i.production_order_id
            LEFT JOIN product_variants pv ON pv.id = po.product_variant_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            LEFT JOIN warehouses ow ON ow.id = po.owner_central_id
            LEFT JOIN brands b ON b.id = COALESCE(ow.brand_id, w.brand_id)
        """
        since_filter = "AND {col} >= :since" if updated_since else ""
        common_cols = "i.id, i.size_label, i.note, po.code, pv.sku, w.name, b.name"

        events = [
            (r[0], RECEIVE_BATCH, r[1], float(r[2] or 0), None, None, None, r[3:])
            for r in self.db.execute(text(f"""
                SELECT l.id, l.received_at, l.quantity, {common_cols}
                FROM production_receive_logs l
                {order_join}
                WHERE 1 = 1 {brand_filter} {since_filter.format(col="l.received_at")}
            """), {"since": updated_since}).fetchall()
        ]
        has_adjust_table = self.db.execute(text("""
            SELECT COUNT(1) FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'production_finished_adjust_logs'
        """)).scalar()
        if has_adjust_table:
            events += [
                (r[0], RECEIVE_ADJUST, r[1], float(r[2] or 0), float(r[3] or 0), float(r[4] or 0), r[5], r[6:])
                for r in self.db.execute(text(f"""
                    SELECT l.id, l.created_at, l.delta, l.old_quantity, l.new_quantity, l.reason, {common_cols}
                    FROM production_finished_adjust_logs l
                    {order_join}
                    WHERE 1 = 1 {brand_filter} {since_filter.format(col="l.created_at")}
                """), {"since": updated_since}).fetchall()
            ]

        rows = []
        for log_id, kind, at, qty, old_qty, new_qty, reason, (item_id, label, note, code, product_sku, workshop, brand) in events:
            sku, sku_name = parse_item_label(label, note)
            size, color = split_size_color(sku_name)
            row_id = f"{'NK' if kind == RECEIVE_BATCH else 'SL'}-{log_id}"
            rows.append({
                "id": row_id,
                "thoi_gian": to_iso(at),
                "loai": kind,
                "ma_sx": parse_cancelled_code(code)[0],
                "ma_sp": model_code_from_label(label) or parse_cancelled_code(product_sku)[0] or None,
                "sku": sku,
                "ten_sku": sku_name or None,
                "size": size,
                "mau": color,
                "so_luong": _f(qty),
                "so_cu": old_qty,
                "so_moi": new_qty,
                "ly_do": reason,
                "xuong": workshop,
                "nhan_hang": brand,
                "id_dong": int(item_id),
                "cap_nhat_luc": to_iso(at),
                "_sort": (at or datetime.min, row_id),
            })
        rows.sort(key=lambda x: x.pop("_sort"))
        return rows

    def get_material_stock(self, updated_since: Optional[datetime] = None, material_kind: Optional[str] = None) -> List[Dict]:
        """
        Tồn vật tư hiện tại theo từng kho tổng / xưởng (inventory_stocks). material_kind = vai|npl|None.
        Vải = vật tư có ĐVT kg/m/yard; web hay ghi tên/mã nhóm vào ô ĐVT nên có vải bị xếp NPL.
        Bảng tồn không lưu thời điểm đổi: cap_nhat_luc = lần cuối sổ kho ghi nhận vật tư đó tại kho đó.
        Lấy toàn bộ thì bỏ dòng tồn 0; lấy dần (updated_since) thì trả cả dòng vừa về 0 để Sheets cập nhật.
        """
        brand_filter = ""
        if self.brand_ids is not None:
            if not self.brand_ids:
                return []
            brand_filter = f"AND w.brand_id IN ({_ids_csv(self.brand_ids)})"
        kind_label = classify_material_filter(material_kind)
        stock_rows = self.db.execute(text(f"""
            SELECT s.product_variant_id, s.quantity_on_hand, w.name, w.is_central, b.name, lt.last_at
            FROM inventory_stocks s
            JOIN warehouses w ON w.id = s.warehouse_id
            LEFT JOIN brands b ON b.id = w.brand_id
            JOIN product_variants v ON v.id = s.product_variant_id
            JOIN products p ON p.id = v.product_id
            LEFT JOIN (
                SELECT warehouse_id, product_variant_id, MAX(created_at) AS last_at
                FROM inventory_transactions
                GROUP BY warehouse_id, product_variant_id
            ) lt ON lt.warehouse_id = s.warehouse_id AND lt.product_variant_id = s.product_variant_id
            WHERE p.type = 'material' {brand_filter}
        """)).fetchall()
        materials = self._load_materials({int(r[0]) for r in stock_rows})
        rows = []
        for vid, qty, warehouse, is_central, brand, last_at in stock_rows:
            m = materials.get(int(vid), {})
            kind = classify_material(m.get("unit"), m.get("group"))
            if kind_label and kind != kind_label:
                continue
            qty = float(qty or 0)
            if updated_since:
                if last_at is None or last_at < updated_since:
                    continue
            elif abs(qty) < 1e-9:
                continue
            price = m.get("price")
            rows.append({
                "id_vat_tu": int(vid),
                "ma_vat_tu": m.get("sku"),
                "ten_vat_tu": m.get("name"),
                "nhom_vat_tu": m.get("group"),
                "mau_hoa_tiet": m.get("color"),
                "loai_vat_tu": kind,
                "dvt": m.get("unit"),
                "kho": warehouse,
                "loai_kho": CENTRAL_LABEL if is_central else WORKSHOP_LABEL,
                "so_luong_ton": _f(qty, 4),
                "don_gia": _f(price),
                "gia_tri_ton": _f(qty * price) if price is not None else None,
                "ncc": m.get("supplier"),
                "nhan_hang": brand,
                "cap_nhat_luc": to_iso(last_at),
            })
        rows.sort(key=lambda x: ((x["ma_vat_tu"] or "").upper(), x["kho"] or "", x["id_vat_tu"]))
        return rows

    def get_material_orders(
        self,
        material_id: Optional[int] = None,
        material_sku: Optional[str] = None,
        material_kind: Optional[str] = None,
    ) -> List[Dict]:
        """
        Vật tư nằm ở đơn (lệnh SX) nào, bao nhiêu: mỗi dòng = 1 vật tư trong 1 đơn, giống popup "Đơn hàng"
        trong Kho Vật Tư. Đơn nháp: lượng dự kiến theo định mức (chưa trừ tồn); đơn đã chạy/hoàn thành:
        lượng đã xuất kho. Đơn đã hủy không trả về. Luôn trả toàn bộ (web không lưu thời điểm đổi trạng thái).
        """
        conditions = []
        if self.brand_ids is not None:
            if not self.brand_ids:
                return []
            conditions.append(f"COALESCE(ow.brand_id, w.brand_id) IN ({_ids_csv(self.brand_ids)})")
        lines = ProductionService(self.db).material_order_rows(material_id, conditions)
        materials = self._load_materials({r["material_id"] for r in lines})
        kind_label = classify_material_filter(material_kind)
        sku_filter = (material_sku or "").strip().lower()

        rows = []
        for r in lines:
            m = materials.get(r["material_id"], {})
            kind = classify_material(m.get("unit"), m.get("group"))
            if kind_label and kind != kind_label:
                continue
            if sku_filter and (m.get("sku") or "").lower() != sku_filter:
                continue
            rows.append({
                "id_vat_tu": r["material_id"],
                "ma_vat_tu": m.get("sku"),
                "ten_vat_tu": m.get("name"),
                "nhom_vat_tu": m.get("group"),
                "mau_hoa_tiet": m.get("color"),
                "loai_vat_tu": kind,
                "dvt": m.get("unit"),
                "id_don": r["order_id"],
                "ma_don": (r["code"] or "").strip(),
                "ten_don": (r["product_name"] or "").strip(),
                "ngay_tao_don": _iso_date(r["created_at"]),
                "trang_thai_vai": r["material_status"],
                "da_tru_ton": r["status"] in RESERVATION_STATUSES,
                "so_luong": _f(r["quantity"], 4),
                "xuong": r["warehouse_name"],
                "nhan_hang": r["brand_name"],
            })
        rows.sort(key=lambda x: ((x["ma_vat_tu"] or "").upper(), x["id_vat_tu"], x["id_don"]))
        return rows

    def get_fabric_stock(self, updated_since: Optional[datetime] = None, fabric_only: bool = True) -> List[Dict]:
        """/ton-vai cũ: như /ton-vat-tu nhưng trường mã/tên là ma_vai/ten_vai."""
        renamed = {"ma_vat_tu": "ma_vai", "ten_vat_tu": "ten_vai"}
        return [
            {renamed.get(k, k): v for k, v in row.items()}
            for row in self.get_material_stock(updated_since, "vai" if fabric_only else None)
        ]

    def _material_ids_for_brands(self) -> set:
        """Vật tư dùng chung giữa các nhãn: chỉ trả vật tư từng dùng/nhập/tồn ở nhãn được phép."""
        if not self.brand_ids:
            return set()
        brands = _ids_csv(self.brand_ids)
        rows = self.db.execute(text(f"""
            SELECT bm.material_variant_id
            FROM bom_materials bm
            JOIN bom b ON b.id = bm.bom_id
            JOIN production_orders po ON po.product_variant_id = b.product_variant_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            LEFT JOIN warehouses ow ON ow.id = po.owner_central_id
            WHERE COALESCE(ow.brand_id, w.brand_id) IN ({brands})
            UNION
            SELECT pmr.material_variant_id
            FROM production_material_reservations pmr
            JOIN production_orders po ON po.id = pmr.production_order_id
            LEFT JOIN warehouses w ON w.id = po.warehouse_id
            LEFT JOIN warehouses ow ON ow.id = po.owner_central_id
            WHERE COALESCE(ow.brand_id, w.brand_id) IN ({brands})
            UNION
            SELECT poi.product_variant_id
            FROM purchase_order_items poi
            JOIN purchase_orders po ON po.id = poi.purchase_order_id
            JOIN warehouses w ON w.id = po.warehouse_id
            WHERE w.brand_id IN ({brands})
            UNION
            SELECT s.product_variant_id
            FROM inventory_stocks s
            JOIN warehouses w ON w.id = s.warehouse_id
            WHERE w.brand_id IN ({brands})
        """)).fetchall()
        return {int(r[0]) for r in rows}
