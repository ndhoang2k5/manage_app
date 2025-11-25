-- =============================================
-- FILE SQL TỔNG HỢP TOÀN BỘ (FINAL VERSION)
-- Bao gồm: Master Data, Kho, Tài chính, Sản xuất & Nhóm NVL
-- =============================================

-- =============================================
-- PHẦN 1: DỮ LIỆU NỀN (MASTER DATA)
-- =============================================

USE manage_app_database;

SET NAMES 'utf8mb4';

ALTER DATABASE manage_app_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 1. Danh mục (Vải, Cúc, Quần, Áo...)
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; 

-- 2. Nhãn hàng (Brand A, Brand B...)
CREATE TABLE brands (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL
);

-- 3. Nhà cung cấp
CREATE TABLE suppliers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200),
    phone VARCHAR(20),
    address TEXT
);

-- 4. Danh sách Kho/Xưởng
CREATE TABLE warehouses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    brand_id INT,
    name VARCHAR(100) NOT NULL,
    is_central BOOLEAN DEFAULT FALSE, -- True: Kho tổng, False: Xưởng con
    address TEXT,
    FOREIGN KEY (brand_id) REFERENCES brands(id)
);

-- 5. Sản phẩm cha (Abstract Product)
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT,
    name VARCHAR(200) NOT NULL, 
    type ENUM('material', 'finished_good') NOT NULL, 
    base_unit VARCHAR(50) NOT NULL, 
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 6. Biến thể chi tiết (Product Variants) 
-- CẬP NHẬT: Cho phép nhập tay SKU, attributes linh hoạt
CREATE TABLE product_variants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    
    sku VARCHAR(50) UNIQUE NOT NULL, -- Người dùng tự nhập mã: "H10001", "CUC-01"
    variant_name VARCHAR(255) NOT NULL, -- Người dùng tự nhập tên: "Cúc trắng 1cm"
    
    attributes TEXT, -- Đổi thành TEXT để nhập ghi chú thoải mái (VD: "Màu trắng, nhựa")
    
    cost_price DECIMAL(15, 2) DEFAULT 0, -- Giá vốn
    sale_price DECIMAL(15, 2) DEFAULT 0, -- Giá bán
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- =============================================
-- PHẦN 2: NHÓM NGUYÊN VẬT LIỆU (MỚI THÊM)
-- Giúp tạo các set NVL (VD: Mã NVL1 gồm cúc, khóa, vải...)
-- =============================================

-- 7. Bảng Nhóm NVL (Header)
CREATE TABLE material_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL, -- Mã nhóm: "NVL1"
    name VARCHAR(200) NOT NULL, -- Tên nhóm: "Set phụ liệu Áo Vest"
    description TEXT
);

