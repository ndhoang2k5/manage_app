#!/usr/bin/env python3
"""Audit unique shops in Salework sales_report_runs payloads for each brand."""
import json
from drivers.db_client import SessionLocal
from sqlalchemy import text

BRANDS = ["unbee", "himomi", "ranbee"]


def main():
    db = SessionLocal()
    all_shop_keys = set()
    missing_id_examples = []
    summary = {}

    try:
        for brand in BRANDS:
            rows = db.execute(
                text(
                    """
                    SELECT id, time_start, time_end, raw_payload
                    FROM sales_report_runs
                    WHERE brand_key = :b
                      AND raw_payload IS NOT NULL
                      AND (
                        (time_end - time_start) BETWEEN 86000000 AND 87000000
                        OR id IN (
                          SELECT id FROM (
                            SELECT id
                            FROM sales_report_runs
                            WHERE brand_key = :b
                              AND raw_payload LIKE '%shopId%'
                            ORDER BY id DESC
                            LIMIT 500
                          ) t
                        )
                      )
                    ORDER BY id DESC
                    """
                ),
                {"b": brand},
            ).fetchall()

            shops = {}
            channels_seen = set()
            runs_scanned = 0
            runs_with_shops = 0
            name_only_count = 0

            for rid, _ts, _te, raw in rows:
                runs_scanned += 1
                try:
                    payload = json.loads(raw)
                except Exception:
                    continue
                pr = None
                if isinstance(payload, dict):
                    data = payload.get("data")
                    if isinstance(data, dict):
                        pr = data.get("product_report")
                    if pr is None:
                        pr = payload.get("product_report")
                if not isinstance(pr, dict):
                    continue

                found = False
                for channel, shop_list in pr.items():
                    if not isinstance(shop_list, list):
                        continue
                    for shop in shop_list:
                        if not isinstance(shop, dict):
                            continue
                        found = True
                        channels_seen.add(str(channel))
                        all_shop_keys.update(shop.keys())

                        shop_id = shop.get("shopId", shop.get("shop_id", shop.get("id")))
                        shop_name = shop.get(
                            "shopName",
                            shop.get("shop_name", shop.get("name", shop.get("title"))),
                        )
                        sid = "" if shop_id is None else str(shop_id).strip()
                        sname = "" if shop_name is None else str(shop_name).strip()
                        products_n = (
                            len(shop.get("products") or [])
                            if isinstance(shop.get("products"), list)
                            else 0
                        )

                        if not sid and sname:
                            name_only_count += 1
                            if len(missing_id_examples) < 30:
                                missing_id_examples.append(
                                    {
                                        "brand": brand,
                                        "channel": channel,
                                        "shop_name": sname,
                                        "run_id": rid,
                                        "keys": sorted(shop.keys()),
                                    }
                                )

                        key = (str(channel), sid or f"__NO_ID__:{sname or 'EMPTY'}")
                        entry = shops.setdefault(
                            key,
                            {
                                "brand": brand,
                                "channel": str(channel),
                                "shop_id": sid,
                                "shop_name": sname,
                                "has_id": bool(sid),
                                "has_name": bool(sname),
                                "run_hits": 0,
                                "max_products": 0,
                                "sample_run_id": rid,
                            },
                        )
                        entry["run_hits"] += 1
                        entry["max_products"] = max(entry["max_products"], products_n)
                        if sname and not entry["shop_name"]:
                            entry["shop_name"] = sname

                if found:
                    runs_with_shops += 1

            shop_list = sorted(
                shops.values(),
                key=lambda x: (x["channel"], x["shop_id"] or x["shop_name"] or ""),
            )
            summary[brand] = {
                "runs_scanned": runs_scanned,
                "runs_with_shops": runs_with_shops,
                "unique_shops": len(shop_list),
                "shops_with_id": sum(1 for s in shop_list if s["has_id"]),
                "shops_without_id": sum(1 for s in shop_list if not s["has_id"]),
                "shops_with_name": sum(1 for s in shop_list if s["has_name"]),
                "name_only_occurrences": name_only_count,
                "id_only_unique": sum(1 for s in shop_list if s["has_id"] and not s["has_name"]),
                "both_unique": sum(1 for s in shop_list if s["has_id"] and s["has_name"]),
                "channels": sorted(channels_seen),
                "shops": shop_list,
            }

            print(f"==== {brand} ====")
            print(
                f"runs_scanned={runs_scanned} runs_with_shops={runs_with_shops} "
                f"unique_shops={len(shop_list)} with_id={summary[brand]['shops_with_id']} "
                f"without_id={summary[brand]['shops_without_id']} with_name={summary[brand]['shops_with_name']}"
            )
            print("channels", sorted(channels_seen))
            for s in shop_list:
                print(
                    f"  {s['channel']} | id={s['shop_id']!r} | name={s['shop_name']!r} | hits={s['run_hits']}"
                )

        out = {
            "shop_object_keys": sorted(all_shop_keys),
            "name_only_examples": missing_id_examples,
            "brands": summary,
        }
        path = "/tmp/sales_shops_audit.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print("ALL_SHOP_OBJECT_KEYS", sorted(all_shop_keys))
        print("NAME_ONLY_EXAMPLES", len(missing_id_examples))
        print("WROTE", path)
    finally:
        db.close()


if __name__ == "__main__":
    main()
