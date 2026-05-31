-- Audit snapshots for production order recovery
-- Date: 2026-05-31
-- Purpose:
-- - Lưu snapshot chi tiết đơn sản xuất theo từng mốc thao tác (create/update/start/receive)
-- - Hỗ trợ truy vết & phục hồi khi bị mất dòng size/NVL sau chỉnh sửa

SET @table_exists := (
    SELECT COUNT(1)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'production_order_snapshots'
);

SET @sql_stmt := IF(
    @table_exists = 0,
    'CREATE TABLE production_order_snapshots (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        production_order_id INT NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        actor_user_id INT NULL,
        note VARCHAR(255) NULL,
        snapshot_json LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pos_order_created (production_order_id, created_at),
        INDEX idx_pos_event_created (event_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1'
);

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
