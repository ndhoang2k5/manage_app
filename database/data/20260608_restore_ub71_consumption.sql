-- Khôi phục định mức tiêu hao đơn HĐ26ub71 (production_order_id=171)
-- Dữ liệu lấy từ production_out gốc (2026-05-31) trước khi bị ghi đè về 0.

START TRANSACTION;

UPDATE production_material_reservations
SET quantity_reserved = 24.09920000,
    note = '__NPLMETA__:{"rowIndex":0,"consumptionRate":0.3544,"productQuantity":68}'
WHERE id = 952 AND production_order_id = 171;

UPDATE production_material_reservations
SET quantity_reserved = 24.89990000,
    note = '__NPLMETA__:{"rowIndex":1,"consumptionRate":0.36617,"productQuantity":68}'
WHERE id = 953 AND production_order_id = 171;

UPDATE production_material_reservations
SET quantity_reserved = 23.29680000,
    note = '__NPLMETA__:{"rowIndex":2,"consumptionRate":0.3426,"productQuantity":68}'
WHERE id = 954 AND production_order_id = 171;

UPDATE production_material_reservations
SET quantity_reserved = 21.59680000,
    note = '__NPLMETA__:{"rowIndex":3,"consumptionRate":0.3176,"productQuantity":68}'
WHERE id = 955 AND production_order_id = 171;

UPDATE production_material_reservations
SET quantity_reserved = 23.99720000,
    note = '__NPLMETA__:{"rowIndex":4,"consumptionRate":0.3529,"productQuantity":68}'
WHERE id = 956 AND production_order_id = 171;

UPDATE production_material_reservations
SET quantity_reserved = 24.89990000,
    note = '__NPLMETA__:{"rowIndex":5,"consumptionRate":0.36617,"productQuantity":68}'
WHERE id = 957 AND production_order_id = 171;

UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - 24.09920000 WHERE warehouse_id = 3 AND product_variant_id = 1040;
UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - 24.89990000 WHERE warehouse_id = 3 AND product_variant_id = 1041;
UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - 23.29680000 WHERE warehouse_id = 3 AND product_variant_id = 1042;
UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - 21.59680000 WHERE warehouse_id = 3 AND product_variant_id = 1043;
UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - 23.99720000 WHERE warehouse_id = 3 AND product_variant_id = 1044;
UPDATE inventory_stocks SET quantity_on_hand = quantity_on_hand - 24.89990000 WHERE warehouse_id = 3 AND product_variant_id = 1045;

INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES
(3, 1040, 'production_out', -24.09920000, 171, 'Khôi phục định mức sau sửa lỗi'),
(3, 1041, 'production_out', -24.89990000, 171, 'Khôi phục định mức sau sửa lỗi'),
(3, 1042, 'production_out', -23.29680000, 171, 'Khôi phục định mức sau sửa lỗi'),
(3, 1043, 'production_out', -21.59680000, 171, 'Khôi phục định mức sau sửa lỗi'),
(3, 1044, 'production_out', -23.99720000, 171, 'Khôi phục định mức sau sửa lỗi'),
(3, 1045, 'production_out', -24.89990000, 171, 'Khôi phục định mức sau sửa lỗi');

COMMIT;
