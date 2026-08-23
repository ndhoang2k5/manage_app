import json
import os
import threading
import time
from copy import deepcopy
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from services.salesManagementService import SalesManagementService


# Salework report/product only returns shopId + products, not the shop name.
# Keep the business mapping in one place until it is moved to an admin-managed DB table.
HOUSEHOLD_CONFIGS: Dict[str, Dict] = {
    "le_doan_bac": {
        "key": "le_doan_bac",
        "name": "Hộ kinh doanh Lê Doãn Bắc",
        "expected_shop_names": ["Unbee Việt Nam", "Unbee Baby"],
        "shops": [
            {
                "brand_key": "unbee",
                "channel": "Tiktok",
                "shop_id": "7494799271700827004",
                "shop_name": "TikTok Unbee (chờ đối chiếu tên)",
                "provisional": True,
            },
            {
                "brand_key": "unbee",
                "channel": "Tiktok",
                "shop_id": "7495100035829696886",
                "shop_name": "TikTok Unbee (chờ đối chiếu tên)",
                "provisional": True,
            },
        ],
    },
    "unbeekid": {
        "key": "unbeekid",
        "name": "Hộ kinh doanh UnbeeKid",
        "expected_shop_names": [
            "Unbee Fashion",
            "Unbee Baby",
            "UNBEE Mom & Baby",
            "Unbee (Lazada)",
            "Ranbee (TikTok)",
        ],
        "shops": [
            {
                "brand_key": "unbee",
                "channel": "Shopee",
                "shop_id": "1299057191",
                "shop_name": "Unbee Fashion",
                "provisional": False,
            },
            {
                "brand_key": "unbee",
                "channel": "Shopee",
                "shop_id": "585510534",
                "shop_name": "Unbee Baby",
                "provisional": False,
            },
            {
                "brand_key": "unbee",
                "channel": "Shopee",
                "shop_id": "943867691",
                "shop_name": "UNBEE Mom & Baby",
                "provisional": False,
            },
            {
                "brand_key": "unbee",
                "channel": "Lazada",
                "shop_id": "Unbeeflagshipstore@gmail.com",
                "shop_name": "Unbee",
                "provisional": False,
            },
            {
                "brand_key": "ranbee",
                "channel": "Tiktok",
                "shop_id": "7494200311963486201",
                "shop_name": "Ranbee (ứng viên 1)",
                "provisional": True,
            },
            {
                "brand_key": "ranbee",
                "channel": "Tiktok",
                "shop_id": "7495762860384487671",
                "shop_name": "Ranbee (ứng viên 2)",
                "provisional": True,
            },
        ],
    },
}

# Stock is not returned by shopId. Both household reports therefore use the
# same product-code stock scope: all Salework accounts that feed either HKD.
HOUSEHOLD_STOCK_BRAND_KEYS: Set[str] = {
    str(shop.get("brand_key") or "").strip().lower()
    for config in HOUSEHOLD_CONFIGS.values()
    for shop in (config.get("shops") or [])
    if str(shop.get("brand_key") or "").strip()
}

_REPORT_CACHE: Dict[Tuple, Tuple[float, Dict]] = {}
_REPORT_CACHE_LOCK = threading.Lock()
_REPORT_CACHE_MAX_ENTRIES = 32


def _shop_key(brand_key: str, channel: str, shop_id: str) -> Tuple[str, str, str]:
    return (
        str(brand_key or "").strip().lower(),
        str(channel or "").strip().lower(),
        str(shop_id or "").strip().lower(),
    )


