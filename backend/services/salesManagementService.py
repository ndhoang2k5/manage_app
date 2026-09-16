import json
import os
import time
from typing import Dict, List, Optional
from urllib import request, error

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.orm import Session

from services.salesManagementUtils import (
    aggregate_sales_report,
    aggregate_sales_report_by_shop,
    aggregate_product_stock,
    filter_nested_runs,
)
from services.salesManagementShops import get_shop_options, normalize_shop_id


class SalesManagementService:
    REPORT_URL = "https://salework.net/api/open/stock/v1/report/product"
    PRODUCT_LIST_URL = "https://salework.net/api/open/stock/v1/product/list"
    SUPPORTED_BRANDS = {"unbee", "himomi", "ranbee"}

    @staticmethod
    def _build_in_clause(param_prefix: str, values: List, params: Dict) -> str:
        if not values:
            return "NULL"
        keys = []
        for idx, value in enumerate(values):
            key = f"{param_prefix}_{idx}"
            keys.append(f":{key}")
            params[key] = value
        return ", ".join(keys)

    def __init__(self, db: Session, brand_key: str = "unbee"):
        self.db = db
        self.brand_key = self._normalize_brand_key(brand_key)
        # Chặn các run quá dài vì dễ gây cộng dồn doanh số khi chồng khoảng thời gian.
        self.max_report_window_ms = int(os.getenv("SALEWORK_MAX_REPORT_WINDOW_MS", "86400000"))  # 24h
        # Avoid DDL on every request in production; keep optional bootstrap for dev.
        if os.getenv("SALEWORK_AUTO_BOOTSTRAP_SCHEMA", "false").lower() == "true":
            self._ensure_tables()

    @classmethod
    def _normalize_brand_key(cls, brand_key: Optional[str]) -> str:
        key = str(brand_key or "unbee").strip().lower()
        if key not in cls.SUPPORTED_BRANDS:
            raise ValueError("Nhãn số bán không hợp lệ")
        return key

    def _ensure_tables(self) -> None:
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_report_runs (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee',
                    time_start BIGINT NOT NULL,
                    time_end BIGINT NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'success',
                    raw_payload LONGTEXT,
                    created_by INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_sales_report_brand_period (brand_key, time_start, time_end)
                )
                """
            )
        )
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_report_items (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    run_id INT NOT NULL,
                    code VARCHAR(128) NOT NULL,
                    name VARCHAR(255) NULL,
                    sold_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    sold_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    channels_json TEXT,
                    shops_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_sales_report_items_run (run_id),
                    INDEX idx_sales_report_items_code (code),
                    CONSTRAINT fk_sales_report_items_run
                        FOREIGN KEY (run_id) REFERENCES sales_report_runs(id)
                        ON DELETE CASCADE
                )
                """
            )
        )
        # Composite index speeds period aggregates filtered by many run_ids.
        idx_exists = self.db.execute(
            text(
                """
                SELECT 1
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'sales_report_items'
                  AND index_name = 'idx_sales_report_items_run_code'
                LIMIT 1
                """
            )
        ).fetchone()
        if not idx_exists:
            self.db.execute(
                text(
                    "CREATE INDEX idx_sales_report_items_run_code ON sales_report_items (run_id, code)"
                )
            )
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_priority_codes (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee',
                    code VARCHAR(128) NOT NULL,
                    note VARCHAR(255) NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_by INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_sales_priority_brand_code (brand_key, code)
                )
                """
            )
        )
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_product_stock_current (
                    brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee',
                    code VARCHAR(128) NOT NULL,
                    name VARCHAR(255) NULL,
                    total_stock DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    stock_by_warehouse_json TEXT,
                    cost DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    retail_price DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    barcode VARCHAR(128) NULL,
                    synced_at_ms BIGINT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (brand_key, code)
                )
                """
            )
        )
        self._ensure_shop_tables()
        self.db.commit()

    def _ensure_shop_tables(self) -> None:
        """Per-shop split of the sales report (needed for the shop filter)."""
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_report_shop_items (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    run_id INT NOT NULL,
                    code VARCHAR(128) NOT NULL,
                    name VARCHAR(255) NULL,
                    channel VARCHAR(64) NOT NULL DEFAULT '',
                    shop_id VARCHAR(128) NOT NULL DEFAULT '',
                    sold_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    sold_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_sales_shop_items_run_shop_code (run_id, shop_id, code),
                    INDEX idx_sales_shop_items_shop_code (shop_id, code),
                    CONSTRAINT fk_sales_shop_items_run
                        FOREIGN KEY (run_id) REFERENCES sales_report_runs(id)
                        ON DELETE CASCADE
                )
                """
            )
        )
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_report_shop_built (
                    run_id INT PRIMARY KEY,
                    built_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_sales_shop_built_run
                        FOREIGN KEY (run_id) REFERENCES sales_report_runs(id)
                        ON DELETE CASCADE
                )
                """
            )
        )

    def _get_salework_credentials(self) -> Dict[str, str]:
        load_dotenv("local.env", override=True)
        env_prefix = f"SALEWORK_{self.brand_key.upper()}"
        client_id = os.getenv(f"{env_prefix}_CLIENT_ID")
        token = os.getenv(f"{env_prefix}_TOKEN")
        if self.brand_key == "unbee":
            client_id = client_id or os.getenv("SALEWORK_CLIENT_ID")
            token = token or os.getenv("SALEWORK_TOKEN")
        if not client_id or not token:
            raise ValueError(f"Thiếu cấu hình Salework cho nhãn {self.brand_key}")
        return {"client_id": client_id, "token": token}

    def _request_salework(self, url: str, method: str = "GET", payload: Optional[Dict] = None) -> Dict:
        credentials = self._get_salework_credentials()
        timeout_seconds = int(os.getenv("SALEWORK_TIMEOUT_SECONDS", "20"))
        retry_count = int(os.getenv("SALEWORK_RETRY_COUNT", "2"))
        headers = {
            "Content-Type": "application/json",
            "client-id": credentials["client_id"],
            "token": credentials["token"],
        }
        body = json.dumps(payload or {}).encode("utf-8") if method == "POST" else None

        last_error = None
        for _ in range(retry_count + 1):
            req = request.Request(url, data=body, headers=headers, method=method)
            try:
                with request.urlopen(req, timeout=timeout_seconds) as response:
                    body = response.read().decode("utf-8")
                    parsed = json.loads(body)
                    if parsed.get("status") != "success":
                        raise ValueError("Salework API trả về trạng thái không thành công")
                    return parsed
            except (error.URLError, error.HTTPError, json.JSONDecodeError, ValueError) as exc:
                last_error = exc
                continue

        raise ValueError(f"Không thể gọi Salework API: {last_error}")

    def _post_salework_report(self, time_start: int, time_end: int) -> Dict:
        return self._request_salework(
            self.REPORT_URL,
            method="POST",
            payload={"time_start": time_start, "time_end": time_end},
        )

    def _get_salework_product_list(self) -> Dict:
        return self._request_salework(self.PRODUCT_LIST_URL, method="GET")

    def _get_run_id_for_period(self, time_start: int, time_end: int) -> Optional[int]:
        row = self.db.execute(
            text(
                """
                SELECT id
                FROM sales_report_runs
                WHERE brand_key = :brand_key
                  AND time_start = :time_start
                  AND time_end = :time_end
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"brand_key": self.brand_key, "time_start": time_start, "time_end": time_end},
        ).fetchone()
        return row[0] if row else None

    def _get_covering_run_id(self, time_start: int, time_end: int) -> Optional[int]:
        row = self.db.execute(
            text(
                """
                SELECT id
                FROM sales_report_runs
                WHERE brand_key = :brand_key
                  AND time_start <= :time_start
                  AND time_end >= :time_end
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"brand_key": self.brand_key, "time_start": time_start, "time_end": time_end},
        ).fetchone()
        return row[0] if row else None

    def _get_latest_synced_end(self) -> Optional[int]:
        row = self.db.execute(
            text("SELECT MAX(time_end) FROM sales_report_runs WHERE brand_key = :brand_key"),
            {"brand_key": self.brand_key},
        ).fetchone()
        if not row or row[0] is None:
            return None
        return int(row[0])

    def _default_start_time(self) -> int:
        default_from_env = os.getenv("SALEWORK_SYNC_START_MS")
        if default_from_env:
            return int(default_from_env)
        # 2026-01-01 00:00:00 Asia/Ho_Chi_Minh
        return 1767190800000

    def fetch_and_store(self, time_start: int, time_end: int, user: dict, force_refresh: bool = False) -> Dict:
        if time_start >= time_end:
            raise ValueError("Khoảng thời gian không hợp lệ")
        if (time_end - time_start) > self.max_report_window_ms:
            max_hours = round(self.max_report_window_ms / 1000 / 3600, 2)
            raise ValueError(
                f"Khoảng lấy số bán quá dài (> {max_hours} giờ). "
                "Vui lòng đồng bộ theo chunk (backfill) để tránh trùng doanh số."
            )

        existing_run_id = self._get_run_id_for_period(time_start, time_end)
        if existing_run_id and not force_refresh:
            return {"run_id": existing_run_id, "reused": True}
        covering_run_id = self._get_covering_run_id(time_start, time_end)
        if covering_run_id and not force_refresh:
            return {"run_id": covering_run_id, "reused": True, "covered": True}

        raw_data = self._post_salework_report(time_start, time_end)
        product_report = raw_data.get("data", {}).get("product_report", {})
        items = aggregate_sales_report(product_report)

        try:
            if existing_run_id:
                self.db.execute(text("DELETE FROM sales_report_runs WHERE id = :run_id"), {"run_id": existing_run_id})
            # Drop older runs that are fully covered by this incoming window
            # to avoid double counting when a later backfill chunk supersedes
            # previously synced smaller windows.
            self.db.execute(
                text(
                    """
                    DELETE FROM sales_report_runs
                    WHERE brand_key = :brand_key
                      AND time_start >= :time_start
                      AND time_end <= :time_end
                    """
                ),
                {"brand_key": self.brand_key, "time_start": time_start, "time_end": time_end},
            )

            self.db.execute(
                text(
                    """
                    INSERT INTO sales_report_runs (brand_key, time_start, time_end, status, raw_payload, created_by)
                    VALUES (:brand_key, :time_start, :time_end, :status, :raw_payload, :created_by)
                    """
                ),
                {
                    "brand_key": self.brand_key,
                    "time_start": time_start,
                    "time_end": time_end,
                    "status": "success",
                    "raw_payload": json.dumps(raw_data, ensure_ascii=False),
                    "created_by": user.get("id"),
                },
            )
            run_id = self.db.execute(text("SELECT LAST_INSERT_ID()")).fetchone()[0]

            if items:
                self.db.execute(
                    text(
                        """
                        INSERT INTO sales_report_items
                        (run_id, code, name, sold_qty, sold_revenue, channels_json, shops_count)
                        VALUES (:run_id, :code, :name, :sold_qty, :sold_revenue, :channels_json, :shops_count)
                        """
                    ),
                    [
                        {
                            "run_id": run_id,
                            "code": row["code"],
                            "name": row["name"],
                            "sold_qty": row["sold_qty"],
                            "sold_revenue": row["sold_revenue"],
                            "channels_json": json.dumps(row["channels"], ensure_ascii=False),
                            "shops_count": row["shops_count"],
                        }
                        for row in items
                    ],
                )

            self._insert_shop_items(run_id, product_report)
            self.db.commit()
            return {"run_id": run_id, "reused": False, "items_count": len(items)}
        except Exception:
            self.db.rollback()
            raise

    def sync_now(self, user: dict, start_time: Optional[int] = None) -> Dict:
        latest_end = self._get_latest_synced_end()
        to_time = int(time.time() * 1000)
        if latest_end is not None:
            from_time = latest_end
        elif start_time is not None:
            from_time = int(start_time)
        else:
            from_time = max(self._default_start_time(), to_time - self.max_report_window_ms)

        min_window_ms = int(os.getenv("SALEWORK_MIN_SYNC_WINDOW_MS", "60000"))
        sales_result: Dict = {"synced": False, "reason": "window_too_small", "time_start": from_time, "time_end": to_time}
        if to_time - from_time >= min_window_ms:
            fetch_result = self.fetch_and_store(
                time_start=from_time,
                time_end=to_time,
                user=user,
                force_refresh=False,
            )
            sales_result = {
                "synced": True,
                "time_start": from_time,
                "time_end": to_time,
                **fetch_result,
            }

        stock_result = self.sync_product_stock()
        return {
            "sales": sales_result,
            "stock": stock_result,
            "synced": bool(sales_result.get("synced") or stock_result.get("synced_count", 0) > 0),
        }

    def backfill_history(
        self,
        user: dict,
        time_start: Optional[int] = None,
        time_end: Optional[int] = None,
        chunk_hours: int = 24,
        max_chunks: int = 400,
    ) -> Dict:
        cursor = int(time_start or self._default_start_time())
        stop_at = int(time_end or int(time.time() * 1000))
        if cursor >= stop_at:
            raise ValueError("Khoảng thời gian backfill không hợp lệ")
        if chunk_hours <= 0:
            raise ValueError("chunk_hours phải > 0")
        if max_chunks <= 0:
            raise ValueError("max_chunks phải > 0")

        chunk_ms = int(chunk_hours * 60 * 60 * 1000)
        chunks_done = 0
        fetched_count = 0
        reused_count = 0

        while cursor < stop_at and chunks_done < max_chunks:
            chunk_end = min(cursor + chunk_ms, stop_at)
            result = self.fetch_and_store(
                time_start=cursor,
                time_end=chunk_end,
                user=user,
                force_refresh=False,
            )
            if result.get("reused"):
                reused_count += 1
            else:
                fetched_count += 1
            chunks_done += 1
            cursor = chunk_end

        return {
            "chunks_done": chunks_done,
            "fetched_count": fetched_count,
            "reused_count": reused_count,
            "next_cursor": cursor,
            "completed": cursor >= stop_at,
            "target_end": stop_at,
        }

    def sync_product_stock(self) -> Dict:
        raw_data = self._get_salework_product_list()
        products_data = raw_data.get("data", {}).get("products", {})
        rows = aggregate_product_stock(products_data)
        synced_at_ms = int(time.time() * 1000)

        try:
            for row in rows:
                self.db.execute(
                    text(
                        """
                        INSERT INTO sales_product_stock_current
                        (brand_key, code, name, total_stock, stock_by_warehouse_json, cost, retail_price, barcode, synced_at_ms)
                        VALUES
                        (:brand_key, :code, :name, :total_stock, :stock_by_warehouse_json, :cost, :retail_price, :barcode, :synced_at_ms)
                        ON DUPLICATE KEY UPDATE
                            name = VALUES(name),
                            total_stock = VALUES(total_stock),
                            stock_by_warehouse_json = VALUES(stock_by_warehouse_json),
                            cost = VALUES(cost),
                            retail_price = VALUES(retail_price),
                            barcode = VALUES(barcode),
                            synced_at_ms = VALUES(synced_at_ms)
                        """
                    ),
                    {
                        "brand_key": self.brand_key,
                        "code": row["code"],
                        "name": row["name"],
                        "total_stock": row["total_stock"],
                        "stock_by_warehouse_json": json.dumps(row["stock_by_warehouse"], ensure_ascii=False),
                        "cost": row["cost"],
                        "retail_price": row["retail_price"],
                        "barcode": row["barcode"],
                        "synced_at_ms": synced_at_ms,
                    },
                )
            self.db.commit()
            return {"synced_count": len(rows), "synced_at_ms": synced_at_ms}
        except Exception:
            self.db.rollback()
            raise

    def get_priority_codes(self) -> List[Dict]:
        rows = self.db.execute(
            text(
                """
                SELECT code, note, created_at, updated_at
                FROM sales_priority_codes
                WHERE brand_key = :brand_key
                  AND is_active = 1
                ORDER BY updated_at DESC, code ASC
                """
            )
            ,
            {"brand_key": self.brand_key},
        ).fetchall()
        return [
            {
                "code": row[0],
                "note": row[1],
                "created_at": row[2],
                "updated_at": row[3],
            }
            for row in rows
        ]

    def save_priority_codes(self, codes: List[str], user: dict, mode: str = "replace", note: str = "") -> Dict:
        normalized_codes = sorted({str(code).strip().upper() for code in codes if str(code).strip()})
        if mode not in {"replace", "append"}:
            raise ValueError("mode chỉ hỗ trợ replace hoặc append")

        try:
            if mode == "replace":
                self.db.execute(
                    text("UPDATE sales_priority_codes SET is_active = 0 WHERE brand_key = :brand_key"),
                    {"brand_key": self.brand_key},
                )

            for code in normalized_codes:
                self.db.execute(
                    text(
                        """
                        INSERT INTO sales_priority_codes (brand_key, code, note, is_active, created_by)
                        VALUES (:brand_key, :code, :note, 1, :created_by)
                        ON DUPLICATE KEY UPDATE
                            note = VALUES(note),
                            is_active = 1,
                            created_by = VALUES(created_by)
                        """
                    ),
                    {"brand_key": self.brand_key, "code": code, "note": note, "created_by": user.get("id")},
                )
            self.db.commit()
            return {"saved_count": len(normalized_codes)}
        except Exception:
            self.db.rollback()
            raise

    def get_sync_status(self) -> Dict:
        latest_row = self.db.execute(
            text(
                """
                SELECT id, time_start, time_end, created_at
                FROM sales_report_runs
                WHERE brand_key = :brand_key
                ORDER BY id DESC
                LIMIT 1
                """
            )
            ,
            {"brand_key": self.brand_key},
        ).fetchone()
        total_runs = self.db.execute(
            text("SELECT COUNT(1) FROM sales_report_runs WHERE brand_key = :brand_key"),
            {"brand_key": self.brand_key},
        ).fetchone()[0]
        total_items = self.db.execute(
            text("""
                SELECT COUNT(1)
                FROM sales_report_items i
                JOIN sales_report_runs r ON r.id = i.run_id
                WHERE r.brand_key = :brand_key
            """),
            {"brand_key": self.brand_key},
        ).fetchone()[0]
        stock_status = self.db.execute(
            text("SELECT MAX(synced_at_ms), COUNT(1) FROM sales_product_stock_current WHERE brand_key = :brand_key"),
            {"brand_key": self.brand_key},
        ).fetchone()

        return {
            "latest_run_id": latest_row[0] if latest_row else None,
            "latest_time_start": latest_row[1] if latest_row else None,
            "latest_time_end": latest_row[2] if latest_row else None,
            "latest_created_at": latest_row[3] if latest_row else None,
            "total_runs": int(total_runs or 0),
            "total_items": int(total_items or 0),
            "latest_stock_synced_at_ms": int(stock_status[0] or 0),
            "total_stock_products": int(stock_status[1] or 0),
        }

    def get_shop_options(self) -> List[Dict]:
        return get_shop_options(self.brand_key)

    def _insert_shop_items(self, run_id: int, product_report: Dict) -> int:
        """Split one run's product_report per channel + shopId and mark the run as built.

        Does not commit; caller owns the transaction.
        """
        rows = aggregate_sales_report_by_shop(product_report)
        self.db.execute(
            text("DELETE FROM sales_report_shop_items WHERE run_id = :run_id"),
            {"run_id": int(run_id)},
        )
        batch_size = 1000
        for start in range(0, len(rows), batch_size):
            batch = rows[start:start + batch_size]
            self.db.execute(
                text(
                    """
                    INSERT INTO sales_report_shop_items
                    (run_id, code, name, channel, shop_id, sold_qty, sold_revenue)
                    VALUES (:run_id, :code, :name, :channel, :shop_id, :sold_qty, :sold_revenue)
                    """
                ),
                [
                    {
                        "run_id": int(run_id),
                        "code": row["code"],
                        "name": row.get("name") or "",
                        "channel": str(row.get("channel") or "")[:64],
                        "shop_id": str(row.get("shop_id") or "")[:128],
                        "sold_qty": float(row.get("sold_qty") or 0),
                        "sold_revenue": float(row.get("sold_revenue") or 0),
                    }
                    for row in batch
                ],
            )
        self.db.execute(
            text(
                """
                INSERT INTO sales_report_shop_built (run_id)
                VALUES (:run_id)
                ON DUPLICATE KEY UPDATE built_at = CURRENT_TIMESTAMP
                """
            ),
            {"run_id": int(run_id)},
        )
        return len(rows)

    def _ensure_shop_items_for_runs(self, run_ids: List[int]) -> int:
        """Lazily backfill per-shop rows for runs synced before the shop table existed.

        Must be called before temp tables are created: it commits, and a commit may
        hand the session a different pooled connection (temp tables are per connection).
        """
        unique_ids = sorted({int(x) for x in run_ids if x is not None})
        if not unique_ids:
            return 0

        pending: List[int] = []
        batch_size = 800
        for start in range(0, len(unique_ids), batch_size):
            batch = unique_ids[start:start + batch_size]
            params: Dict = {}
            in_clause = self._build_in_clause("run", batch, params)
            rows = self.db.execute(
                text(
                    f"""
                    SELECT r.id
                    FROM sales_report_runs r
                    LEFT JOIN sales_report_shop_built b ON b.run_id = r.id
                    WHERE r.id IN ({in_clause})
                      AND b.run_id IS NULL
                    """
                ),
                params,
            ).fetchall()
            pending.extend(int(r[0]) for r in rows if r and r[0] is not None)

        if not pending:
            return 0

        built = 0
        try:
            for run_id in pending:
                payload_row = self.db.execute(
                    text("SELECT raw_payload FROM sales_report_runs WHERE id = :run_id"),
                    {"run_id": run_id},
                ).fetchone()
                product_report: Dict = {}
                if payload_row and payload_row[0]:
                    try:
                        parsed = json.loads(payload_row[0])
                        product_report = (parsed.get("data") or {}).get("product_report") or {}
                    except (json.JSONDecodeError, TypeError, AttributeError):
                        product_report = {}
                self._insert_shop_items(run_id, product_report)
                built += 1
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return built

    def get_report(
        self,
        run_id: Optional[int] = None,
        time_start: Optional[int] = None,
        time_end: Optional[int] = None,
        keyword: Optional[str] = None,
        only_priority_codes: bool = False,
        min_qty: float = 0,
        min_revenue: float = 0,
        page: int = 1,
        page_size: int = 50,
        sort_by: str = "sold_qty",
        sort_dir: str = "desc",
        top_n: int = 0,
        shop_id: Optional[str] = None,
    ) -> Dict:
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 50
        page_size = min(page_size, 200)
        top_n = max(0, int(top_n or 0))

        if run_id is None and (time_start is None or time_end is None):
            latest = self.db.execute(
                text("SELECT id FROM sales_report_runs WHERE brand_key = :brand_key ORDER BY id DESC LIMIT 1"),
                {"brand_key": self.brand_key},
            ).fetchone()
            if not latest:
                return {"run_id": None, "items": [], "total": 0, "page": page, "page_size": page_size}
            run_id = latest[0]

        sort_map = {
            "code": "agg.code",
            "name": "agg.name",
            "sold_qty": "agg.sold_qty",
            "sold_revenue": "agg.sold_revenue",
            "shops_count": "agg.shops_count",
            "current_stock": "agg.current_stock",
        }
        sort_column = sort_map.get(sort_by, "agg.sold_qty")
        # current_stock is enriched after pagination; sort by it using sold_qty fallback in SQL phase
        if sort_by == "current_stock":
            sort_column = "agg.sold_qty"
        direction = "ASC" if str(sort_dir).lower() == "asc" else "DESC"

        if run_id is not None:
            run_ids = [int(run_id)]
        else:
            run_ids = self._get_filtered_run_ids_for_period(int(time_start), int(time_end))

        shop_filter = normalize_shop_id(shop_id)
        params: Dict = {
            "brand_key": self.brand_key,
            "min_qty": float(min_qty or 0),
            "min_revenue": float(min_revenue or 0),
        }
        if shop_filter:
            params["shop_id"] = shop_filter
        keyword_where = ""
        stock_keyword_where = ""
        kw = str(keyword or "").strip()
        if kw:
            params["keyword"] = f"%{kw}%"
            keyword_where = "AND (i.code LIKE :keyword OR i.name LIKE :keyword)"
            stock_keyword_where = "AND (st.code LIKE :keyword OR st.name LIKE :keyword)"

        # Không có run trong kỳ: vẫn cho tìm mã từ tồn kho nếu có keyword.
        if not run_ids and not kw:
            return {"run_id": None, "items": [], "total": 0, "page": page, "page_size": page_size}

        if shop_filter:
            # Old runs may predate the per-shop table; split them from raw_payload first.
            self._ensure_shop_items_for_runs(run_ids)
        self._prepare_tmp_run_ids(run_ids)
        # Materialize period codes so stock UNION does not reopen tmp_sales_run_ids (MySQL 1137).
        self._prepare_tmp_period_sold_codes(shop_filter)

        priority_join = ""
        stock_priority_join = ""
        if only_priority_codes:
            priority_join = """
                INNER JOIN sales_priority_codes sp
                    ON sp.brand_key = :brand_key
                   AND sp.code = i.code
                   AND sp.is_active = 1
            """
            stock_priority_join = """
                INNER JOIN sales_priority_codes sp
                    ON sp.brand_key = :brand_key
                   AND sp.code = st.code
                   AND sp.is_active = 1
            """

        # Số bán trong kỳ được chọn.
        if shop_filter:
            # Lọc theo shop: dùng bảng tách theo shop, chỉ lấy đúng shop_id.
            sales_aggregate_sql = f"""
                SELECT
                    i.code AS code,
                    MAX(i.name) AS name,
                    SUM(i.sold_qty) AS sold_qty,
                    SUM(i.sold_revenue) AS sold_revenue,
                    COUNT(DISTINCT i.shop_id) AS shops_count
                FROM sales_report_shop_items i
                INNER JOIN tmp_sales_run_ids t ON t.id = i.run_id
                {priority_join}
                WHERE i.shop_id = :shop_id
                  {keyword_where}
                GROUP BY i.code
                HAVING SUM(i.sold_qty) >= :min_qty
                   AND SUM(i.sold_revenue) >= :min_revenue
            """
        else:
            sales_aggregate_sql = f"""
                SELECT
                    i.code AS code,
                    MAX(i.name) AS name,
                    SUM(i.sold_qty) AS sold_qty,
                    SUM(i.sold_revenue) AS sold_revenue,
                    SUM(i.shops_count) AS shops_count
                FROM sales_report_items i
                INNER JOIN tmp_sales_run_ids t ON t.id = i.run_id
                {priority_join}
                WHERE 1=1
                  {keyword_where}
                GROUP BY i.code
                HAVING SUM(i.sold_qty) >= :min_qty
                   AND SUM(i.sold_revenue) >= :min_revenue
            """

        # Khi có keyword: bổ sung mã khớp từ tồn kho (kể cả SL bán = 0 trong kỳ).
        if kw:
            base_aggregate_sql = f"""
                SELECT code, name, sold_qty, sold_revenue, shops_count
                FROM (
                    {sales_aggregate_sql}
                    UNION ALL
                    SELECT
                        st.code AS code,
                        COALESCE(st.name, st.code) AS name,
                        0 AS sold_qty,
                        0 AS sold_revenue,
                        0 AS shops_count
                    FROM sales_product_stock_current st
                    {stock_priority_join}
                    WHERE st.brand_key = :brand_key
                      {stock_keyword_where}
                      AND NOT EXISTS (
                          SELECT 1
                          FROM tmp_period_sold_codes p
                          WHERE p.code = st.code
                      )
                ) combined
            """
        else:
            base_aggregate_sql = sales_aggregate_sql

        count_row = self.db.execute(
            text(f"SELECT COUNT(1) FROM ({base_aggregate_sql}) agg"),
            params,
        ).fetchone()
        total = int(count_row[0]) if count_row and count_row[0] is not None else 0
        if top_n > 0:
            total = min(total, top_n)

        if total == 0:
            return {"run_id": run_id, "items": [], "total": 0, "page": page, "page_size": page_size}

        offset = (page - 1) * page_size
        if top_n > 0 and offset >= top_n:
            return {"run_id": run_id, "items": [], "total": total, "page": page, "page_size": page_size}
        effective_limit = page_size
        if top_n > 0:
            effective_limit = min(page_size, top_n - offset)

        page_params = dict(params)
        page_params["limit"] = int(effective_limit)
        page_params["offset"] = int(offset)
        page_rows = self.db.execute(
            text(
                f"""
                SELECT agg.code, agg.name, agg.sold_qty, agg.sold_revenue, agg.shops_count
                FROM ({base_aggregate_sql}) agg
                ORDER BY {sort_column} {direction}, agg.code ASC
                LIMIT :limit OFFSET :offset
                """
            ),
            page_params,
        ).fetchall()

        page_codes = [str(r[0]) for r in page_rows if r and r[0]]
        channels_map = self._load_channels_for_codes(page_codes, shop_filter)
        stock_map = self._load_stock_for_codes(page_codes)
        priority_set = self._load_priority_codes_set(page_codes)

        items = []
        for row in page_rows:
            code = str(row[0])
            items.append(
                {
                    "code": code,
                    "name": row[1],
                    "sold_qty": float(row[2] or 0),
                    "sold_revenue": float(row[3] or 0),
                    "channels": sorted(list(channels_map.get(code, set()))),
                    "shops_count": int(row[4] or 0),
                    "is_priority": code in priority_set,
                    "current_stock": float(stock_map.get(code, 0)),
                }
            )

        if sort_by == "current_stock":
            reverse = str(sort_dir).lower() != "asc"
            items.sort(key=lambda x: (float(x.get("current_stock") or 0), x.get("code") or ""), reverse=reverse)

        return {
            "run_id": run_id,
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "shop_id": shop_filter or None,
        }

    def _prepare_tmp_run_ids(self, run_ids: List[int]) -> None:
        self.db.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_sales_run_ids"))
        self.db.execute(text("CREATE TEMPORARY TABLE tmp_sales_run_ids (id INT PRIMARY KEY)"))
        unique_ids = sorted({int(x) for x in run_ids if x is not None})
        batch_size = 800
        for i in range(0, len(unique_ids), batch_size):
            batch = unique_ids[i:i + batch_size]
            values_sql = ", ".join(f"({rid})" for rid in batch)
            self.db.execute(text(f"INSERT INTO tmp_sales_run_ids (id) VALUES {values_sql}"))

    def _prepare_tmp_period_sold_codes(self, shop_id: str = "") -> None:
        self.db.execute(text("DROP TEMPORARY TABLE IF EXISTS tmp_period_sold_codes"))
        self.db.execute(
            text(
                """
                CREATE TEMPORARY TABLE tmp_period_sold_codes (
                    code VARCHAR(128) PRIMARY KEY
                )
                """
            )
        )
        if shop_id:
            self.db.execute(
                text(
                    """
                    INSERT IGNORE INTO tmp_period_sold_codes (code)
                    SELECT DISTINCT i.code
                    FROM sales_report_shop_items i
                    INNER JOIN tmp_sales_run_ids t ON t.id = i.run_id
                    WHERE i.shop_id = :shop_id
                    """
                ),
                {"shop_id": shop_id},
            )
        else:
            self.db.execute(
                text(
                    """
                    INSERT IGNORE INTO tmp_period_sold_codes (code)
                    SELECT DISTINCT i.code
                    FROM sales_report_items i
                    INNER JOIN tmp_sales_run_ids t ON t.id = i.run_id
                    """
                )
            )

    def _load_channels_for_codes(self, codes: List[str], shop_id: str = "") -> Dict[str, set]:
        result: Dict[str, set] = {code: set() for code in codes}
        if not codes:
            return result
        params: Dict = {}
        in_clause = self._build_in_clause("code", codes, params)
        if shop_id:
            params["shop_id"] = shop_id
            rows = self.db.execute(
                text(
                    f"""
                    SELECT DISTINCT i.code, i.channel
                    FROM sales_report_shop_items i
                    INNER JOIN tmp_sales_run_ids t ON t.id = i.run_id
                    WHERE i.shop_id = :shop_id
                      AND i.code IN ({in_clause})
                    """
                ),
                params,
            ).fetchall()
            for code, channel in rows:
                if channel:
                    result.setdefault(str(code), set()).add(str(channel))
            return result
        rows = self.db.execute(
            text(
                f"""
                SELECT i.code, i.channels_json
                FROM sales_report_items i
                INNER JOIN tmp_sales_run_ids t ON t.id = i.run_id
                WHERE i.code IN ({in_clause})
                """
            ),
            params,
        ).fetchall()
        for code, raw_blob in rows:
            key = str(code)
            if not raw_blob:
                continue
            try:
                parsed = json.loads(raw_blob)
            except (json.JSONDecodeError, TypeError):
                continue
            if isinstance(parsed, list):
                for channel in parsed:
                    if channel:
                        result.setdefault(key, set()).add(str(channel))
        return result

    def _load_stock_for_codes(self, codes: List[str]) -> Dict[str, float]:
        if not codes:
            return {}
        params: Dict = {"brand_key": self.brand_key}
        in_clause = self._build_in_clause("code", codes, params)
        rows = self.db.execute(
            text(
                f"""
                SELECT code, total_stock
                FROM sales_product_stock_current
                WHERE brand_key = :brand_key
                  AND code IN ({in_clause})
                """
            ),
            params,
        ).fetchall()
        return {str(r[0]): float(r[1] or 0) for r in rows}

    def _load_priority_codes_set(self, codes: List[str]) -> set:
        if not codes:
            return set()
        params: Dict = {"brand_key": self.brand_key}
        in_clause = self._build_in_clause("code", codes, params)
        rows = self.db.execute(
            text(
                f"""
                SELECT code
                FROM sales_priority_codes
                WHERE brand_key = :brand_key
                  AND is_active = 1
                  AND code IN ({in_clause})
                """
            ),
            params,
        ).fetchall()
        return {str(r[0]) for r in rows}

    def get_report_for_export(
        self,
        run_id: Optional[int] = None,
        time_start: Optional[int] = None,
        time_end: Optional[int] = None,
        keyword: Optional[str] = None,
        only_priority_codes: bool = False,
        min_qty: float = 0,
        min_revenue: float = 0,
        sort_by: str = "sold_qty",
        sort_dir: str = "desc",
        top_n: int = 0,
        shop_id: Optional[str] = None,
    ) -> List[Dict]:
        rows: List[Dict] = []
        page = 1
        page_size = 200
        total = None

        while True:
            result = self.get_report(
                run_id=run_id,
                time_start=time_start,
                time_end=time_end,
                keyword=keyword,
                only_priority_codes=only_priority_codes,
                min_qty=min_qty,
                min_revenue=min_revenue,
                page=page,
                page_size=page_size,
                sort_by=sort_by,
                sort_dir=sort_dir,
                shop_id=shop_id,
            )
            if total is None:
                total = result.get("total", 0)

            page_items = result.get("items", [])
            if not page_items:
                break

            rows.extend(page_items)

            if (top_n and top_n > 0 and len(rows) >= top_n) or len(rows) >= total or len(page_items) < page_size:
                break
            page += 1

        if top_n and top_n > 0:
            return rows[:top_n]
        return rows

    def _fetch_run_windows(
        self,
        time_start: int,
        time_end: int,
        exclude_nested: bool = True,
    ) -> List:
        """Load run id/windows only (no raw_payload) for period filtering."""
        runs = self.db.execute(
            text(
                """
                SELECT id, time_start, time_end
                FROM sales_report_runs
                WHERE brand_key = :brand_key
                  AND time_start >= :time_start
                  AND time_end <= :time_end
                  AND (time_end - time_start) <= :max_window_ms
                ORDER BY id ASC
                """
            ),
            {
                "brand_key": self.brand_key,
                "time_start": int(time_start),
                "time_end": int(time_end),
                "max_window_ms": self.max_report_window_ms,
            },
        ).fetchall()
        # Normalize to 4-tuples for filter_nested_runs
        normalized = [(r[0], r[1], r[2], None) for r in runs]
        if exclude_nested:
            return filter_nested_runs(normalized)
        return normalized

    def _fetch_runs_with_payload(
        self,
        run_id: Optional[int] = None,
        time_start: Optional[int] = None,
        time_end: Optional[int] = None,
        exclude_nested: bool = True,
    ) -> List:
        if run_id is not None:
            return self.db.execute(
                text(
                    """
                    SELECT id, time_start, time_end, raw_payload
                    FROM sales_report_runs
                    WHERE id = :run_id
                      AND brand_key = :brand_key
                    """
                ),
                {"run_id": run_id, "brand_key": self.brand_key},
            ).fetchall()

        safe_window_clause = "(time_end - time_start) <= :max_window_ms"
        runs = self.db.execute(
            text(
                f"""
                SELECT id, time_start, time_end, raw_payload
                FROM sales_report_runs
                WHERE brand_key = :brand_key
                  AND time_start >= :time_start
                  AND time_end <= :time_end
                  AND {safe_window_clause}
                ORDER BY id ASC
                """
            ),
            {
                "brand_key": self.brand_key,
                "time_start": int(time_start),
                "time_end": int(time_end),
                "max_window_ms": self.max_report_window_ms,
            },
        ).fetchall()
        if exclude_nested:
            return filter_nested_runs(runs)
        return runs

    def _get_filtered_run_ids_for_period(self, time_start: int, time_end: int) -> List[int]:
        runs = self._fetch_run_windows(
            time_start=time_start,
            time_end=time_end,
            exclude_nested=True,
        )
        return [int(run[0]) for run in runs if run and run[0] is not None]

    def get_report_by_shop_for_export(
        self,
        run_id: Optional[int] = None,
        time_start: Optional[int] = None,
        time_end: Optional[int] = None,
        keyword: Optional[str] = None,
        only_priority_codes: bool = False,
        min_qty: float = 0,
        min_revenue: float = 0,
        sort_by: str = "sold_qty",
        sort_dir: str = "desc",
        top_n: int = 0,
        shop_id: Optional[str] = None,
    ) -> List[Dict]:
        if run_id is None and (time_start is None or time_end is None):
            raise ValueError("Cần run_id hoặc khoảng thời gian hợp lệ để xuất Excel")
        shop_filter = normalize_shop_id(shop_id)

        runs = self._fetch_runs_with_payload(
            run_id=run_id,
            time_start=time_start,
            time_end=time_end,
        )

        shop_aggregate: Dict[tuple, Dict] = {}
        product_totals: Dict[str, Dict] = {}

        for run in runs:
            raw_payload = run[3] if len(run) > 3 else (run[1] if len(run) > 1 else None)
            if not raw_payload:
                continue
            try:
                parsed = json.loads(raw_payload)
            except (json.JSONDecodeError, TypeError):
                continue

            product_report = parsed.get("data", {}).get("product_report", {})
            for row in aggregate_sales_report_by_shop(product_report):
                if shop_filter and str(row.get("shop_id") or "").strip() != shop_filter:
                    continue
                code = row["code"]
                key = (code, row["channel"], row["shop_id"])
                bucket = shop_aggregate.setdefault(
                    key,
                    {
                        "code": code,
                        "name": row.get("name") or "",
                        "channel": row["channel"],
                        "shop_id": row["shop_id"],
                        "sold_qty": 0.0,
                        "sold_revenue": 0.0,
                    },
                )
                if row.get("name") and not bucket["name"]:
                    bucket["name"] = row["name"]
                bucket["sold_qty"] += float(row.get("sold_qty") or 0)
                bucket["sold_revenue"] += float(row.get("sold_revenue") or 0)

                product_bucket = product_totals.setdefault(
                    code,
                    {"code": code, "name": bucket["name"], "sold_qty": 0.0, "sold_revenue": 0.0},
                )
                if bucket["name"] and not product_bucket["name"]:
                    product_bucket["name"] = bucket["name"]
                product_bucket["sold_qty"] += float(row.get("sold_qty") or 0)
                product_bucket["sold_revenue"] += float(row.get("sold_revenue") or 0)

        if not shop_aggregate:
            return []

        priority_rows = self.db.execute(
            text("SELECT code FROM sales_priority_codes WHERE brand_key = :brand_key AND is_active = 1"),
            {"brand_key": self.brand_key},
        ).fetchall()
        priority_codes = {str(r[0]).strip().upper() for r in priority_rows if r and r[0]}

        keyword_value = str(keyword or "").strip().lower()
        qualifying_codes = set()
        for code, totals in product_totals.items():
            if float(totals.get("sold_qty") or 0) < float(min_qty or 0):
                continue
            if float(totals.get("sold_revenue") or 0) < float(min_revenue or 0):
                continue
            if keyword_value:
                haystack = f"{code} {totals.get('name') or ''}".lower()
                if keyword_value not in haystack:
                    continue
            if only_priority_codes and code not in priority_codes:
                continue
            qualifying_codes.add(code)

        if not qualifying_codes:
            return []

        stock_params: Dict = {}
        code_in_clause = self._build_in_clause("stock_code", list(qualifying_codes), stock_params)
        stock_rows = self.db.execute(
            text(
                f"""
                SELECT code, total_stock
                FROM sales_product_stock_current
                WHERE brand_key = :brand_key
                  AND code IN ({code_in_clause})
                """
            ),
            {"brand_key": self.brand_key, **stock_params},
        ).fetchall()
        stock_map = {str(r[0]).upper(): float(r[1] or 0) for r in stock_rows}

        export_rows: List[Dict] = []
        for key, row in shop_aggregate.items():
            code = row["code"]
            if code not in qualifying_codes:
                continue
            export_rows.append(
                {
                    "code": code,
                    "name": row.get("name") or product_totals.get(code, {}).get("name") or "",
                    "sold_qty": float(row.get("sold_qty") or 0),
                    "sold_revenue": float(row.get("sold_revenue") or 0),
                    "current_stock": stock_map.get(code, 0.0),
                    "channel": row.get("channel") or "",
                    "shop_id": row.get("shop_id") or "",
                    "is_priority": code in priority_codes,
                }
            )

        sort_column = {
            "sold_qty": "sold_qty",
            "sold_revenue": "sold_revenue",
            "code": "code",
            "current_stock": "current_stock",
        }.get(str(sort_by), "sold_qty")
        reverse = str(sort_dir).lower() != "asc"

        product_sort_values: Dict[str, object] = {}
        for code in qualifying_codes:
            if sort_column == "current_stock":
                product_sort_values[code] = stock_map.get(code, 0.0)
            elif sort_column == "code":
                product_sort_values[code] = code
            else:
                product_sort_values[code] = float(product_totals.get(code, {}).get(sort_column) or 0)

        export_rows.sort(
            key=lambda r: (
                product_sort_values.get(r["code"], 0),
                float(r.get("sold_qty") or 0),
                float(r.get("sold_revenue") or 0),
                r.get("code") or "",
                r.get("channel") or "",
                r.get("shop_id") or "",
            ),
            reverse=reverse,
        )

        if top_n and top_n > 0:
            ordered_codes: List[str] = []
            for row in export_rows:
                code = row["code"]
                if code not in ordered_codes:
                    ordered_codes.append(code)
                if len(ordered_codes) >= top_n:
                    break
            allowed_codes = set(ordered_codes[:top_n])
            export_rows = [row for row in export_rows if row["code"] in allowed_codes]

        return export_rows

    @staticmethod
    def _normalize_codes(codes: List[str]) -> List[str]:
        normalized: List[str] = []
        seen = set()
        for code in codes or []:
            cleaned = str(code or "").strip().upper()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            normalized.append(cleaned)
        return normalized

    def search_product_codes(self, keyword: Optional[str] = "", limit: int = 30) -> List[Dict]:
        safe_limit = max(1, min(int(limit or 30), 100))
        kw = str(keyword or "").strip()
        params = {"limit": safe_limit}

        where_sql = "WHERE brand_key = :brand_key"
        params["brand_key"] = self.brand_key
        if kw:
            params["kw"] = f"%{kw}%"
            where_sql = "WHERE brand_key = :brand_key AND (code LIKE :kw OR name LIKE :kw)"

        rows = self.db.execute(
            text(
                f"""
                SELECT code, name, total_stock
                FROM sales_product_stock_current
                {where_sql}
                ORDER BY total_stock DESC, code ASC
                LIMIT :limit
                """
            ),
            params,
        ).fetchall()

        return [
            {
                "code": row[0],
                "name": row[1] or "",
                "current_stock": float(row[2] or 0),
            }
            for row in rows
        ]

    def get_product_planning_4w(
        self,
        codes: List[str],
        anchor_time_ms: Optional[int] = None,
        weeks: int = 4,
    ) -> Dict:
        selected_codes = self._normalize_codes(codes)
        if not selected_codes:
            raise ValueError("Vui lòng chọn ít nhất 1 mã sản phẩm")

        safe_weeks = max(1, min(int(weeks or 4), 8))
        anchor_ms = int(anchor_time_ms or int(time.time() * 1000))
        week_ms = 7 * 24 * 60 * 60 * 1000

        windows: List[Dict] = []
        code_weekly_qty: Dict[str, List[float]] = {code: [0.0] * safe_weeks for code in selected_codes}
        code_name_map: Dict[str, str] = {}

        for i in range(safe_weeks):
            # oldest -> newest
            start_ms = anchor_ms - ((safe_weeks - i) * week_ms)
            end_ms = anchor_ms - ((safe_weeks - i - 1) * week_ms)
            windows.append(
                {
                    "index": i + 1,
                    "time_start": int(start_ms),
                    "time_end": int(end_ms),
                }
            )

            raw_data = self._post_salework_report(int(start_ms), int(end_ms))
            product_report = raw_data.get("data", {}).get("product_report", {})
            rows = aggregate_sales_report(product_report)
            qty_map: Dict[str, float] = {}
            for row in rows:
                code = str(row.get("code") or "").strip().upper()
                if not code:
                    continue
                if row.get("name"):
                    code_name_map[code] = str(row.get("name"))
                qty_map[code] = float(qty_map.get(code, 0.0)) + float(row.get("sold_qty") or 0)

            for code in selected_codes:
                code_weekly_qty[code][i] = float(qty_map.get(code, 0.0))

        placeholders = ", ".join([f":c{i}" for i in range(len(selected_codes))])
        params = {f"c{i}": code for i, code in enumerate(selected_codes)}
        params["brand_key"] = self.brand_key
        stock_rows = self.db.execute(
            text(
                f"""
                SELECT code, name, total_stock
                FROM sales_product_stock_current
                WHERE brand_key = :brand_key
                  AND code IN ({placeholders})
                """
            ),
            params,
        ).fetchall()
        stock_map = {str(r[0]).strip().upper(): float(r[2] or 0) for r in stock_rows}
        stock_name_map = {str(r[0]).strip().upper(): str(r[1] or "") for r in stock_rows}

        items: List[Dict] = []
        for code in selected_codes:
            weekly_sales = [float(x or 0) for x in code_weekly_qty.get(code, [0.0] * safe_weeks)]
            total_4w = float(sum(weekly_sales))
            avg_weekly_sales = float(total_4w / safe_weeks) if safe_weeks > 0 else 0.0
            current_stock = float(stock_map.get(code, 0.0))
            weeks_to_stockout = (
                float(current_stock / avg_weekly_sales) if avg_weekly_sales > 0 else None
            )
            projected_stockout_at_ms = (
                int(anchor_ms + (weeks_to_stockout * week_ms)) if weeks_to_stockout is not None else None
            )

            items.append(
                {
                    "code": code,
                    "name": stock_name_map.get(code) or code_name_map.get(code) or "",
                    "weekly_sales": weekly_sales,
                    "total_4w_sales": total_4w,
                    "avg_weekly_sales": avg_weekly_sales,
                    "current_stock": current_stock,
                    "weeks_to_stockout": weeks_to_stockout,
                    "projected_stockout_at_ms": projected_stockout_at_ms,
                }
            )

        return {
            "weeks": windows,
            "anchor_time_ms": anchor_ms,
            "items": items,
            "summary": {
                "selected_codes": len(selected_codes),
                "total_stock": float(sum(item["current_stock"] for item in items)),
                "total_4w_sales": float(sum(item["total_4w_sales"] for item in items)),
            },
        }
