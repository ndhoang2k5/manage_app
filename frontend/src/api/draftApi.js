import axiosClient from './axiosClient';

const draftApi = {
    getAll: () => axiosClient.get('/drafts'),
    create: (data) => axiosClient.post('/drafts/create', data),
    update: (id, data) => axiosClient.put(`/drafts/${id}`, data),
    delete: (id) => axiosClient.delete(`/drafts/${id}`),
};

export default draftApi;