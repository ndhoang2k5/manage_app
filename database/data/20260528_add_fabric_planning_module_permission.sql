-- Tách quyền "Kế hoạch đặt vải" thành module riêng.
-- Sao chép quyền từ "sales-management" cho các tài khoản hiện có để tránh mất quyền sau khi deploy.

INSERT INTO account_module_permissions (user_id, module_key, can_view, can_manage)
SELECT
  amp.user_id,
  'fabric-planning' AS module_key,
  amp.can_view,
  amp.can_manage
FROM account_module_permissions amp
WHERE amp.module_key = 'sales-management'
ON DUPLICATE KEY UPDATE
  can_view = VALUES(can_view),
  can_manage = VALUES(can_manage),
  updated_at = CURRENT_TIMESTAMP;