-- 8. Chi tiết Nhóm NVL (Detail)
CREATE TABLE material_group_details (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT,
    material_variant_id INT, -- Link tới Cúc, Khóa cụ thể
    quantity_standard DECIMAL(15, 2) DEFAULT 1, -- Số lượng gợi ý
    FOREIGN KEY (group_id) REFERENCES material_groups(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- =============================================
-- PHẦN 3: QUẢN LÝ KHO & MUA HÀNG
-- =============================================

-- 9. Tồn kho hiện tại
CREATE TABLE inventory_stocks (
    warehouse_id INT,
    product_variant_id INT,
    quantity_on_hand DECIMAL(15, 2) DEFAULT 0, 
    quantity_reserved DECIMAL(15, 2) DEFAULT 0, -- Giữ hàng cho sản xuất
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (warehouse_id, product_variant_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 10. Phiếu Nhập mua (Purchase Orders)
CREATE TABLE purchase_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id INT,
    supplier_id INT,
    po_code VARCHAR(50) UNIQUE, 
    order_date DATE,
    total_amount DECIMAL(15, 2), 
    status ENUM('pending', 'completed', 'cancelled'),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- 11. Chi tiết phiếu nhập
CREATE TABLE purchase_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    purchase_order_id INT,
    product_variant_id INT,
    quantity DECIMAL(15, 2),
    unit_price DECIMAL(15, 2), 
    subtotal DECIMAL(15, 2),
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- =============================================
-- PHẦN 4: SẢN XUẤT (PRODUCTION)
-- =============================================

-- 12. Công thức (BOM)
CREATE TABLE bom (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_variant_id INT, 
    name VARCHAR(100) 
);

-- 13. Chi tiết công thức
CREATE TABLE bom_materials (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bom_id INT,
    material_variant_id INT, 
    quantity_needed DECIMAL(15, 2),
    FOREIGN KEY (bom_id) REFERENCES bom(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- 14. Lệnh Sản Xuất (Production Orders)
CREATE TABLE production_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE, 
    warehouse_id INT, 
    product_variant_id INT, 
    quantity_planned INT, 
    quantity_finished INT DEFAULT 0, 
    status ENUM('draft', 'waiting_material', 'in_progress', 'completed', 'cancelled'),
    start_date DATE,
    due_date DATE,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 15. Giữ chỗ nguyên liệu
CREATE TABLE production_material_reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    material_variant_id INT,
    quantity_reserved DECIMAL(15, 2),
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- =============================================
-- PHẦN 5: LỊCH SỬ GIAO DỊCH
-- =============================================

-- 16. Lịch sử biến động kho
CREATE TABLE inventory_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id INT,
    product_variant_id INT,
    transaction_type ENUM('purchase_in', 'production_out', 'production_in', 'transfer_in', 'transfer_out', 'sale_out'),
    quantity DECIMAL(15, 2), 
    reference_id INT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);






-- =============================================
-- DỮ LIỆU MẪU (SAMPLE DATA)
-- =============================================

-- 1. TẠO DANH MỤC & NHÃN HÀNG
-- ---------------------------------------------
INSERT INTO categories (name, description) VALUES 
('Vải may mặc', 'Các loại vải chính, vải lót'),
('Phụ liệu may', 'Cúc, khóa, chỉ, mác'),
('Thành phẩm Áo', 'Áo sơ mi, Áo khoác, Áo thun'),
('Thành phẩm Quần', 'Quần âu, Quần Jean');

INSERT INTO brands (name) VALUES 
('Brand A - Thời trang Công sở'), 
('Brand B - Thời trang Dạo phố');

INSERT INTO suppliers (name, phone, address) VALUES 
('Nhà may Dệt kim Hà Nội', '0901234567', 'KCN Phố Nối A'),
('Đại lý Phụ liệu Chợ Đồng Xuân', '0912345678', 'Hoàn Kiếm, Hà Nội');

-- 2. TẠO KHO & XƯỞNG
-- ---------------------------------------------
INSERT INTO warehouses (brand_id, name, is_central, address) VALUES 
(1, 'Kho Tổng Brand A', TRUE, '123 Giải Phóng'),    -- ID 1
(1, 'Xưởng May 1 (Brand A)', FALSE, 'Thường Tín'), -- ID 2
(2, 'Kho Tổng Brand B', TRUE, '456 Nguyễn Trãi');   -- ID 3

-- 3. TẠO SẢN PHẨM & NGUYÊN VẬT LIỆU (QUAN TRỌNG)
-- ---------------------------------------------
-- Tạo các đối tượng cha trước
INSERT INTO products (category_id, name, type, base_unit) VALUES 
(1, 'Vải Lụa Hàn Quốc', 'material', 'Mét'),  -- ID 1
(2, 'Cúc Áo Sơ Mi', 'material', 'Cái'),     -- ID 2
(2, 'Khóa Kéo', 'material', 'Cái'),         -- ID 3
(3, 'Áo Sơ Mi Nữ Basic', 'finished_good', 'Cái'); -- ID 4 (Thành phẩm)

-- Tạo chi tiết (Variants) - Ở đây nhập mã SKU tay như bạn yêu cầu
INSERT INTO product_variants (product_id, sku, variant_name, attributes, cost_price, sale_price) VALUES 
-- Vải
(1, 'VAI-LUA-TRANG', 'Vải Lụa Hàn Quốc - Trắng', 'Màu trắng, khổ 1m5', 80000, 0), -- ID 1
(1, 'VAI-LUA-DO', 'Vải Lụa Hàn Quốc - Đỏ Đô', 'Màu đỏ đô, khổ 1m5', 85000, 0),   -- ID 2

-- Cúc (Mã H10001 như bạn ví dụ)
(2, 'H10001', 'Cúc nhựa trắng 4 lỗ 1cm', 'Nhựa cao cấp', 500, 0),    -- ID 3
(2, 'H10002', 'Cúc gỗ nâu Vintage', 'Gỗ tự nhiên', 1200, 0),         -- ID 4

-- Khóa
(3, 'KHOA-dong-15', 'Khóa đồng 15cm', 'Kim loại đồng', 5000, 0),     -- ID 5

-- Thành phẩm (Áo)
(4, 'ASM-NU-TRANG-M', 'Áo Sơ mi Nữ Trắng - Size M', 'Size M, Vải lụa', 150000, 350000); -- ID 6

-- 4. TẠO NHÓM NGUYÊN VẬT LIỆU (TÍNH NĂNG MỚI)
-- ---------------------------------------------
-- Tạo nhóm "Set phụ kiện cơ bản cho Áo Sơ mi" (Gồm Cúc H10001 và Khóa)
INSERT INTO material_groups (code, name, description) VALUES 
('NVL-SET-SM01', 'Bộ phụ liệu Áo Sơ Mi Trắng', 'Dùng cho mẫu ASM-NU-TRANG'); -- ID 1

-- Thêm chi tiết vào nhóm
INSERT INTO material_group_details (group_id, material_variant_id, quantity_standard) VALUES 
(1, 3, 7), -- Cần 7 cái Cúc H10001
(1, 5, 1); -- Cần 1 cái Khóa đồng

-- 5. QUY TRÌNH MUA HÀNG (PURCHASING)
-- ---------------------------------------------
-- Tạo phiếu nhập kho về Kho Tổng Brand A
INSERT INTO purchase_orders (warehouse_id, supplier_id, po_code, order_date, total_amount, status) VALUES 
(1, 1, 'PO-20231125-01', '2023-11-25', 82500000, 'completed'); -- ID 1

-- Chi tiết nhập: 1000m Vải trắng + 5000 cái Cúc H10001
INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal) VALUES 
(1, 1, 1000, 80000, 80000000), -- 1000m Vải x 80k
(1, 3, 5000, 500, 2500000);    -- 5000 Cúc x 500đ

-- CẬP NHẬT TỒN KHO SAU KHI MUA (Kho Tổng ID 1)
INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand, quantity_reserved) VALUES 
(1, 1, 1000, 0), -- Vải trắng
(1, 3, 5000, 0); -- Cúc H10001

-- Ghi log giao dịch nhập kho
INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id) VALUES
(1, 1, 'purchase_in', 1000, 1),
(1, 3, 'purchase_in', 5000, 1);

-- 6. ĐIỀU CHUYỂN KHO (TRANSFER) - Optional
-- ---------------------------------------------
-- Chuyển 200m Vải và 1000 Cúc từ Kho Tổng (ID 1) sang Xưởng May 1 (ID 2) để chuẩn bị may
INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES 
(2, 1, 200),  -- Xưởng 1 có 200m vải
(2, 3, 1000); -- Xưởng 1 có 1000 cúc

-- Trừ kho tổng (Update thủ công cho khớp ví dụ)
UPDATE inventory_stocks SET quantity_on_hand = 800 WHERE warehouse_id = 1 AND product_variant_id = 1;
UPDATE inventory_stocks SET quantity_on_hand = 4000 WHERE warehouse_id = 1 AND product_variant_id = 3;

-- 7. THIẾT LẬP CÔNG THỨC (BOM)
-- ---------------------------------------------
-- Định nghĩa công thức may "Áo Sơ mi Nữ Trắng - Size M"
INSERT INTO bom (product_variant_id, name) VALUES 
(6, 'Công thức chuẩn 2023 - Áo Sơ mi Nữ'); -- ID 1

-- Chi tiết công thức: 1 Áo = 1.2m Vải + 7 Cúc
INSERT INTO bom_materials (bom_id, material_variant_id, quantity_needed) VALUES 
(1, 1, 1.2), -- 1.2m Vải Lụa Trắng
(1, 3, 7);   -- 7 cái Cúc H10001

-- 8. LỆNH SẢN XUẤT (PRODUCTION ORDER) - "Bấm may 100 cái"
-- ---------------------------------------------
-- Xưởng May 1 nhận lệnh may 100 cái áo
INSERT INTO production_orders (code, warehouse_id, product_variant_id, quantity_planned, quantity_finished, status, start_date, due_date) VALUES 
('LSX-2023-001', 2, 6, 100, 0, 'in_progress', '2023-11-26', '2023-11-30'); -- ID 1

-- 9. GIỮ CHỖ NGUYÊN LIỆU (RESERVATION)
-- ---------------------------------------------
-- Hệ thống tự tính: 100 áo * 1.2m = 120m vải; 100 áo * 7 cúc = 700 cúc
-- Ghi nhận giữ hàng tại Xưởng May 1
INSERT INTO production_material_reservations (production_order_id, material_variant_id, quantity_reserved) VALUES 
(1, 1, 120), -- Giữ 120m vải
(1, 3, 700); -- Giữ 700 cúc

-- Cập nhật trạng thái "Đã giữ" trong bảng kho (Xưởng 1)
UPDATE inventory_stocks 
SET quantity_reserved = 120 
WHERE warehouse_id = 2 AND product_variant_id = 1;

UPDATE inventory_stocks 
SET quantity_reserved = 700 
WHERE warehouse_id = 2 AND product_variant_id = 3;

-- =============================================
-- KẾT THÚC DỮ LIỆU MẪU
-- Bạn có thể Query để kiểm tra kết quả
-- =============================================