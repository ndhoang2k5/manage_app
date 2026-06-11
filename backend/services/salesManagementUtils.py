from typing import Dict, List, Tuple


def filter_nested_runs(runs: List) -> List:
    """Drop runs fully contained in another run to avoid double counting."""
    if not runs or len(runs) <= 1:
        return runs

    parsed: List[Tuple] = []
    for run in runs:
        if len(run) >= 4:
            rid, ts, te, payload = run[0], int(run[1]), int(run[2]), run[3]
        else:
            rid, payload = run[0], run[1]
            ts, te = 0, 0
        parsed.append((rid, ts, te, payload))

    parsed.sort(key=lambda x: (x[2] - x[1]), reverse=True)
    selected: List[Tuple] = []
    for candidate in parsed:
        if any(candidate[1] >= sts and candidate[2] <= ste for _, sts, ste, _ in selected):
            continue
        selected = [
            kept
            for kept in selected
            if not (kept[1] >= candidate[1] and kept[2] <= candidate[2])
        ]
        selected.append(candidate)

    selected.sort(key=lambda x: x[1])
    return [(r[0], r[1], r[2], r[3]) for r in selected]


def aggregate_sales_report(product_report: Dict) -> List[Dict]:
    """Normalize Salework product_report object to aggregated rows by code."""
    aggregate: Dict[str, Dict] = {}

    if not isinstance(product_report, dict):
        return []

    for channel, shops in product_report.items():
        if not isinstance(shops, list):
            continue
        for shop in shops:
            products = shop.get("products", []) if isinstance(shop, dict) else []
            for product in products:
                if not isinstance(product, dict):
                    continue

                raw_code = str(product.get("code", "")).strip()
                if not raw_code:
                    continue
                code = raw_code.upper()

                amount = float(product.get("amount") or 0)
                revenue = float(product.get("revenue") or 0)
                name = str(product.get("name") or "").strip()

                row = aggregate.setdefault(
                    code,
                    {
                        "code": code,
                        "name": name,
                        "sold_qty": 0.0,
                        "sold_revenue": 0.0,
                        "channels": set(),
                        "shops": set(),
                    },
                )
                if name and not row["name"]:
                    row["name"] = name

                row["sold_qty"] += amount
                row["sold_revenue"] += revenue
                row["channels"].add(str(channel))
                row["shops"].add(str(shop.get("shopId", "")))

    results: List[Dict] = []
    for _, row in aggregate.items():
        channels = sorted([c for c in row["channels"] if c])
        shops_count = len([s for s in row["shops"] if s])
        results.append(
            {
                "code": row["code"],
                "name": row["name"],
                "sold_qty": row["sold_qty"],
                "sold_revenue": row["sold_revenue"],
                "channels": channels,
                "shops_count": shops_count,
            }
        )

    results.sort(key=lambda x: (x["sold_qty"], x["sold_revenue"]), reverse=True)
    return results


def aggregate_sales_report_by_shop(product_report: Dict) -> List[Dict]:
    """Normalize Salework product_report to rows per product + channel + shop."""
    aggregate: Dict[tuple, Dict] = {}

    if not isinstance(product_report, dict):
        return []

    for channel, shops in product_report.items():
        if not isinstance(shops, list):
            continue
        channel_name = str(channel or "").strip()
        for shop in shops:
            if not isinstance(shop, dict):
                continue
            shop_id = str(shop.get("shopId", "")).strip()
            products = shop.get("products", [])
            if not isinstance(products, list):
                continue
            for product in products:
                if not isinstance(product, dict):
                    continue

                raw_code = str(product.get("code", "")).strip()
                if not raw_code:
                    continue
                code = raw_code.upper()

                amount = float(product.get("amount") or 0)
                revenue = float(product.get("revenue") or 0)
                name = str(product.get("name") or "").strip()
                key = (code, channel_name, shop_id)

                row = aggregate.setdefault(
                    key,
                    {
                        "code": code,
                        "name": name,
                        "channel": channel_name,
                        "shop_id": shop_id,
                        "sold_qty": 0.0,
                        "sold_revenue": 0.0,
                    },
                )
                if name and not row["name"]:
                    row["name"] = name
                row["sold_qty"] += amount
                row["sold_revenue"] += revenue

    results = list(aggregate.values())
    results.sort(
        key=lambda x: (x["sold_qty"], x["sold_revenue"], x["code"], x["channel"], x["shop_id"]),
        reverse=True,
    )
    return results


def aggregate_product_stock(products_data: Dict) -> List[Dict]:
    """Normalize Salework product/list products object to stock rows by code."""
    rows: List[Dict] = []
    if not isinstance(products_data, dict):
        return rows

    for _, product in products_data.items():
        if not isinstance(product, dict):
            continue

        raw_code = str(product.get("code", "")).strip()
        if not raw_code:
            continue
        code = raw_code.upper()

        stocks = product.get("stocks", [])
        stock_by_warehouse = {}
        total_stock = 0.0
        if isinstance(stocks, list):
            for stock in stocks:
                if not isinstance(stock, dict):
                    continue
                wid = str(stock.get("wid", "")).strip()
                value = float(stock.get("value") or 0)
                if wid:
                    stock_by_warehouse[wid] = stock_by_warehouse.get(wid, 0.0) + value
                total_stock += value

        rows.append(
            {
                "code": code,
                "name": str(product.get("name") or "").strip(),
                "total_stock": total_stock,
                "stock_by_warehouse": stock_by_warehouse,
                "cost": float(product.get("cost") or 0),
                "retail_price": float(product.get("retailPrice") or 0),
                "barcode": str(product.get("barcode") or "").strip(),
            }
        )

    return rows
