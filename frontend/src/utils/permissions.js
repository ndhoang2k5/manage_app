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

export const canViewMaterialCost = (user) => {
  if (user?.role === 'admin') return true;
  const map = getModulePermissionMap(user);
  if (!Array.isArray(user?.module_permissions)) return false;
  if (!map['material-cost']?.can_view) return false;
  if (!Array.isArray(user?.material_cost_brand_ids)) return false;
  return user.material_cost_brand_ids.length > 0;
};

export const canViewMaterialCostForBrand = (user, brandId) => {
  if (user?.role === 'admin') return true;
  if (!canViewMaterialCost(user)) return false;
  if (!Array.isArray(user?.material_cost_brand_ids)) return false;
  if (!brandId) return false;
  return user.material_cost_brand_ids.map((x) => Number(x)).includes(Number(brandId));
};

export const canViewMaterialCostForAnyBrand = (user, brandIds) => {
  if (user?.role === 'admin') return true;
  if (!canViewMaterialCost(user)) return false;
  if (!Array.isArray(user?.material_cost_brand_ids)) return false;
  if (!Array.isArray(brandIds) || brandIds.length === 0) return false;
  const allowed = new Set(user.material_cost_brand_ids.map((x) => Number(x)));
  return brandIds.every((id) => allowed.has(Number(id)));
};
