"""Shop mapping for the sales-management shop filter.

Salework report/product only returns shopId per channel, never the shop name.
This list is the business mapping used by the "Lọc shop" dropdown on the
sales-management page. Filtering is done by shop_id only; channel/name/owner
are for display.
"""
from typing import Dict, List

SALES_SHOP_OPTIONS: Dict[str, List[Dict]] = {
    "unbee": [
        {"shop_id": "1299057191", "channel": "Shopee", "name": "UNBEE FASHION", "owner": "Leader a Đạt"},
        {"shop_id": "1404479884", "channel": "Shopee", "name": "UNBEE TINNY BODY", "owner": "Leader a Đạt"},
        {"shop_id": "943867691", "channel": "Shopee", "name": "SHOPEE UNBEE MOM&BABY", "owner": "C Hằng"},
        {"shop_id": "585510534", "channel": "Shopee", "name": "SHOPEE UNBEE FLAGSHIP", "owner": "C Bùi Giang"},
        {"shop_id": "7494799271700827004", "channel": "Tiktok", "name": "TIKTOK UNBEE VN", "owner": "C Đỗ Giang"},
        {"shop_id": "7495100035829696886", "channel": "Tiktok", "name": "TIKTOK UNBEE BABY", "owner": "C Uyên"},
    ],
    "himomi": [],
    "ranbee": [],
}


def get_shop_options(brand_key: str) -> List[Dict]:
    key = str(brand_key or "").strip().lower()
    options = []
    for shop in SALES_SHOP_OPTIONS.get(key, []):
        label = f"{shop['name']} - {shop['owner']}" if shop.get("owner") else shop["name"]
        options.append(
            {
                "shop_id": shop["shop_id"],
                "channel": shop["channel"],
                "name": shop["name"],
                "owner": shop.get("owner") or "",
                "label": f"{label} ({shop['shop_id']})",
            }
        )
    return options


def normalize_shop_id(shop_id) -> str:
    return str(shop_id or "").strip()
