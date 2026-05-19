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
    getByWarehouse: (id) => axiosClient.get(`/materials/warehouse/${id}`),
};

export default productApi;