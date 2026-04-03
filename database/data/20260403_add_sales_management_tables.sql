-- Migration: add sales-management tables
-- Date: 2026-04-03
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS sales_report_runs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    time_start BIGINT NOT NULL,
    time_end BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    raw_payload LONGTEXT,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sales_report_period (time_start, time_end)
);

CREATE TABLE IF NOT EXISTS sales_report_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    run_id INT NOT NULL,
    code VARCHAR(128) NOT NULL,
    name VARCHAR(255) NULL,
    sold_qty DECIMAL(18, 4) NOT NULL DEFAULT 0,
    sold_revenue DECIMAL(18, 2) NOT NULL DEFAULT 0,
    channels_json TEXT,
    shops_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sales_report_items_run (run_id),
    INDEX idx_sales_report_items_code (code),
    CONSTRAINT fk_sales_report_items_run
        FOREIGN KEY (run_id) REFERENCES sales_report_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sales_priority_codes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(128) NOT NULL,
    note VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sales_priority_code (code)
);

CREATE TABLE IF NOT EXISTS sales_product_stock_current (
    code VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NULL,
    total_stock DECIMAL(18, 4) NOT NULL DEFAULT 0,
    stock_by_warehouse_json TEXT,
    cost DECIMAL(18, 2) NOT NULL DEFAULT 0,
    retail_price DECIMAL(18, 2) NOT NULL DEFAULT 0,
    barcode VARCHAR(128) NULL,
    synced_at_ms BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Performance indexes for report/sync queries.
-- Safe to run multiple times.
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_report_items'
      AND index_name = 'idx_sales_report_items_run_code'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE sales_report_items ADD INDEX idx_sales_report_items_run_code (run_id, code)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_product_stock_current'
      AND index_name = 'idx_sales_product_stock_current_synced_at_ms'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE sales_product_stock_current ADD INDEX idx_sales_product_stock_current_synced_at_ms (synced_at_ms)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_report_runs'
      AND index_name = 'idx_sales_report_runs_time_start_end'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE sales_report_runs ADD INDEX idx_sales_report_runs_time_start_end (time_start, time_end)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'sales_report_runs'
      AND index_name = 'idx_sales_report_runs_time_end'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE sales_report_runs ADD INDEX idx_sales_report_runs_time_end (time_end)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