class HouseholdSalesService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def list_households() -> List[Dict]:
        return [
            {
                "key": config["key"],
                "name": config["name"],
                "expected_shop_names": list(config.get("expected_shop_names") or []),
                "shops": [dict(shop) for shop in config.get("shops") or []],
            }
            for config in HOUSEHOLD_CONFIGS.values()
        ]

    @staticmethod
    def _get_config(household_key: str) -> Dict:
        key = str(household_key or "").strip().lower()
        config = HOUSEHOLD_CONFIGS.get(key)
        if not config:
            raise ValueError("Hộ kinh doanh không hợp lệ")
        return config

    def _load_stock(self, codes: List[str], brand_keys: Set[str]) -> Dict[str, float]:
        result: Dict[str, float] = defaultdict(float)
        if not codes or not brand_keys:
            return {}

        unique_codes = sorted(set(codes))
        unique_brands = sorted(set(brand_keys))
        batch_size = 500
        for start in range(0, len(unique_codes), batch_size):
            batch = unique_codes[start:start + batch_size]
            params: Dict = {}
            code_clause = SalesManagementService._build_in_clause("hh_code", batch, params)
            brand_clause = SalesManagementService._build_in_clause("hh_brand", unique_brands, params)
            rows = self.db.execute(
                text(
                    f"""
                    SELECT code, SUM(total_stock)
                    FROM sales_product_stock_current
                    WHERE brand_key IN ({brand_clause})
                      AND code IN ({code_clause})
                    GROUP BY code
                    """
                ),
                params,
            ).fetchall()
            for code, quantity in rows:
                result[str(code).strip().upper()] += float(quantity or 0)
        return dict(result)

    def _get_stock_status(self, brand_keys: Set[str]) -> Dict:
        """Return freshness metadata for the combined SKU stock snapshot."""
        if self.db is None or not brand_keys:
            return {
                "latest_stock_synced_at_ms": 0,
                "oldest_stock_synced_at_ms": 0,
                "stock_synced_at_by_brand": {},
            }

        params: Dict = {}
        brand_clause = SalesManagementService._build_in_clause(
            "hh_stock_status_brand",
            sorted(set(brand_keys)),
            params,
        )
        rows = self.db.execute(
            text(
                f"""
                SELECT brand_key, MAX(synced_at_ms)
                FROM sales_product_stock_current
                WHERE brand_key IN ({brand_clause})
                GROUP BY brand_key
                """
            ),
            params,
        ).fetchall()
        synced_by_brand = {
            str(brand_key): int(synced_at_ms or 0)
            for brand_key, synced_at_ms in rows
        }
        sync_times = [value for value in synced_by_brand.values() if value > 0]
        return {
            "latest_stock_synced_at_ms": max(sync_times, default=0),
            "oldest_stock_synced_at_ms": min(sync_times, default=0),
            "stock_synced_at_by_brand": synced_by_brand,
        }

    def _fetch_selected_runs_with_payload(
        self,
        brand_service: SalesManagementService,
        time_start: int,
        time_end: int,
    ) -> List[Tuple]:
        """Select non-nested windows first, then load payload only for those runs."""
        windows = brand_service._fetch_run_windows(
            time_start=int(time_start),
            time_end=int(time_end),
            exclude_nested=True,
        )
        run_ids = [int(run[0]) for run in windows if run and run[0] is not None]
        if not run_ids:
            return []

        payload_by_id: Dict[int, object] = {}
        batch_size = 500
        for start in range(0, len(run_ids), batch_size):
            batch = run_ids[start:start + batch_size]
            params: Dict = {"brand_key": brand_service.brand_key}
            id_clause = SalesManagementService._build_in_clause("hh_run", batch, params)
            rows = self.db.execute(
                text(
                    f"""
                    SELECT id, raw_payload
                    FROM sales_report_runs
                    WHERE brand_key = :brand_key
                      AND id IN ({id_clause})
                    """
                ),
                params,
            ).fetchall()
            for run_id, raw_payload in rows:
                payload_by_id[int(run_id)] = raw_payload

        return [
            (int(run[0]), int(run[1]), int(run[2]), payload_by_id.get(int(run[0])))
            for run in windows
            if int(run[0]) in payload_by_id
        ]

    @staticmethod
    def _cache_ttl_seconds() -> int:
        return max(0, int(os.getenv("HOUSEHOLD_SALES_CACHE_TTL_SECONDS", "300")))

    @classmethod
    def _cache_get(cls, key: Tuple) -> Optional[Dict]:
        ttl = cls._cache_ttl_seconds()
        if ttl <= 0:
            return None
        now = time.monotonic()
        with _REPORT_CACHE_LOCK:
            cached = _REPORT_CACHE.get(key)
            if not cached:
                return None
            created_at, data = cached
            if now - created_at > ttl:
                _REPORT_CACHE.pop(key, None)
                return None
            return data

    @classmethod
    def _cache_set(cls, key: Tuple, data: Dict) -> None:
        ttl = cls._cache_ttl_seconds()
        if ttl <= 0:
            return
        now = time.monotonic()
        with _REPORT_CACHE_LOCK:
            expired = [
                cache_key for cache_key, (created_at, _data) in _REPORT_CACHE.items()
                if now - created_at > ttl
            ]
            for cache_key in expired:
                _REPORT_CACHE.pop(cache_key, None)
            if len(_REPORT_CACHE) >= _REPORT_CACHE_MAX_ENTRIES:
                oldest_key = min(_REPORT_CACHE, key=lambda cache_key: _REPORT_CACHE[cache_key][0])
                _REPORT_CACHE.pop(oldest_key, None)
            _REPORT_CACHE[key] = (now, deepcopy(data))

    @staticmethod
    def _paginate_result(data: Dict, page: int, page_size: int) -> Dict:
        safe_page = max(1, int(page or 1))
        safe_page_size = max(1, min(int(page_size or 50), 5000))
        offset = (safe_page - 1) * safe_page_size
        all_items = data.get("items") or []
        result = {
            key: deepcopy(value)
            for key, value in data.items()
            if key != "items"
        }
        result["items"] = deepcopy(all_items[offset:offset + safe_page_size])
        result["page"] = safe_page
        result["page_size"] = safe_page_size
        return result

    def get_report(
        self,
        household_key: str,
        time_start: int,
        time_end: int,
        keyword: Optional[str] = None,
        min_qty: float = 0,
        min_revenue: float = 0,
        page: int = 1,
        page_size: int = 50,
        sort_by: str = "sold_qty",
        sort_dir: str = "desc",
        top_n: int = 0,
    ) -> Dict:
        if int(time_start) >= int(time_end):
            raise ValueError("Khoảng thời gian không hợp lệ")

        config = self._get_config(household_key)
        cache_key = (
            config["key"],
            int(time_start),
            int(time_end),
            str(keyword or "").strip().lower(),
            float(min_qty or 0),
            float(min_revenue or 0),
            str(sort_by or "sold_qty").lower(),
            str(sort_dir or "desc").lower(),
            max(0, int(top_n or 0)),
        )
        cached = self._cache_get(cache_key)
        if cached is not None:
            cached_page = self._paginate_result(cached, page, page_size)
            cached_page["cache_hit"] = True
            return cached_page

        mappings = [dict(shop) for shop in config.get("shops") or []]
        mapping_by_key = {
            _shop_key(shop["brand_key"], shop["channel"], shop["shop_id"]): shop
            for shop in mappings
        }
        mappings_by_brand: Dict[str, List[Dict]] = defaultdict(list)
        for shop in mappings:
            mappings_by_brand[shop["brand_key"]].append(shop)

        aggregate: Dict[str, Dict] = {}
        seen_shop_keys: Set[Tuple[str, str, str]] = set()
        runs_by_brand: Dict[str, int] = {}

        for brand_key in sorted(mappings_by_brand):
            brand_service = SalesManagementService(self.db, brand_key=brand_key)
            runs = self._fetch_selected_runs_with_payload(
                brand_service=brand_service,
                time_start=int(time_start),
                time_end=int(time_end),
            )
            runs_by_brand[brand_key] = len(runs)

            for run in runs:
                raw_payload = run[3] if len(run) > 3 else None
                if not raw_payload:
                    continue
                try:
                    parsed = json.loads(raw_payload)
                except (json.JSONDecodeError, TypeError):
                    continue
                product_report = (parsed.get("data") or {}).get("product_report") or {}
                if not isinstance(product_report, dict):
                    continue

                for channel, shops in product_report.items():
                    if not isinstance(shops, list):
                        continue
                    for raw_shop in shops:
                        if not isinstance(raw_shop, dict):
                            continue
                        shop_id = str(raw_shop.get("shopId") or "").strip()
                        key = _shop_key(brand_key, channel, shop_id)
                        mapping = mapping_by_key.get(key)
                        if not mapping:
                            continue
                        seen_shop_keys.add(key)

                        products = raw_shop.get("products") or []
                        if not isinstance(products, list):
                            continue
                        for product in products:
                            if not isinstance(product, dict):
                                continue
                            code = str(product.get("code") or "").strip().upper()
                            if not code:
                                continue
                            name = str(product.get("name") or "").strip()
                            row = aggregate.setdefault(
                                code,
                                {
                                    "code": code,
                                    "name": name,
                                    "sold_qty": 0.0,
                                    "sold_revenue": 0.0,
                                    "channels": set(),
                                    "shop_keys": set(),
                                    "shops": {},
                                },
                            )
                            if name and not row["name"]:
                                row["name"] = name
                            row["sold_qty"] += float(product.get("amount") or 0)
                            row["sold_revenue"] += float(product.get("revenue") or 0)
                            row["channels"].add(str(channel))
                            row["shop_keys"].add(key)
                            row["shops"][key] = {
                                "brand_key": brand_key,
                                "channel": str(channel),
                                "shop_id": shop_id,
                                "shop_name": mapping.get("shop_name") or shop_id,
                                "provisional": bool(mapping.get("provisional")),
                            }

        kw = str(keyword or "").strip().lower()
        rows: List[Dict] = []
        for code, row in aggregate.items():
            if float(row["sold_qty"]) < float(min_qty or 0):
                continue
            if float(row["sold_revenue"]) < float(min_revenue or 0):
                continue
            if kw and kw not in f"{code} {row.get('name') or ''}".lower():
                continue
            rows.append(row)

        stock_map = self._load_stock(
            [row["code"] for row in rows],
            HOUSEHOLD_STOCK_BRAND_KEYS,
        )
        stock_status = self._get_stock_status(HOUSEHOLD_STOCK_BRAND_KEYS)
        output_rows = [
            {
                "code": row["code"],
                "name": row.get("name") or "",
                "sold_qty": float(row["sold_qty"]),
                "sold_revenue": float(row["sold_revenue"]),
                "current_stock": float(stock_map.get(row["code"], 0)),
                "channels": sorted(row["channels"]),
                "shops_count": len(row["shop_keys"]),
                "shops": sorted(
                    row["shops"].values(),
                    key=lambda shop: (shop["brand_key"], shop["channel"], shop["shop_id"]),
                ),
            }
            for row in rows
        ]

        sort_key = str(sort_by or "sold_qty")
        if sort_key not in {"code", "name", "sold_qty", "sold_revenue", "current_stock", "shops_count"}:
            sort_key = "sold_qty"
        reverse = str(sort_dir or "desc").lower() != "asc"
        output_rows.sort(
            key=lambda row: (row.get(sort_key) or 0, row["code"]),
            reverse=reverse,
        )

        safe_top_n = max(0, int(top_n or 0))
        if safe_top_n:
            output_rows = output_rows[:safe_top_n]
        total = len(output_rows)

        unmatched = [
            shop for shop in mappings
            if _shop_key(shop["brand_key"], shop["channel"], shop["shop_id"]) not in seen_shop_keys
        ]
        result = {
            "household_key": config["key"],
            "household_name": config["name"],
            "time_start": int(time_start),
            "time_end": int(time_end),
            "items": output_rows,
            "total": total,
            "runs_by_brand": runs_by_brand,
            "configured_shops": mappings,
            "matched_shop_count": len(seen_shop_keys),
            "unmatched_configured_shops": unmatched,
            "stock_scope": "all_households_by_product_code",
            "stock_brand_keys": sorted(HOUSEHOLD_STOCK_BRAND_KEYS),
            **stock_status,
            "cache_hit": False,
        }
        self._cache_set(cache_key, result)
        return self._paginate_result(result, page, page_size)
