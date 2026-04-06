import json
import os
import time
from typing import Dict, List, Optional
from urllib import request, error

from sqlalchemy import text
from sqlalchemy.orm import Session

from services.salesManagementUtils import aggregate_sales_report, aggregate_product_stock


class SalesManagementService:
    REPORT_URL = "https://salework.net/api/open/stock/v1/report/product"
    PRODUCT_LIST_URL = "https://salework.net/api/open/stock/v1/product/list"

    def __init__(self, db: Session):
        self.db = db
        # Avoid DDL on every request in production; keep optional bootstrap for dev.
        if os.getenv("SALEWORK_AUTO_BOOTSTRAP_SCHEMA", "false").lower() == "true":
            self._ensure_tables()

    def _ensure_tables(self) -> None:
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_report_runs (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    time_start BIGINT NOT NULL,
                    time_end BIGINT NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'success',
                    raw_payload LONGTEXT,
                    created_by INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_sales_report_period (time_start, time_end)
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
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_priority_codes (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    code VARCHAR(128) NOT NULL,
                    note VARCHAR(255) NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_by INT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_sales_priority_code (code)
                )
                """
            )
        )
        self.db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS sales_product_stock_current (
                    code VARCHAR(128) PRIMARY KEY,
                    name VARCHAR(255) NULL,
                    total_stock DECIMAL(18, 4) NOT NULL DEFAULT 0,
                    stock_by_warehouse_json TEXT,
                    cost DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    retail_price DECIMAL(18, 2) NOT NULL DEFAULT 0,
                    barcode VARCHAR(128) NULL,
                    synced_at_ms BIGINT NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
                """
            )
        )
        self.db.commit()

    def _get_salework_credentials(self) -> Dict[str, str]:
        client_id = os.getenv("SALEWORK_CLIENT_ID")
        token = os.getenv("SALEWORK_TOKEN")
        if not client_id or not token:
            raise ValueError("Thiếu cấu hình SALEWORK_CLIENT_ID hoặc SALEWORK_TOKEN")
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
                WHERE time_start = :time_start AND time_end = :time_end
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"time_start": time_start, "time_end": time_end},
        ).fetchone()
        return row[0] if row else None

    def _get_latest_synced_end(self) -> Optional[int]:
        row = self.db.execute(text("SELECT MAX(time_end) FROM sales_report_runs")).fetchone()
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

        existing_run_id = self._get_run_id_for_period(time_start, time_end)
        if existing_run_id and not force_refresh:
            return {"run_id": existing_run_id, "reused": True}

        raw_data = self._post_salework_report(time_start, time_end)
        product_report = raw_data.get("data", {}).get("product_report", {})
        items = aggregate_sales_report(product_report)

        try:
            if existing_run_id:
                self.db.execute(text("DELETE FROM sales_report_runs WHERE id = :run_id"), {"run_id": existing_run_id})

            self.db.execute(
                text(
                    """
                    INSERT INTO sales_report_runs (time_start, time_end, status, raw_payload, created_by)
                    VALUES (:time_start, :time_end, :status, :raw_payload, :created_by)
                    """
                ),
                {
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

            self.db.commit()
            return {"run_id": run_id, "reused": False, "items_count": len(items)}
        except Exception:
            self.db.rollback()
            raise

    def sync_now(self, user: dict, start_time: Optional[int] = None) -> Dict:
        latest_end = self._get_latest_synced_end()
        from_time = latest_end if latest_end is not None else (start_time or self._default_start_time())
        to_time = int(time.time() * 1000)

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
                        (code, name, total_stock, stock_by_warehouse_json, cost, retail_price, barcode, synced_at_ms)
                        VALUES
                        (:code, :name, :total_stock, :stock_by_warehouse_json, :cost, :retail_price, :barcode, :synced_at_ms)
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
                WHERE is_active = 1
                ORDER BY updated_at DESC, code ASC
                """
            )
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
                self.db.execute(text("UPDATE sales_priority_codes SET is_active = 0"))

            for code in normalized_codes:
                self.db.execute(
                    text(
                        """
                        INSERT INTO sales_priority_codes (code, note, is_active, created_by)
                        VALUES (:code, :note, 1, :created_by)
                        ON DUPLICATE KEY UPDATE
                            note = VALUES(note),
                            is_active = 1,
                            created_by = VALUES(created_by)
                        """
                    ),
                    {"code": code, "note": note, "created_by": user.get("id")},
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
                ORDER BY id DESC
                LIMIT 1
                """
            )
        ).fetchone()
        total_runs = self.db.execute(text("SELECT COUNT(1) FROM sales_report_runs")).fetchone()[0]
        total_items = self.db.execute(text("SELECT COUNT(1) FROM sales_report_items")).fetchone()[0]
        stock_status = self.db.execute(
            text("SELECT MAX(synced_at_ms), COUNT(1) FROM sales_product_stock_current")
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
    ) -> Dict:
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 50
        page_size = min(page_size, 200)

        if run_id is None and (time_start is None or time_end is None):
            latest = self.db.execute(text("SELECT id FROM sales_report_runs ORDER BY id DESC LIMIT 1")).fetchone()
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
        direction = "ASC" if str(sort_dir).lower() == "asc" else "DESC"

        params = {"min_qty": min_qty, "min_revenue": min_revenue}
        where_clauses = []
        if run_id is not None:
            where_clauses.append("i.run_id = :run_id")
            params["run_id"] = run_id
        else:
            # Use half-open overlap filter [time_start, time_end) to avoid missing edge windows.
            where_clauses.append("r.time_end > :time_start")
            where_clauses.append("r.time_start < :time_end")
            params["time_start"] = int(time_start)
            params["time_end"] = int(time_end)

        if keyword:
            params["keyword"] = f"%{keyword.strip()}%"
        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        if keyword:
            keyword_having = " AND (i.code LIKE :keyword OR MAX(i.name) LIKE :keyword)"
        else:
            keyword_having = ""
        priority_having = " AND MAX(CASE WHEN sp.code IS NOT NULL THEN 1 ELSE 0 END) = 1" if only_priority_codes else ""

        base_aggregate_sql = f"""
            SELECT
                i.code AS code,
                MAX(i.name) AS name,
                SUM(i.sold_qty) AS sold_qty,
                SUM(i.sold_revenue) AS sold_revenue,
                GROUP_CONCAT(i.channels_json SEPARATOR '||') AS channels_blob,
                SUM(i.shops_count) AS shops_count,
                MAX(CASE WHEN sp.code IS NOT NULL THEN 1 ELSE 0 END) AS is_priority,
                COALESCE(MAX(st.total_stock), 0) AS current_stock
            FROM sales_report_items i
            JOIN sales_report_runs r ON r.id = i.run_id
            LEFT JOIN sales_priority_codes sp ON sp.code = i.code AND sp.is_active = 1
            LEFT JOIN sales_product_stock_current st ON st.code = i.code
            WHERE {where_sql}
            GROUP BY i.code
            HAVING SUM(i.sold_qty) >= :min_qty
               AND SUM(i.sold_revenue) >= :min_revenue
               {keyword_having}
               {priority_having}
        """

        count_row = self.db.execute(
            text(
                f"""
                SELECT COUNT(1)
                FROM ({base_aggregate_sql}) agg
                """
            ),
            params,
        ).fetchone()
        total = int(count_row[0]) if count_row and count_row[0] is not None else 0

        offset = (page - 1) * page_size
        params["limit"] = page_size
        params["offset"] = offset

        rows = self.db.execute(
            text(
                f"""
                SELECT *
                FROM ({base_aggregate_sql}) agg
                ORDER BY {sort_column} {direction}, agg.code ASC
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        ).fetchall()

        items = []
        for row in rows:
            channels_set = set()
            blobs = (row[4] or "").split("||") if row[4] else []
            for raw_blob in blobs:
                if not raw_blob:
                    continue
                try:
                    parsed = json.loads(raw_blob)
                    if isinstance(parsed, list):
                        for channel in parsed:
                            if channel:
                                channels_set.add(str(channel))
                except (json.JSONDecodeError, TypeError):
                    continue

            items.append(
                {
                    "code": row[0],
                    "name": row[1],
                    "sold_qty": float(row[2]),
                    "sold_revenue": float(row[3]),
                    "channels": sorted(list(channels_set)),
                    "shops_count": int(row[5]),
                    "is_priority": bool(row[6]),
                    "current_stock": float(row[7] or 0),
                }
            )

        return {
            "run_id": run_id,
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

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
