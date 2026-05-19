-- Migration: dedupe realtime sales by day (inventory check)
-- Date: 2026-04-01
-- Purpose: ensure 1 row per (period_month, product_code, movement_date) for 'Xuất bán' so realtime sync can UPSERT daily.
-- Safe to run multiple times (idempotent).

SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'accounting_stock_movements'
      AND index_name = 'uq_acc_move_sales_day'
);

SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE accounting_stock_movements ADD UNIQUE KEY uq_acc_move_sales_day (period_month, product_code, movement_date, movement_type, direction)',
    'SELECT 1'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

