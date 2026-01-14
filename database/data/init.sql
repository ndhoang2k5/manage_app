CREATE DATABASE IF NOT EXISTS manage_app_database CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE manage_app_database;
SET NAMES 'utf8mb4';


-- 1. Danh mục
CREATE TABLE if not exists categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Nhãn hàng (Brands)
CREATE TABLE if not exists brands (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL
);

-- 3. Nhà cung cấp
CREATE TABLE if not exists suppliers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200),
    phone VARCHAR(20),
    address TEXT
);

-- 4. Kho bãi
CREATE TABLE if not exists warehouses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    brand_id INT,
    name VARCHAR(100) NOT NULL,
    is_central BOOLEAN DEFAULT FALSE,
    address TEXT,
    FOREIGN KEY (brand_id) REFERENCES brands(id)
);

-- 5. Sản phẩm chung
CREATE TABLE if not exists products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    category_id INT,
    name VARCHAR(200) NOT NULL, 
    type ENUM('material', 'finished_good') NOT NULL, 
    base_unit VARCHAR(50) NOT NULL, 
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 6. Biến thể chi tiết (SKU)
CREATE TABLE if not exists product_variants (
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
CREATE TABLE if not exists material_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT
);

-- 8. Chi tiết nhóm NVL
CREATE TABLE if not exists material_group_details (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_id INT,
    material_variant_id INT,
    quantity_standard DECIMAL(15, 2) DEFAULT 1,
    FOREIGN KEY (group_id) REFERENCES material_groups(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- 9. Tồn kho
CREATE TABLE if not exists inventory_stocks (
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
CREATE TABLE if not exists purchase_orders (
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
CREATE TABLE if not exists purchase_order_items (
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
CREATE TABLE if not exists bom (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_variant_id INT, 
    name VARCHAR(100) 
);

-- 13. Chi tiết BOM
CREATE TABLE if not exists bom_materials (
    id INT PRIMARY KEY AUTO_INCREMENT,
    bom_id INT,
    material_variant_id INT, 
    note TEXT,
    quantity_needed DECIMAL(15, 2),
    FOREIGN KEY (bom_id) REFERENCES bom(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- 14. Lệnh Sản Xuất
-- Đã thêm 5 loại phí
CREATE TABLE if not exists production_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) UNIQUE, 
    warehouse_id INT, 
    product_variant_id INT, 
    quantity_planned INT, 
    quantity_finished INT DEFAULT 0, 
    status ENUM('draft', 'waiting_material', 'in_progress', 'completed', 'cancelled'),
    start_date DATE,
    due_date DATE,
    progress_data TEXT,

    shipping_fee DECIMAL(15, 2) DEFAULT 0,
    other_fee DECIMAL(15, 2) DEFAULT 0,
    labor_fee DECIMAL(15, 2) DEFAULT 0,
    marketing_fee DECIMAL(15, 2) DEFAULT 0,
    packaging_fee DECIMAL(15, 2) DEFAULT 0,
    print_fee DECIMAL(15, 2) DEFAULT 0,
    created_by INT, 
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

-- 15. Giữ chỗ nguyên liệu
CREATE TABLE if not exists production_material_reservations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    material_variant_id INT,
    quantity_reserved DECIMAL(15, 2),
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    FOREIGN KEY (material_variant_id) REFERENCES product_variants(id)
);

-- 16. Chi tiết Size Lệnh Sản Xuất
-- Đã có cột note
CREATE TABLE if not exists production_order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    size_label VARCHAR(50), 
    quantity_planned INT DEFAULT 0,
    quantity_finished INT DEFAULT 0,
    note TEXT, -- Ghi chú size
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);

-- 17. Bảng Ảnh Sản xuất
CREATE TABLE if not exists production_order_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    image_url TEXT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id)
);

-- 18. Lịch Sử Nhập Kho Thành Phẩm
CREATE TABLE if not exists production_receive_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    production_order_id INT,
    production_order_item_id INT, 
    quantity DECIMAL(15, 2),      
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY (production_order_id) REFERENCES production_orders(id),
    FOREIGN KEY (production_order_item_id) REFERENCES production_order_items(id)
);

-- 19. Lịch sử giao dịch Kho
CREATE TABLE if not exists inventory_transactions (
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
CREATE TABLE if not exists customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21. Đơn Bán Hàng
CREATE TABLE if not exists sales_orders (
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
CREATE TABLE if not exists sales_order_items (
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
CREATE TABLE if not exists inventory_adjustments (
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
CREATE TABLE if not exists inventory_adjustment_items (
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
CREATE TABLE if not exists users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role ENUM('admin', 'staff') DEFAULT 'staff',
    warehouse_id INT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- 26. Bảng thông tin của mẫu
CREATE TABLE if not exists draft_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50),      -- Mã dự kiến (VD: DRAFT-001)
    name VARCHAR(200),     -- Tên ý tưởng (VD: Váy hoa nhí 2026)
    note TEXT,             -- Ghi chú chi tiết (Vải gì, kiểu dáng ra sao...)
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending', -- Trạng thái duyệt
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 27. lưu ảnh của mẫu sản phẩm
CREATE TABLE if not exists draft_order_images (
    id INT PRIMARY KEY AUTO_INCREMENT,
    draft_order_id INT,
    image_url TEXT,
    FOREIGN KEY (draft_order_id) REFERENCES draft_orders(id) ON DELETE CASCADE
);
-- ==========================================================
-- 2. DỮ LIỆU MẪU (TEST DATA) - Cập nhật mới nhất
-- ==========================================================

-- A. Tạo Danh mục
INSERT INTO categories (name) VALUES ('Vải Chính'), ('Vải Lót'), ('Phụ Liệu'), ('Thành Phẩm');

-- B. Tạo 4 Brand (Nhãn hàng)
INSERT INTO brands (id, name) VALUES 
(1, 'Unbee'), 
(2, 'Ranbee'), 
(3, 'Mathor'), 
(4, 'Himomi');

-- C. Tạo Hệ thống Kho & Xưởng (Đúng cấu trúc bạn yêu cầu)
-- 1. UNBEE (ID 1) - Có 1 Kho tổng và 4 Xưởng
INSERT INTO warehouses (id, brand_id, name, is_central, address) VALUES 
(1, 1, 'Kho Tổng Unbee', TRUE, 'Hà Nội'),
(2, 1, 'Xưởng Thành Sơn', FALSE, 'Thanh Hóa'),
(3, 1, 'Xưởng Liễu', FALSE, 'Chương Mỹ'),
(4, 1, 'Xưởng Yến', FALSE, 'Nam Định'),
(5, 1, 'Xưởng Huy Đức', FALSE, 'An Khánh');

-- 2. RANBEE (ID 2)
INSERT INTO warehouses (id, brand_id, name, is_central, address) VALUES 
(6, 2, 'Kho Tổng Ranbee', TRUE, 'Hà Nội');

-- 3. MATHOR (ID 3)
INSERT INTO warehouses (id, brand_id, name, is_central, address) VALUES 
(7, 3, 'Kho Tổng Mathor', TRUE, 'Hà Nội');

-- 4. HIMOMI (ID 4)
INSERT INTO warehouses (id, brand_id, name, is_central, address) VALUES 
(8, 4, 'Kho Tổng Himomi', TRUE, 'Hà Nội');


-- D. Tạo Nguyên Vật Liệu (NVL)
-- Vải
INSERT INTO products (category_id, name, type, base_unit) VALUES (1, 'Vải Linen', 'material', 'Mét');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes, note, color) VALUES 
(1, 'LINEN-TRANG', 'Vải Linen Trắng Tự Nhiên', 120000, 'Khổ 1.5m', 'Hàng loại 1', 'Trắng'),
(1, 'LINEN-NAU', 'Vải Linen Nâu Đất', 125000, 'Khổ 1.5m', 'Hàng nhập khẩu', 'Nâu');

-- Cúc
INSERT INTO products (category_id, name, type, base_unit) VALUES (3, 'Cúc Gỗ', 'material', 'Cái');
INSERT INTO product_variants (product_id, sku, variant_name, cost_price, attributes, note, color) VALUES 
(2, 'CUC-GO-01', 'Cúc Gỗ Vintage 2 lỗ', 2000, 'Size 1.5cm', '', 'Nâu gỗ');

-- E. Tạo Nhà Cung Cấp & Nhập Hàng Tồn Đầu Kỳ (Vào Kho Tổng Unbee - ID 1)
INSERT INTO suppliers (name, phone) VALUES ('Nhà Dệt 19/5', '0901234567');

-- Tạo Phiếu Nhập PO-001 (Nhập Vải & Cúc về Kho Tổng Unbee)
INSERT INTO purchase_orders (warehouse_id, supplier_id, po_code, order_date, total_amount, status) 
VALUES (1, 1, 'PO-SETUP-001', CURDATE(), 61000000, 'completed'); 

INSERT INTO purchase_order_items (purchase_order_id, product_variant_id, quantity, unit_price, subtotal) VALUES
(1, 1, 400, 120000, 48000000), -- 400m Vải Linen Trắng
(1, 2, 100, 125000, 12500000), -- 100m Vải Linen Nâu
(1, 3, 2500, 200, 500000);     -- 2500 Cúc

-- Cập nhật Tồn kho cho Kho Tổng Unbee (ID 1)
INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES
(1, 1, 400),
(1, 2, 100),
(1, 3, 2500);

-- Ghi log nhập
INSERT INTO inventory_transactions (warehouse_id, product_variant_id, transaction_type, quantity, reference_id, note) VALUES
(1, 1, 'purchase_in', 400, 1, 'Nhập đầu kỳ'),
(1, 2, 'purchase_in', 100, 1, 'Nhập đầu kỳ'),
(1, 3, 'purchase_in', 2500, 1, 'Nhập đầu kỳ');

-- F. Điều chuyển hàng sang Xưởng Thành Sơn (ID 2) để chuẩn bị SX
-- Chuyển 100m Vải Trắng + 500 Cúc từ Kho Tổng Unbee (1) sang Thành Sơn (2)
UPDATE inventory_stocks SET quantity_on_hand = 300 WHERE warehouse_id = 1 AND product_variant_id = 1; -- Tổng còn 300
UPDATE inventory_stocks SET quantity_on_hand = 2000 WHERE warehouse_id = 1 AND product_variant_id = 3; -- Tổng còn 2000

INSERT INTO inventory_stocks (warehouse_id, product_variant_id, quantity_on_hand) VALUES
(2, 1, 100), -- Xưởng Thành Sơn có 100m Vải
(2, 3, 500); -- Xưởng Thành Sơn có 500 Cúc

-- G. Tạo User (Lưu ý: Mật khẩu chưa mã hóa '123456' theo yêu cầu của bạn)
-- Admin (Quản trị viên - Xem tất cả)
INSERT INTO users (username, password, full_name, role, warehouse_id) 
VALUES ('admin', '123456', 'Quản Trị Viên', 'admin', NULL);

-- User quản lý Xưởng Thành Sơn (ID kho = 2)
INSERT INTO users (username, password, full_name, role, warehouse_id) 
VALUES ('user', '123456', 'QL Xưởng Thành Sơn', 'staff', 2);


CREATE INDEX idx_product_name ON product_variants(variant_name);
CREATE INDEX idx_production_warehouse ON production_orders(warehouse_id);
CREATE INDEX idx_production_status ON production_orders(status);
CREATE INDEX idx_production_product ON production_orders(product_variant_id);
CREATE INDEX idx_trans_warehouse_product ON inventory_transactions(warehouse_id, product_variant_id);
CREATE INDEX idx_trans_ref ON inventory_transactions(reference_id);
CREATE INDEX idx_trans_date ON inventory_transactions(created_at);
CREATE INDEX idx_purchase_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_code ON purchase_orders(po_code);