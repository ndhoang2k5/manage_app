import unittest

from services.salesManagementUtils import aggregate_sales_report, aggregate_product_stock


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


if __name__ == "__main__":
    unittest.main()
