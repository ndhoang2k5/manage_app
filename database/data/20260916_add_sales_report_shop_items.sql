-- Migration: per-shop sales report items (shop filter on sales management)
-- Date: 2026-09-16
-- Purpose: sales_report_items only stores totals per product code, so filtering
--          by shop was impossible. This table stores the same report split by
--          channel + shopId. sales_report_shop_built marks runs whose payload
--          has already been split, so old runs can be backfilled lazily.
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS sales_report_shop_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    run_id INT NOT NULL,
    code VARCHAR(128) NOT NULL,
    name VARCHAR(255) NULL,
    channel VARCHAR(64) NOT NULL DEFAULT '',
    shop_id VARCHAR(128) NOT NULL DEFAULT '',
    sold_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
    sold_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sales_shop_items_run_shop_code (run_id, shop_id, code),
    INDEX idx_sales_shop_items_shop_code (shop_id, code),
    CONSTRAINT fk_sales_shop_items_run
        FOREIGN KEY (run_id) REFERENCES sales_report_runs(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_report_shop_built (
    run_id INT PRIMARY KEY,
    built_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sales_shop_built_run
        FOREIGN KEY (run_id) REFERENCES sales_report_runs(id)
        ON DELETE CASCADE
);
