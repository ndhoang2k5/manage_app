-- Migration: add accounting_stock_movements
-- Date: 2026-04-22
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS accounting_stock_movements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_code VARCHAR(50) NOT NULL,            -- Map với cột "Mã hàng"
    movement_date DATE NULL,                      -- Cột "Ngày" (nếu parse được)
    movement_type VARCHAR(100) NOT NULL,          -- Cột "Loại biến động" (text)
    direction ENUM('inc', 'dec') NOT NULL,        -- Tăng / Giảm
    quantity DECIMAL(15, 2) NOT NULL DEFAULT 0,   -- Cột "Số lượng"
    reason TEXT,                                  -- Cột "Lý do"
    department VARCHAR(100) NULL,                 -- Cột "Bộ phận"
    owner VARCHAR(100) NULL,                      -- Cột "Người phụ trách"
    document_ref VARCHAR(100) NULL,               -- Cột "Chứng từ"
    note TEXT,                                    -- Cột "Ghi chú"
    source_file VARCHAR(255) NULL,                -- Tên file upload để trace
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_acc_move_code_date (product_code, movement_date),
    INDEX idx_acc_move_type (movement_type),
    INDEX idx_acc_move_created (created_at)
);

