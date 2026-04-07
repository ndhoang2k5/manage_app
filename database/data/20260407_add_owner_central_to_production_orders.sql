-- Migration: add owner_central_id to production_orders
-- Date: 2026-04-07
-- Safe to run multiple times (idempotent).

-- 1) Add nullable column owner_central_id if missing
SET @col_exists := (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND column_name = 'owner_central_id'
);
SET @sql_stmt := IF(
    @col_exists = 0,
    'ALTER TABLE production_orders ADD COLUMN owner_central_id INT NULL AFTER warehouse_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) Add index for filtering by owner
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND index_name = 'idx_production_owner_central'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE production_orders ADD INDEX idx_production_owner_central (owner_central_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) Add foreign key constraint if missing
SET @fk_exists := (
    SELECT COUNT(1)
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'fk_production_orders_owner_central'
);
SET @sql_stmt := IF(
    @fk_exists = 0,
    'ALTER TABLE production_orders ADD CONSTRAINT fk_production_orders_owner_central FOREIGN KEY (owner_central_id) REFERENCES warehouses(id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
