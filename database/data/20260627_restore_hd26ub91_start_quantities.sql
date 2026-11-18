-- Khôi phục lượng NVL của đơn HĐ26ub91 (production_orders.id = 205)
-- về trạng thái ngay sau khi Start (snapshot id = 654).
-- Lưu ý: các dòng này đã được hoàn lại về Xưởng Liễu bởi lần update sau Start,
-- nên khi khôi phục reservation cần trừ lại tồn tại xưởng.

START TRANSACTION;

UPDATE inventory_stocks
SET quantity_on_hand = quantity_on_hand - 9.54000000
WHERE warehouse_id = 3 AND product_variant_id = 1070 AND quantity_on_hand >= 9.54000000;

UPDATE inventory_stocks
SET quantity_on_hand = quantity_on_hand - 20.52000000
WHERE warehouse_id = 3 AND product_variant_id = 1071 AND quantity_on_hand >= 20.52000000;

UPDATE production_material_reservations
SET quantity_reserved = 9.54000000
WHERE id = 1273 AND production_order_id = 205 AND material_variant_id = 1070;

UPDATE production_material_reservations
SET quantity_reserved = 12.24000000
WHERE id = 1274 AND production_order_id = 205 AND material_variant_id = 1071;

UPDATE production_material_reservations
SET quantity_reserved = 8.28000000
WHERE id = 1275 AND production_order_id = 205 AND material_variant_id = 1071;

INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note)
VALUES
  (3, 1070, 'production_out', -9.54000000, 205, 'Khôi phục HĐ26ub91 về lượng NVL ngay sau Start'),
  (3, 1071, 'production_out', -12.24000000, 205, 'Khôi phục HĐ26ub91 về lượng NVL ngay sau Start'),
  (3, 1071, 'production_out', -8.28000000, 205, 'Khôi phục HĐ26ub91 về lượng NVL ngay sau Start');

COMMIT;
