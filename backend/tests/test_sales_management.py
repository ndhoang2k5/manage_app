import unittest

from services.salesManagementUtils import (
    aggregate_sales_report,
    aggregate_sales_report_by_shop,
    aggregate_product_stock,
    filter_nested_runs,
)


class AggregateSalesReportTests(unittest.TestCase):
    def test_aggregate_sales_report_groups_by_code_and_sums_values(self):
        product_report = {
            "Shopee": [
                {
                    "shopId": "s1",
                    "products": [
                        {"code": "pn01", "amount": 2, "revenue": 100000, "name": "Ao 1"},
                        {"code": "PN01", "amount": 1, "revenue": 50000, "name": "Ao 1"},
                    ],
                }
            ],
            "Tiktok": [
                {
                    "shopId": "t1",
                    "products": [
                        {"code": "pn01", "amount": 3, "revenue": 150000, "name": "Ao 1"},
                        {"code": "pn02", "amount": 4, "revenue": 200000, "name": "Ao 2"},
                    ],
                }
            ],
        }

        rows = aggregate_sales_report(product_report)
        by_code = {row["code"]: row for row in rows}

        self.assertEqual(set(by_code.keys()), {"PN01", "PN02"})
        self.assertEqual(by_code["PN01"]["sold_qty"], 6.0)
        self.assertEqual(by_code["PN01"]["sold_revenue"], 300000.0)
        self.assertEqual(by_code["PN01"]["shops_count"], 2)
        self.assertIn("Shopee", by_code["PN01"]["channels"])
        self.assertIn("Tiktok", by_code["PN01"]["channels"])

    def test_aggregate_sales_report_by_shop_splits_channels_and_shops(self):
        product_report = {
            "Shopee": [
                {
                    "shopId": "s1",
                    "products": [
                        {"code": "pn01", "amount": 2, "revenue": 100000, "name": "Ao 1"},
                    ],
                },
                {
                    "shopId": "s2",
                    "products": [
                        {"code": "PN01", "amount": 1, "revenue": 50000, "name": "Ao 1"},
                    ],
                },
            ],
            "Tiktok": [
                {
                    "shopId": "t1",
                    "products": [
                        {"code": "pn01", "amount": 3, "revenue": 150000, "name": "Ao 1"},
                    ],
                }
            ],
        }

        rows = aggregate_sales_report_by_shop(product_report)
        self.assertEqual(len(rows), 3)
        by_key = {(r["channel"], r["shop_id"]): r for r in rows}
        self.assertEqual(by_key[("Shopee", "s1")]["sold_qty"], 2.0)
        self.assertEqual(by_key[("Shopee", "s2")]["sold_qty"], 1.0)
        self.assertEqual(by_key[("Tiktok", "t1")]["sold_qty"], 3.0)

    def test_aggregate_sales_report_ignores_invalid_rows(self):
        product_report = {
            "Shopee": [{"shopId": "s1", "products": [{"code": "", "amount": 1, "revenue": 1}]}],
            "BadChannel": "invalid",
        }
        rows = aggregate_sales_report(product_report)
        self.assertEqual(rows, [])

    def test_aggregate_product_stock_sums_stock_by_code(self):
        products_data = {
            "a": {
                "code": "pn01",
                "name": "Ao 1",
                "cost": 10000,
                "retailPrice": 50000,
                "barcode": "123",
                "stocks": [{"wid": "W1", "value": 3}, {"wid": "W2", "value": 2}],
            },
            "b": {
                "code": "PN02",
                "name": "Ao 2",
                "stocks": [{"wid": "W1", "value": 0}],
            },
        }
        rows = aggregate_product_stock(products_data)
        by_code = {r["code"]: r for r in rows}
        self.assertEqual(by_code["PN01"]["total_stock"], 5.0)
        self.assertEqual(by_code["PN01"]["stock_by_warehouse"]["W1"], 3.0)
        self.assertEqual(by_code["PN01"]["stock_by_warehouse"]["W2"], 2.0)
        self.assertEqual(by_code["PN02"]["total_stock"], 0.0)


class FilterNestedRunsTests(unittest.TestCase):
    def test_filter_nested_runs_drops_fully_contained_windows(self):
        runs = [
            (1, 0, 100, "daily"),
            (2, 10, 20, "nested"),
            (3, 95, 110, "boundary"),
        ]
        filtered = filter_nested_runs(runs)
        kept_ids = [r[0] for r in filtered]
        self.assertIn(1, kept_ids)
        self.assertNotIn(2, kept_ids)
        self.assertIn(3, kept_ids)


if __name__ == "__main__":
    unittest.main()


class SalesShopOptionsTests(unittest.TestCase):
    def test_unbee_shop_options_contain_all_six_shops_with_labels(self):
        from services.salesManagementShops import get_shop_options, normalize_shop_id

        options = get_shop_options("unbee")
        ids = {o["shop_id"] for o in options}
        self.assertEqual(
            ids,
            {
                "1299057191",
                "1404479884",
                "943867691",
                "585510534",
                "7494799271700827004",
                "7495100035829696886",
            },
        )
        by_id = {o["shop_id"]: o for o in options}
        self.assertEqual(by_id["943867691"]["channel"], "Shopee")
        self.assertEqual(by_id["7495100035829696886"]["channel"], "Tiktok")
        self.assertIn("C Hằng", by_id["943867691"]["label"])
        self.assertIn("(585510534)", by_id["585510534"]["label"])
        self.assertEqual(get_shop_options("himomi"), [])
        self.assertEqual(get_shop_options("unknown"), [])
        self.assertEqual(normalize_shop_id("  1299057191 "), "1299057191")
        self.assertEqual(normalize_shop_id(None), "")
