-- ==========================================================
-- FILE: init.sql (FULL VERSION - FINAL)
-- Hỗ trợ: Đa Size, Nhập hàng từng đợt, Ghi chú giao dịch
-- ==========================================================

USE manage_app_database;
SET NAMES 'utf8mb4';
ALTER DATABASE manage_app_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ==========================================================
-- 1. TẠO CẤU TRÚC BẢNG (SCHEMA)
-- ==========================================================

-- 1. Danh mục
CREATE TABLE categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Nhãn hàng (Brands)
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

-- 4. Kho bãi
CREATE TABLE warehouses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    brand_id INT,
    name VARCHAR(100) NOT NULL,
    is_central BOOLEAN DEFAULT FALSE,
    address TEXT,
    FOREIGN KEY (brand_id) REFERENCES brands(id)
);

-- 5. Sản phẩm chung
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT,
    name VARCHAR(200) NOT NULL, 
    type ENUM('material', 'finished_good') NOT NULL, 
    base_unit VARCHAR(50) NOT NULL, 
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 6. Biến thể chi tiết (SKU)
CREATE TABLE product_variants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    attributes TEXT,
    cost_price DECIMAL(15, 2) DEFAULT 0,
    sale_price DECIMAL(15, 2) DEFAULT 0,
    -- note TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 7. Nhóm Nguyên vật liệu
CREATE TABLE material_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT
);

