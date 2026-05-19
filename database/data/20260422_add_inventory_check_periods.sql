-- Migration: add inventory_check periods + add period_month support
-- Date: 2026-04-22
-- Safe to run multiple times as much as possible (idempotent-ish).

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

-- Ensure at least one active period exists (current month)
SET @cur_month := DATE_FORMAT(CURDATE(), '%Y-%m');
INSERT INTO inventory_check_periods (period_month, is_active)
SELECT @cur_month, 1
WHERE NOT EXISTS (SELECT 1 FROM inventory_check_periods WHERE period_month = @cur_month);
UPDATE inventory_check_periods
SET is_active = CASE WHEN period_month = @cur_month THEN 1 ELSE 0 END
WHERE NOT EXISTS (SELECT 1 FROM inventory_check_periods WHERE is_active = 1);

-- 2) Add period_month to accounting_stock_movements if missing
SET @col_exists := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_movements'
      AND column_name = 'period_month'
);
SET @sql_stmt := IF(
    @col_exists = 0,
    'ALTER TABLE accounting_stock_movements ADD COLUMN period_month VARCHAR(7) NOT NULL DEFAULT (DATE_FORMAT(CURDATE(), ''%Y-%m'')) AFTER product_code',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill period_month for existing rows (if added column without computed default support)
UPDATE accounting_stock_movements
SET period_month = @cur_month
WHERE period_month IS NULL OR period_month = '';

-- Index
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

-- 3) Openings v2: create new table with period_month, migrate data once if needed
CREATE TABLE IF NOT EXISTS accounting_stock_openings_v2 (
    period_month VARCHAR(7) NOT NULL,
    product_code VARCHAR(50) NOT NULL,
    opening_qty DECIMAL(15, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (period_month, product_code),
    INDEX idx_acc_openings_code (product_code)
);

-- Copy from old openings table if it exists and v2 empty
SET @old_exists := (
    SELECT COUNT(1)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_openings'
);
SET @v2_has := (
    SELECT COUNT(1)
    FROM accounting_stock_openings_v2
);
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

-- Seed current period if missing
INSERT INTO inventory_check_sales_sync_state_v2 (period_month, last_sync_ms)
SELECT @cur_month, 0
WHERE NOT EXISTS (
    SELECT 1 FROM inventory_check_sales_sync_state_v2 WHERE period_month = @cur_month
);

