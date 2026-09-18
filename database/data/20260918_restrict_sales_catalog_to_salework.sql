-- Migration: sales_product_catalog only holds codes currently on Salework
-- Date: 2026-09-18
-- Purpose: the catalog was seeded from every sales run ever stored, so codes
--          that only exist in old orders (ad-hoc/deleted products with joined
--          names or no name) showed up in the sales report. The catalog is now
--          a mirror of the Salework product list (sales_product_stock_current)
--          and is rebuilt on every stock sync. Drop the extra codes.
-- Safe to run multiple times (idempotent).

DELETE c FROM sales_product_catalog c
LEFT JOIN sales_product_stock_current st
    ON st.brand_key = c.brand_key AND st.code = c.code
WHERE st.code IS NULL;
