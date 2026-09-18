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


class ReportOrderingTests(unittest.TestCase):
    def _service(self):
        from services.salesManagementService import SalesManagementService

        return SalesManagementService(db=None, brand_key="unbee")

    def test_sales_sorts_push_codes_without_sales_to_the_end(self):
        svc = self._service()
        order = svc._build_report_order_sql("sold_qty", "desc")
        self.assertTrue(order.startswith("(agg.sold_qty > 0 OR agg.sold_revenue > 0) DESC"))
        self.assertIn("agg.sold_qty DESC", order)
        self.assertTrue(order.endswith("agg.code ASC"))

        order_asc = svc._build_report_order_sql("sold_revenue", "asc")
        self.assertTrue(order_asc.startswith("(agg.sold_qty > 0 OR agg.sold_revenue > 0) DESC"))
        self.assertIn("agg.sold_revenue ASC", order_asc)

    def test_other_sorts_do_not_force_sales_first(self):
        svc = self._service()
        order = svc._build_report_order_sql("current_stock", "desc")
        self.assertFalse(order.startswith("(agg.sold_qty > 0"))
        self.assertTrue(order.startswith("agg.current_stock DESC"))
        self.assertEqual(svc._build_report_order_sql("unknown", "desc").split(",")[1].strip(), "agg.sold_qty DESC")

    def test_base_sql_lists_catalog_and_applies_filters(self):
        svc = self._service()
        params = {}
        sql = svc._build_report_base_sql(params, keyword="pn", only_priority_codes=True, min_qty=5, min_revenue=0)
        self.assertIn("FROM sales_product_catalog c", sql)
        self.assertIn("LEFT JOIN tmp_period_sales ps", sql)
        self.assertIn("LEFT JOIN sales_product_stock_current st", sql)
        self.assertIn("sp.code IS NOT NULL", sql)
        self.assertIn("COALESCE(ps.sold_qty, 0) >= :min_qty", sql)
        self.assertNotIn("COALESCE(ps.sold_revenue, 0) >= :min_revenue", sql)
        self.assertEqual(params["keyword"], "%pn%")
        self.assertEqual(params["brand_key"], "unbee")


class CatalogMirrorsSaleworkTests(unittest.TestCase):
    def test_sales_runs_never_feed_the_catalog(self):
        import inspect
        from services.salesManagementService import SalesManagementService

        self.assertFalse(hasattr(SalesManagementService, "_upsert_catalog_codes"))
        self.assertNotIn("sales_product_catalog", inspect.getsource(SalesManagementService.fetch_and_store))
        self.assertIn("_rebuild_catalog_from_stock", inspect.getsource(SalesManagementService.sync_product_stock))
        self.assertIn("DELETE FROM sales_product_stock_current", inspect.getsource(SalesManagementService.sync_product_stock))

    def test_rebuild_removes_codes_absent_from_stock(self):
        import inspect
        from services.salesManagementService import SalesManagementService

        src = inspect.getsource(SalesManagementService._rebuild_catalog_from_stock)
        self.assertIn("DELETE c FROM sales_product_catalog c", src)
        self.assertIn("st.code IS NULL", src)
        seed = inspect.getsource(SalesManagementService._ensure_catalog_seeded)
        self.assertNotIn("sales_report_items", seed)

    def test_export_by_shop_skips_codes_outside_catalog(self):
        import inspect
        from services.salesManagementService import SalesManagementService

        src = inspect.getsource(SalesManagementService.get_report_by_shop_for_export)
        self.assertIn("if code not in catalog_names:", src)


class CatalogDailyRefreshTests(unittest.TestCase):
    def test_next_run_is_today_or_tomorrow(self):
        from datetime import datetime
        from jobs.sales_catalog_daily_refresh import seconds_until_next_run

        now = datetime(2026, 9, 18, 4, 30)
        self.assertEqual(seconds_until_next_run(now, 5), 30 * 60)
        now = datetime(2026, 9, 18, 5, 0)
        self.assertEqual(seconds_until_next_run(now, 5), 24 * 3600)
        now = datetime(2026, 9, 18, 23, 59)
        self.assertEqual(seconds_until_next_run(now, 0, 0), 60)
