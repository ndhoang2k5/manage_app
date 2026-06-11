-- Expand material quantity precision to 5 decimal places
-- Date: 2026-06-06
-- Purpose: avoid rounding 3.12778 -> 3.1278 causing false stock shortage

ALTER TABLE production_material_reservations
    MODIFY COLUMN quantity_reserved DECIMAL(24, 8);

ALTER TABLE inventory_stocks
    MODIFY COLUMN quantity_on_hand DECIMAL(24, 8);

ALTER TABLE inventory_transactions
    MODIFY COLUMN quantity DECIMAL(24, 8);
