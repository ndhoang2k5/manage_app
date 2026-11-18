-- Gán kho tổng Unbee cho các đơn sản xuất chưa có owner_central_id
-- Kho Tổng Unbee: warehouses.id = 1

UPDATE production_orders
SET owner_central_id = 1
WHERE owner_central_id IS NULL;