-- 8. Chi tiết nhóm NVL
CREATE TABLE material_group_details (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT,
    material_variant_id INT,
    quantity_standard DECIMAL(15, 2) DEFAULT 1,
    FOREIGN KEY (group_id) REFERENCES material_groups(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- 9. Tồn kho
CREATE TABLE inventory_stocks (
    warehouse_id INT,
    product_variant_id INT,
    quantity_on_hand DECIMAL(15, 2) DEFAULT 0, 
    quantity_reserved DECIMAL(15, 2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (warehouse_id, product_variant_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 10. Mua hàng (PO)
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

-- 11. Chi tiết PO
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

-- 12. Công thức (BOM)
CREATE TABLE bom (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_variant_id INT, 
    name VARCHAR(100) 
);

-- 13. Chi tiết BOM
CREATE TABLE bom_materials (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bom_id INT,
    material_variant_id INT, 
    quantity_needed DECIMAL(15, 2),
    FOREIGN KEY (bom_id) REFERENCES bom(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- 14. Lệnh Sản Xuất
CREATE TABLE production_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE, 
    warehouse_id INT, 
    product_variant_id INT, 
    quantity_planned INT, 
    quantity_finished INT DEFAULT 0, 
    status ENUM('draft', 'waiting_material', 'in_progress', 'completed', 'cancelled'),
    shipping_fee DECIMAL(15, 2) DEFAULT 0,
    other_fee DECIMAL(15, 2) DEFAULT 0,
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

-- 16. Chi tiết Size Lệnh Sản Xuất (QUAN TRỌNG)
CREATE TABLE production_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    size_label VARCHAR(50), -- Ví dụ: "0-3m", "3-6m"
    quantity_planned INT DEFAULT 0, -- Số lượng đặt
    quantity_finished INT DEFAULT 0, -- Số lượng đã trả
    note TEXT,
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);

-- 17. Lịch sử giao dịch
CREATE TABLE inventory_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id INT,
    product_variant_id INT,
    transaction_type ENUM('purchase_in', 'production_out', 'production_in', 'transfer_in', 'transfer_out', 'sale_out'),
    quantity DECIMAL(15, 2), 
    reference_id INT, 
    note TEXT, -- Cột ghi chú
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 18. Khách hàng
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. Đơn Bán Hàng
CREATE TABLE sales_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_code VARCHAR(50) UNIQUE, 
    warehouse_id INT, 
    customer_id INT,
    order_date DATE,
    total_amount DECIMAL(15, 2),
    status ENUM('pending', 'completed', 'cancelled'),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 20. Chi tiết Đơn bán
CREATE TABLE sales_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sales_order_id INT,
    product_variant_id INT,
    quantity DECIMAL(15, 2),
    unit_price DECIMAL(15, 2), 
    subtotal DECIMAL(15, 2),
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 21. Phiếu Kiểm Kê
CREATE TABLE inventory_adjustments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE, 
    warehouse_id INT,
    adjustment_date DATE,
    reason TEXT, 
    status ENUM('draft', 'applied'), 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- 22. Chi tiết Kiểm kê
CREATE TABLE inventory_adjustment_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    adjustment_id INT,
    product_variant_id INT,
    system_quantity DECIMAL(15, 2), 
    actual_quantity DECIMAL(15, 2), 
    difference DECIMAL(15, 2), 
    FOREIGN KEY (adjustment_id) REFERENCES inventory_adjustments(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);


-- 23. Thêm ảnh vào order sản phẩm
CREATE TABLE production_order_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    image_url TEXT, -- Đường dẫn file ảnh
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);


-- 24. Nhật ký trả hàng sản xuất (lưu từng đợt trả)
CREATE TABLE production_receive_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    production_order_item_id INT, -- Link tới dòng size cụ thể
    quantity DECIMAL(15, 2),      -- Số lượng trả đợt này
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Thời gian trả
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    FOREIGN KEY (production_order_item_id) REFERENCES production_order_items(id)
);




-- ==========================================================
-- 2. DỮ LIỆU MẪU (TEST DATA) - Kịch bản "Brand X"
-- ==========================================================

-- A. Tạo Danh mục & Brand
INSERT INTO categories (name) VALUES ('Vải Cao Cấp'), ('Phụ Liệu May'), ('Thành Phẩm');
INSERT INTO brands (name) VALUES ('Brand X - Thời trang Thiết kế'); -- ID 1

-- B. Tạo Hệ thống Kho (1 Tổng, 2 Xưởng)
INSERT INTO warehouses (brand_id, name, is_central, address) VALUES 
(1, 'Kho Tổng Brand X (Hà Nội)', TRUE, '123 Lạc Long Quân, Tây Hồ'), -- ID 1
(1, 'Xưởng May A (Cầu Giấy)', FALSE, 'Ngõ 165 Cầu Giấy'),            -- ID 2
(1, 'Xưởng May B (Đống Đa)', FALSE, 'Phố Chùa Láng');                 -- ID 3

-- C. Tạo Nguyên Vật Liệu (NVL)
-- Vải
INSERT INTO products (category_id, name, type, base_unit) VALUES (1, 'Vải Linen', 'material', 'Mét');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes) VALUES 
(1, 'LINEN-TRANG', 'Vải Linen Trắng Tự Nhiên', 120000, 'Màu trắng, khổ 1.5m'), -- ID 1
(1, 'LINEN-NAU', 'Vải Linen Nâu Đất', 125000, 'Màu nâu, khổ 1.5m');           -- ID 2

-- Cúc
INSERT INTO products (category_id, name, type, base_unit) VALUES (2, 'Cúc Gỗ', 'material', 'Cái');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes) VALUES 
(2, 'CUC-GO-01', 'Cúc Gỗ Vintage 2 lỗ', 2000, 'Gỗ sồi, size 1.5cm');          -- ID 3

-- Chỉ
INSERT INTO products (category_id, name, type, base_unit) VALUES (2, 'Chỉ May', 'material', 'Cuộn');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes) VALUES 
(3, 'CHI-TRANG', 'Chỉ Cotton Trắng', 15000, 'Cotton 100%');                  -- ID 4

-- D. Tạo Nhà Cung Cấp & Nhập Hàng Tồn Đầu Kỳ (Vào Kho Tổng)
INSERT INTO suppliers (name, phone) VALUES ('Nhà Dệt 19/5', '0901234567');

-- Tạo Phiếu Nhập PO-001 (Nhập Vải & Cúc về Kho Tổng)
INSERT INTO purchase_orders (warehouse_id, supplier_id, po_code, order_date, total_amount, status) 
VALUES (1, 1, 'PO-SETUP-001', CURDATE(), 61000000, 'completed'); -- ID 1

INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal) VALUES
(1, 1, 400, 120000, 48000000), -- 400m Vải Linen Trắng
(1, 2, 100, 125000, 12500000), -- 100m Vải Linen Nâu
(1, 3, 2500, 200, 500000);     -- 2500 Cúc (Nhập rẻ 200đ)

-- Cập nhật Tồn kho cho Kho Tổng (ID 1)
INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES
(1, 1, 400),
(1, 2, 100),
(1, 3, 2500);

-- Ghi log nhập
INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES
(1, 1, 'purchase_in', 400, 1, 'Nhập hàng đầu kỳ'),
(1, 2, 'purchase_in', 100, 1, 'Nhập hàng đầu kỳ'),
(1, 3, 'purchase_in', 2500, 1, 'Nhập hàng đầu kỳ');

-- E. Điều chuyển 1 ít hàng sang Xưởng May A (ID 2) để chuẩn bị SX
-- Chuyển 100m Vải Trắng + 500 Cúc
UPDATE inventory_stocks SET quantity_on_hand = 300 WHERE warehouse_id = 1 AND product_variant_id = 1; -- Tổng còn 300
UPDATE inventory_stocks SET quantity_on_hand = 2000 WHERE warehouse_id = 1 AND product_variant_id = 3; -- Tổng còn 2000

INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES
(2, 1, 100), -- Xưởng A có 100m Vải
(2, 3, 500); -- Xưởng A có 500 Cúc