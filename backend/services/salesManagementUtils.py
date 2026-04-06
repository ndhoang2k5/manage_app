from typing import Dict, List


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
