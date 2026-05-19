-- Migration: allow duplicate SKU in product_variants
-- Date: 2026-04-27
-- Safe to run multiple times (idempotent).
--
-- product_variants.sku is currently UNIQUE in init.sql.
-- Business change: SKU belongs to product, duplicates are allowed.

-- Find UNIQUE index on column `sku` and drop it if exists.
SET @idx_name := (
    SELECT s.index_name
    FROM information_schema.statistics s
    WHERE s.table_schema = DATABASE()
      AND s.table_name = 'product_variants'
      AND s.column_name = 'sku'
      AND s.non_unique = 0
    ORDER BY s.index_name
    LIMIT 1
);

SET @sql_stmt := IF(
    @idx_name IS NULL,
    'SELECT 1',
    CONCAT('ALTER TABLE product_variants DROP INDEX `', @idx_name, '`')
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

