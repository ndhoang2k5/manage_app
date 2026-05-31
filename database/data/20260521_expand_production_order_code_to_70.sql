-- Expand production order code length to avoid validation/DB mismatch.
ALTER TABLE production_orders
    MODIFY COLUMN code VARCHAR(70) UNIQUE;
