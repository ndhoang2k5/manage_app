-- Migration: catalog of every product code known per brand (sales management)
-- Date: 2026-09-17
-- Purpose: the sales report only listed codes that had a sales row inside the
--          selected period, so codes with Salework stock but no sales (or sales
--          in other periods but no stock now) disappeared. This table holds the
--          union of every code ever seen in sales runs or in the stock snapshot;
--          the report LEFT JOINs period sales and stock onto it so all codes show.
--          The service keeps it up to date on every sales/stock sync.
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS sales_product_catalog (
    brand_key VARCHAR(32) NOT NULL DEFAULT 'unbee',
    code VARCHAR(128) NOT NULL,
    name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (brand_key, code)
);

-- Seed from the stock snapshot (name preferred from Salework product list).
INSERT INTO sales_product_catalog (brand_key, code, name)
SELECT st.brand_key, st.code, st.name
FROM sales_product_stock_current st
ON DUPLICATE KEY UPDATE name = COALESCE(NULLIF(VALUES(name), ''), sales_product_catalog.name);

-- Seed from every sales run ever stored.
INSERT INTO sales_product_catalog (brand_key, code, name)
SELECT r.brand_key, i.code, MAX(i.name)
FROM sales_report_items i
INNER JOIN sales_report_runs r ON r.id = i.run_id
GROUP BY r.brand_key, i.code
ON DUPLICATE KEY UPDATE name = COALESCE(sales_product_catalog.name, VALUES(name));
