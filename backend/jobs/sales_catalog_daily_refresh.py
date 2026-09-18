"""Daily refresh of the sales product catalog from the Salework product list.

The realtime worker already syncs stock every few minutes, but it runs stock
after sales and skips it when the sales fetch fails. This job only touches the
product list, so the catalog (codes added to / deleted from Salework) is
reconciled at least once a day whatever happens to the sales sync.
"""
import os
import threading
import time
from datetime import datetime, timedelta

from sqlalchemy import text

from drivers.db_client import SessionLocal
from services.salesManagementService import SalesManagementService

BRANDS = ("unbee", "himomi", "ranbee")
_worker_started = False


def seconds_until_next_run(now: datetime, hour: int, minute: int = 0) -> float:
    """Seconds from `now` to the next occurrence of hour:minute (today or tomorrow)."""
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def refresh_catalog_once() -> dict:
    """Sync the Salework product list for every brand and rebuild the catalog."""
    results = {}
    for brand_key in BRANDS:
        db = SessionLocal()
        try:
            service = SalesManagementService(db, brand_key=brand_key)
            before = db.execute(
                text("SELECT COUNT(1) FROM sales_product_catalog WHERE brand_key = :b"),
                {"b": brand_key},
            ).scalar() or 0
            result = service.sync_product_stock()
            after = int(result.get("synced_count") or 0)
            removed = int(result.get("removed_catalog_count") or 0)
            added = max(0, after - (int(before) - removed))
            results[brand_key] = {"total": after, "added": added, "removed": removed}
            print(
                f"[sales-catalog-refresh] brand={brand_key} total={after} added={added} removed={removed}"
            )
        except Exception as exc:
            results[brand_key] = {"error": str(exc)}
            print(f"[sales-catalog-refresh] failed brand={brand_key}: {exc}")
        finally:
            db.close()
    return results


def _worker_loop(hour: int, minute: int) -> None:
    while True:
        delay = seconds_until_next_run(datetime.now(), hour, minute)
        time.sleep(delay)
        refresh_catalog_once()


def start_sales_catalog_daily_refresh_worker() -> None:
    global _worker_started
    if _worker_started:
        return
    enabled = os.getenv("SALEWORK_CATALOG_REFRESH_ENABLED", "true").lower() == "true"
    if not enabled:
        return
    hour = max(0, min(23, int(os.getenv("SALEWORK_CATALOG_REFRESH_HOUR", "5"))))
    minute = max(0, min(59, int(os.getenv("SALEWORK_CATALOG_REFRESH_MINUTE", "0"))))
    thread = threading.Thread(
        target=_worker_loop,
        args=(hour, minute),
        daemon=True,
        name="sales-catalog-daily-refresh-worker",
    )
    thread.start()
    _worker_started = True
    print(f"[sales-catalog-refresh] worker started, daily at {hour:02d}:{minute:02d}")
