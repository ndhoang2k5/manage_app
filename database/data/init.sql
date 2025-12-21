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
-- Đã có cột color và note
CREATE TABLE product_variants (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    attributes TEXT,
    cost_price DECIMAL(15, 2) DEFAULT 0,
    sale_price DECIMAL(15, 2) DEFAULT 0,
    note TEXT,        -- Ghi chú vật tư
    color VARCHAR(50), -- Màu sắc
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
-- Đã thêm 5 loại phí
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
    -- Các loại phí
    shipping_fee DECIMAL(15, 2) DEFAULT 0,
    other_fee DECIMAL(15, 2) DEFAULT 0,
    labor_fee DECIMAL(15, 2) DEFAULT 0,
    marketing_fee DECIMAL(15, 2) DEFAULT 0,
    packaging_fee DECIMAL(15, 2) DEFAULT 0,
    created_by INT, 
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

-- 16. Chi tiết Size Lệnh Sản Xuất
-- Đã có cột note
CREATE TABLE production_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    size_label VARCHAR(50), 
    quantity_planned INT DEFAULT 0,
    quantity_finished INT DEFAULT 0,
    note TEXT, -- Ghi chú size
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);

-- 17. Bảng Ảnh Sản xuất
CREATE TABLE production_order_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    image_url TEXT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);

-- 18. Lịch Sử Nhập Kho Thành Phẩm
CREATE TABLE production_receive_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    production_order_item_id INT, 
    quantity DECIMAL(15, 2),      
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    FOREIGN KEY (production_order_item_id) REFERENCES production_order_items(id)
);

-- 19. Lịch sử giao dịch Kho
CREATE TABLE inventory_transactions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    warehouse_id INT,
    product_variant_id INT,
    transaction_type ENUM('purchase_in', 'production_out', 'production_in', 'transfer_in', 'transfer_out', 'sale_out'),
    quantity DECIMAL(15, 2), 
    reference_id INT, 
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 20. Khách hàng
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. Đơn Bán Hàng
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

-- 22. Chi tiết Đơn bán
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

-- 23. Phiếu Kiểm Kê
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

-- 24. Chi tiết Kiểm kê
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

-- 25. Bảng Users (Đã có phân quyền Kho)
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role ENUM('admin', 'staff') DEFAULT 'staff',
    warehouse_id INT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- ==========================================================
-- 2. DỮ LIỆU MẪU (TEST DATA)
-- ==========================================================

-- A. Tạo Danh mục & Brand
INSERT INTO categories (name) VALUES ('Vải Cao Cấp'), ('Phụ Liệu May'), ('Thành Phẩm');
INSERT INTO brands (name) VALUES ('Brand X - Thời trang Thiết kế'); 

-- B. Tạo Hệ thống Kho (1 Tổng, 2 Xưởng)
INSERT INTO warehouses (brand_id, name, is_central, address) VALUES 
(1, 'Kho Tổng Brand X (Hà Nội)', TRUE, '123 Lạc Long Quân, Tây Hồ'), 
(1, 'Xưởng May A (Cầu Giấy)', FALSE, 'Ngõ 165 Cầu Giấy'),            
(1, 'Xưởng May B (Đống Đa)', FALSE, 'Phố Chùa Láng');                 

-- C. Tạo Nguyên Vật Liệu (NVL)
-- Vải
INSERT INTO products (category_id, name, type, base_unit) VALUES (1, 'Vải Linen', 'material', 'Mét');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes) VALUES 
(1, 'LINEN-TRANG', 'Vải Linen Trắng Tự Nhiên', 120000, 'Màu trắng, khổ 1.5m'), 
(1, 'LINEN-NAU', 'Vải Linen Nâu Đất', 125000, 'Màu nâu, khổ 1.5m');           

-- Cúc
INSERT INTO products (category_id, name, type, base_unit) VALUES (2, 'Cúc Gỗ', 'material', 'Cái');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes) VALUES 
(2, 'CUC-GO-01', 'Cúc Gỗ Vintage 2 lỗ', 2000, 'Gỗ sồi, size 1.5cm');          

-- D. Tạo Nhà Cung Cấp & Nhập Hàng Tồn Đầu Kỳ
INSERT INTO suppliers (name, phone) VALUES ('Nhà Dệt 19/5', '0901234567');

INSERT INTO purchase_orders (warehouse_id, supplier_id, po_code, order_date, total_amount, status) 
VALUES (1, 1, 'PO-SETUP-001', CURDATE(), 61000000, 'completed');

INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal) VALUES
(1, 1, 400, 120000, 48000000), 
(1, 2, 100, 125000, 12500000), 
(1, 3, 2500, 200, 500000);     

-- Cập nhật Tồn kho
INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES (1, 1, 400), (1, 2, 100), (1, 3, 2500);
INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES (1, 1, 'purchase_in', 400, 1, 'Nhập đầu kỳ'), (1, 2, 'purchase_in', 100, 1, 'Nhập đầu kỳ'), (1, 3, 'purchase_in', 2500, 1, 'Nhập đầu kỳ');

-- E. Điều chuyển
UPDATE inventory_stocks SET quantity_on_hand = 300 WHERE warehouse_id = 1 AND product_variant_id = 1; 
UPDATE inventory_stocks SET quantity_on_hand = 2000 WHERE warehouse_id = 1 AND product_variant_id = 3; 

INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES (2, 1, 100), (2, 3, 500);

-- F. Tạo User (Pass: 123456)
INSERT INTO users (username, password, full_name, role, warehouse_id) 
VALUES ('admin', '123456', 'Quản Trị Viên', 'admin', NULL);

INSERT INTO users (username, password, full_name, role, warehouse_id) 
VALUES ('user', '123456', 'Trưởng Xưởng A', 'staff', 2);

-- ==========================================================
-- 3. TẠO INDEX (TỐI ƯU HIỆU NĂNG)
-- ==========================================================
CREATE INDEX idx_product_name ON product_variants(variant_name);
CREATE INDEX idx_production_warehouse ON production_orders(warehouse_id);
CREATE INDEX idx_production_status ON production_orders(status);
CREATE INDEX idx_production_product ON production_orders(product_variant_id);
CREATE INDEX idx_trans_warehouse_product ON inventory_transactions(warehouse_id, product_variant_id);
CREATE INDEX idx_trans_ref ON inventory_transactions(reference_id);
CREATE INDEX idx_trans_date ON inventory_transactions(created_at);
CREATE INDEX idx_purchase_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_code ON purchase_orders(po_code);