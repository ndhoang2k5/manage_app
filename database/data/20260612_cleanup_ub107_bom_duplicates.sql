-- Dọn BOM trùng lặp cho đơn HĐ26ub107 (product_variant_id = 1306)
-- Giữ bản ghi có định mức/consumption tốt hơn theo rowIndex

DELETE FROM bom_materials WHERE id IN (1089, 1093, 1094, 1418);
