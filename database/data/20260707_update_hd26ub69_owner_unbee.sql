-- Đổi kho tổng quản lý cho đơn HĐ26ub69 túi to
-- Xưởng Túi - Mẹ Bắc thuộc Unbee nên owner_central_id phải là Kho Tổng Unbee (id = 1).

UPDATE production_orders
SET owner_central_id = 1
WHERE id = 270
  AND code = 'HĐ26ub69 túi to';
