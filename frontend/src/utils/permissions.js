export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
};

export const getModulePermissionMap = (user) => {
  const arr = Array.isArray(user?.module_permissions) ? user.module_permissions : null;
  const map = {};
  if (!arr) return map;
  arr.forEach((item) => {
    map[item.module_key] = {
      can_view: !!item.can_view,
      can_manage: !!item.can_manage,
    };
  });
  return map;
};

export const canViewModule = (user, moduleKey) => {
  if (user?.role === 'admin') return true;
  if (moduleKey === 'inventory' || moduleKey === 'warehouses') return true;
  const map = getModulePermissionMap(user);
  // Backward compatibility for old token payloads
  if (!Array.isArray(user?.module_permissions)) return true;
  return !!map[moduleKey]?.can_view;
};

export const canManageModule = (user, moduleKey) => {
  if (user?.role === 'admin') return true;
  const map = getModulePermissionMap(user);
  // Backward compatibility for old token payloads
  if (!Array.isArray(user?.module_permissions)) return true;
  return !!map[moduleKey]?.can_manage;
};
