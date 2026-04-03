import os
import threading
import time

from drivers.db_client import SessionLocal
from services.salesManagementService import SalesManagementService

_worker_started = False


def _sync_worker_loop(interval_seconds: int) -> None:
    while True:
        db = SessionLocal()
        try:
            service = SalesManagementService(db)
            service.sync_now(user={"id": 0})
        except Exception as exc:
            print(f"[sales-realtime-sync] sync failed: {exc}")
        finally:
            db.close()
        time.sleep(interval_seconds)


def start_sales_realtime_sync_worker() -> None:
    global _worker_started
    if _worker_started:
        return

    enabled = os.getenv("SALEWORK_AUTO_SYNC_ENABLED", "false").lower() == "true"
    if not enabled:
        return

    interval_seconds = int(os.getenv("SALEWORK_AUTO_SYNC_INTERVAL_SECONDS", "300"))
    if interval_seconds < 30:
        interval_seconds = 30

    thread = threading.Thread(
        target=_sync_worker_loop,
        args=(interval_seconds,),
        daemon=True,
        name="sales-realtime-sync-worker",
    )
    thread.start()
    _worker_started = True
    print(f"[sales-realtime-sync] worker started, interval={interval_seconds}s")
