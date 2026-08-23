import json
import unittest
from unittest.mock import patch

from services.householdSalesService import HouseholdSalesService


def _run(product_report):
    return (1, 1000, 2000, json.dumps({"data": {"product_report": product_report}}))


class HouseholdSalesServiceTests(unittest.TestCase):
    def test_le_doan_bac_only_aggregates_two_mapped_tiktok_shops(self):
        product_report = {
            "Tiktok": [
                {
                    "shopId": "7494799271700827004",
                    "products": [{"code": "pn01", "name": "Ao", "amount": 2, "revenue": 20}],
                },
                {
                    "shopId": "7495100035829696886",
                    "products": [{"code": "PN01", "name": "Ao", "amount": 3, "revenue": 30}],
                },
                {
                    "shopId": "not-mapped",
                    "products": [{"code": "PN01", "name": "Ao", "amount": 100, "revenue": 1000}],
                },
            ],
            "Shopee": [
                {
                    "shopId": "943867691",
                    "products": [{"code": "PN01", "name": "Ao", "amount": 100, "revenue": 1000}],
                }
            ],
        }

        def fake_fetch(_household_service, brand_service, **_kwargs):
            return [_run(product_report)] if brand_service.brand_key == "unbee" else []

        service = HouseholdSalesService(db=None)
        with patch(
            "services.householdSalesService.HouseholdSalesService._fetch_selected_runs_with_payload",
            new=fake_fetch,
        ), patch.object(service, "_load_stock", return_value={"PN01": 7}) as load_stock:
            result = service.get_report("le_doan_bac", 1000, 3000)

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["sold_qty"], 5.0)
        self.assertEqual(result["items"][0]["sold_revenue"], 50.0)
        self.assertEqual(result["items"][0]["shops_count"], 2)
        self.assertEqual(result["items"][0]["current_stock"], 7.0)
        self.assertEqual(result["matched_shop_count"], 2)
        load_stock.assert_called_once_with(["PN01"], {"unbee", "ranbee"})
        self.assertEqual(result["stock_brand_keys"], ["ranbee", "unbee"])

    def test_unbeekid_combines_unbee_and_ranbee_sources(self):
        reports = {
            "unbee": {
                "Shopee": [
                    {
                        "shopId": "1299057191",
                        "products": [{"code": "PN01", "name": "Ao", "amount": 4, "revenue": 40}],
                    }
                ]
            },
            "ranbee": {
                "Tiktok": [
                    {
                        "shopId": "7495762860384487671",
                        "products": [{"code": "pn01", "name": "Ao", "amount": 6, "revenue": 60}],
                    }
                ]
            },
        }

        def fake_fetch(_household_service, brand_service, **_kwargs):
            return [_run(reports[brand_service.brand_key])]

        service = HouseholdSalesService(db=None)
        with patch(
            "services.householdSalesService.HouseholdSalesService._fetch_selected_runs_with_payload",
            new=fake_fetch,
        ), patch.object(service, "_load_stock", return_value={"PN01": 9}) as load_stock:
            result = service.get_report("unbeekid", 1000, 3000)

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["sold_qty"], 10.0)
        self.assertEqual(result["items"][0]["shops_count"], 2)
        self.assertEqual(set(result["runs_by_brand"]), {"unbee", "ranbee"})
        load_stock.assert_called_once_with(["PN01"], {"unbee", "ranbee"})

    def test_unknown_household_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "không hợp lệ"):
            HouseholdSalesService(db=None).get_report("unknown", 1000, 3000)


if __name__ == "__main__":
    unittest.main()
