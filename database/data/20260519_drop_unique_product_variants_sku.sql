-- Ensure product_variants.sku is NOT unique.
-- We only block exact duplicate SKU in application logic (binary comparison),
-- so DB-level unique collation must not reject similar-but-different strings.

SET @schema_name := DATABASE();

SET @idx_name := (
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'product_variants'
      AND COLUMN_NAME = 'sku'
      AND NON_UNIQUE = 0
    LIMIT 1
);

SET @drop_sql := IF(
    @idx_name IS NOT NULL,
    CONCAT('ALTER TABLE product_variants DROP INDEX `', @idx_name, '`'),
    'SELECT 1'
);
PREPARE stmt_drop FROM @drop_sql;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants (sku);
