"""
Dữ liệu chỉ đọc cho tích hợp bên ngoài (Google Sheets của Unbee): BOM, giá vốn, danh mục NPL.

Web lưu BOM theo từng lệnh sản xuất, không theo mã sản phẩm. Mã sản phẩm (VD QA388) được
suy ra từ các dòng SKU của lệnh (production_order_items.size_label = "SKU:QA38801||TEN:...").
Một mã sản phẩm lấy theo lệnh gần nhất (id lớn nhất, bỏ lệnh đã hủy) có chứa mã đó.

Nguồn dòng vật tư giống màn "Quản lý đơn":
- Lệnh nháp / chờ NVL: bảng bom_materials (định mức kế hoạch).
- Lệnh đang SX / hoàn thành: bảng production_material_reservations (lượng NVL đã giữ/cấp).
"""
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

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


def classify_material(base_unit: Optional[str]) -> str:
    """Web chưa phân loại vật tư; tạm suy ra từ đơn vị tính (kg/m... là vải)."""
    unit = str(base_unit or "").strip().lower()
    if unit in FABRIC_UNITS or "vải" in unit:
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
                "supplier": None,
                "price_changed_at": None,
            }
            for r in self.db.execute(text(f"""
                SELECT v.id, v.sku, v.variant_name, p.base_unit, v.cost_price
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
                    "loai_vat_tu": classify_material(m.get("unit")),
                    "hang_muc": None,
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
                if classify_material(m.get("unit")) == "Vải":
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
                "ma_npl": m["sku"],
                "ten": m["name"],
                "loai_vat_tu": classify_material(m["unit"]),
                "dvt": m["unit"],
                "ncc": m["supplier"],
                "don_gia": _f(m["price"]),
                "leadtime_tuan": None,
                "lo_toi_thieu": None,
                "cap_nhat_luc": to_iso(m["price_changed_at"]),
            })
        return rows

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
