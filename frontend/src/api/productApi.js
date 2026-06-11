import axiosClient from './axiosClient';

const productApi = {
    getAll: (scope) => {
        return axiosClient.get('/materials', {
            params: scope ? { scope } : undefined,
        });
    },
    create: (data) => {
        return axiosClient.post('/materials/create', data);
    },
    getAllGroups: () => axiosClient.get('/materials/groups'),
    createGroup: (data) => {
        return axiosClient.post('/materials/groups/create', data);
    },
    update: (id, data) => axiosClient.put(`/materials/${id}`, data),
    getByWarehouse: (id, includeWarehouseId) =>
        axiosClient.get(`/materials/warehouse/${id}`, {
            params: includeWarehouseId ? { include_warehouse_id: includeWarehouseId } : undefined,
        }),
};

export default productApi;