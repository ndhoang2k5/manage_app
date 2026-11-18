-- Xóa 3 bản ghi vải trùng SKU, không còn tồn kho (id 1364, 1365, 1366)
-- Giữ lại bản ghi gốc id 915, 916, 917 vẫn còn tồn tại Kho Tổng Unbee

DELETE FROM product_variants WHERE id IN (1364, 1365, 1366);
