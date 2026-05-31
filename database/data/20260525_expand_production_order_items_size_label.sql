-- Expand size_label to support "SKU SP + Tên" combined values
ALTER TABLE production_order_items
MODIFY COLUMN size_label VARCHAR(255);
