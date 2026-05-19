-- Migration: fix inventory_check period schema for MySQL 8
-- Date: 2026-04-23
-- Safe to run multiple times (idempotent).
-- Purpose: production DB may not have period_month column + *_v2 tables yet.

-- 1) Periods table
CREATE TABLE IF NOT EXISTS inventory_check_periods (
    id INT PRIMARY KEY AUTO_INCREMENT,
    period_month VARCHAR(7) NOT NULL, -- YYYY-MM
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    closed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inventory_check_period_month (period_month),
    INDEX idx_inventory_check_period_active (is_active)
);

SET @cur_month := DATE_FORMAT(CURDATE(), '%Y-%m');

-- Ensure current month exists
INSERT IGNORE INTO inventory_check_periods (period_month, is_active) VALUES (@cur_month, 1);

-- If no active period, activate current month
SET @has_active := (SELECT COUNT(1) FROM inventory_check_periods WHERE is_active = 1);
UPDATE inventory_check_periods
SET is_active = CASE WHEN period_month = @cur_month THEN 1 ELSE 0 END
WHERE @has_active = 0;

-- 2) Add period_month column to accounting_stock_movements if missing
SET @col_exists := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_movements'
      AND column_name = 'period_month'
);
SET @sql_stmt := IF(
    @col_exists = 0,
    'ALTER TABLE accounting_stock_movements ADD COLUMN period_month VARCHAR(7) NULL AFTER product_code',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill NULLs to current month
UPDATE accounting_stock_movements
SET period_month = @cur_month
WHERE period_month IS NULL OR period_month = '';

-- Make NOT NULL (only if currently nullable)
SET @is_nullable := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_movements'
      AND column_name = 'period_month'
      AND is_nullable = 'YES'
);
SET @sql_stmt := IF(
    @is_nullable = 1,
    'ALTER TABLE accounting_stock_movements MODIFY COLUMN period_month VARCHAR(7) NOT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for period queries
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_movements'
      AND index_name = 'idx_acc_move_period_code'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE accounting_stock_movements ADD INDEX idx_acc_move_period_code (period_month, product_code)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Openings v2 (period-based)
CREATE TABLE IF NOT EXISTS accounting_stock_openings_v2 (
    period_month VARCHAR(7) NOT NULL,
    product_code VARCHAR(50) NOT NULL,
    opening_qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (period_month, product_code),
    INDEX idx_acc_openings_code (product_code)
);

-- Copy from old openings table once (if exists and v2 empty)
SET @old_exists := (
    SELECT COUNT(1)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_openings'
);
SET @v2_has := (SELECT COUNT(1) FROM accounting_stock_openings_v2);
SET @sql_stmt := IF(
    @old_exists = 1 AND @v2_has = 0,
    CONCAT('INSERT INTO accounting_stock_openings_v2 (period_month, product_code, opening_qty) ',
           'SELECT ''', @cur_month, ''', product_code, opening_qty FROM accounting_stock_openings'),
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) Sales sync state v2 (per period)
CREATE TABLE IF NOT EXISTS inventory_check_sales_sync_state_v2 (
    period_month VARCHAR(7) PRIMARY KEY,
    last_sync_ms BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO inventory_check_sales_sync_state_v2 (period_month, last_sync_ms)
VALUES (@cur_month, 0);

