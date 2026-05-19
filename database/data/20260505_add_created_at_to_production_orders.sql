-- Migration: add created_at to production_orders for progress filtering
-- Date: 2026-05-05
-- Safe to run multiple times (idempotent)

SET @col_exists := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND column_name = 'created_at'
);

SET @sql_stmt := IF(
    @col_exists = 0,
    'ALTER TABLE production_orders ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP AFTER created_by',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Backfill old rows (if any) using start_date to keep timeline meaningful
UPDATE production_orders
SET created_at = COALESCE(
    created_at,
    CASE
        WHEN start_date IS NOT NULL THEN CAST(CONCAT(start_date, ' 00:00:00') AS DATETIME)
        ELSE CURRENT_TIMESTAMP
    END
)
WHERE created_at IS NULL;
