-- Audit log for manual edits of the "Đã trả" (quantity_finished) column on production order items
-- Date: 2026-10-11
-- Purpose:
-- - Cho phép sửa tay số "Đã trả" khi nhập thừa / ấn nhầm
-- - Mỗi lần sửa đều lưu: ai sửa, lúc nào, số cũ -> số mới, lý do
-- Safe to run multiple times (idempotent). Backend cũng tự tạo bảng nếu chưa có.

CREATE TABLE IF NOT EXISTS production_finished_adjust_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    production_order_id INT NOT NULL,
    production_order_item_id INT NOT NULL,
    size_label VARCHAR(255) NULL,
    old_quantity DECIMAL(15, 2) NOT NULL,
    new_quantity DECIMAL(15, 2) NOT NULL,
    delta DECIMAL(15, 2) NOT NULL,
    reason TEXT NOT NULL,
    inventory_code VARCHAR(100) NULL,
    actor_user_id INT NULL,
    actor_username VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pfal_order_created (production_order_id, created_at),
    INDEX idx_pfal_actor_created (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
