import axiosClient from './axiosClient';

const accountApi = {
  getAll: () => axiosClient.get('/accounts'),
  create: (data) => axiosClient.post('/accounts/create', data),
  update: (id, data) => axiosClient.put(`/accounts/${id}`, data),
  remove: (id) => axiosClient.delete(`/accounts/${id}`),
  getPermissions: (id) => axiosClient.get(`/accounts/${id}/permissions`),
  updateModules: (id, module_permissions) =>
    axiosClient.put(`/accounts/${id}/permissions/modules`, { module_permissions }),
  updateScopes: (id, warehouse_ids) =>
    axiosClient.put(`/accounts/${id}/permissions/scopes`, { warehouse_ids }),
};

export default accountApi;
