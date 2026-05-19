-- Migration: add indexes for production management performance
-- Date: 2026-04-27
-- Safe to run multiple times (idempotent).

-- Purpose:
-- - Speed up /production/orders/management filters:
--   - warehouse_id, status, start_date/due_date ranges
--   - owner_central_id scope
--   - sort by workshop name + id (still needs join, but filters should be faster)
-- - Speed up batch fetches for sizes/materials:
--   - production_order_items by production_order_id
--   - production_material_reservations by production_order_id
-- - Speed up BOM lookup for draft orders

-- 1) production_orders(warehouse_id, status, start_date, id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND index_name = 'idx_po_wh_status_start_id'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE production_orders ADD INDEX idx_po_wh_status_start_id (warehouse_id, status, start_date, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) production_orders(warehouse_id, status, due_date, id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND index_name = 'idx_po_wh_status_due_id'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE production_orders ADD INDEX idx_po_wh_status_due_id (warehouse_id, status, due_date, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) production_orders(owner_central_id, status, id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'production_orders'
      AND index_name = 'idx_po_owner_status_id'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE production_orders ADD INDEX idx_po_owner_status_id (owner_central_id, status, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) production_order_items(production_order_id, id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'production_order_items'
      AND index_name = 'idx_poi_order_id'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE production_order_items ADD INDEX idx_poi_order_id (production_order_id, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) production_material_reservations(production_order_id, id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'production_material_reservations'
      AND index_name = 'idx_pmr_order_id'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE production_material_reservations ADD INDEX idx_pmr_order_id (production_order_id, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6) bom(product_variant_id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'bom'
      AND index_name = 'idx_bom_product_variant'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE bom ADD INDEX idx_bom_product_variant (product_variant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7) bom_materials(bom_id, id)
SET @idx_exists := (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'bom_materials'
      AND index_name = 'idx_bom_materials_bom_id'
);
SET @sql_stmt := IF(
    @idx_exists = 0,
    'ALTER TABLE bom_materials ADD INDEX idx_bom_materials_bom_id (bom_id, id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

