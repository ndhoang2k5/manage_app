-- Migration: add indexes for inventory check performance
-- Date: 2026-04-24
-- Purpose:
-- - Speed up summary queries by (period_month, product_code)
-- - Speed up detail queries by (period_month, product_code, movement_date)
-- Safe to run multiple times (idempotent).

-- 1) accounting_stock_movements(period_month, product_code)
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

-- 2) accounting_stock_movements(period_month, product_code, movement_date)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_movements'
      AND index_name = 'idx_acc_move_period_code_date'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE accounting_stock_movements ADD INDEX idx_acc_move_period_code_date (period_month, product_code, movement_date)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

