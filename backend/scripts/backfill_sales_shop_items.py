#!/usr/bin/env python3
"""One-off backfill: split raw_payload of existing sales_report_runs into
sales_report_shop_items so the shop filter works for historical data.

Idempotent: runs already marked in sales_report_shop_built are skipped.
Usage (inside backend container):  python scripts/backfill_sales_shop_items.py [brand ...]
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from drivers.db_client import SessionLocal  # noqa: E402
from services.salesManagementService import SalesManagementService  # noqa: E402

BRANDS = ["unbee", "himomi", "ranbee"]


def main(brands):
    db = SessionLocal()
    try:
        for brand in brands:
            service = SalesManagementService(db, brand_key=brand)
            rows = db.execute(
                text(
                    """
                    SELECT r.id
                    FROM sales_report_runs r
                    LEFT JOIN sales_report_shop_built b ON b.run_id = r.id
                    WHERE r.brand_key = :brand
                      AND b.run_id IS NULL
                    ORDER BY r.id ASC
                    """
                ),
                {"brand": brand},
            ).fetchall()
            run_ids = [int(r[0]) for r in rows]
            print(f"[{brand}] pending runs: {len(run_ids)}")
            started = time.time()
            done = 0
            batch = 200
            for start in range(0, len(run_ids), batch):
                done += service._ensure_shop_items_for_runs(run_ids[start:start + batch])
                print(f"[{brand}] built {done}/{len(run_ids)} ({time.time() - started:.1f}s)")
            print(f"[{brand}] finished: {done} runs in {time.time() - started:.1f}s")
    finally:
        db.close()


if __name__ == "__main__":
    main([b.strip().lower() for b in sys.argv[1:]] or BRANDS)
