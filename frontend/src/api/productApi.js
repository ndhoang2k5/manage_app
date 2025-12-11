import axiosClient from './axiosClient';

const productApi = {
    getAll: () => {
        return axiosClient.get('/materials');
    },
    create: (data) => {
        return axiosClient.post('/materials/create', data);
    },
    getAllGroups: () => axiosClient.get('/materials/groups'),
    createGroup: (data) => {
        return axiosClient.post('/materials/groups/create', data);
    },
    update: (id, data) => axiosClient.put(`/materials/${id}`, data),
};

export default productApi;