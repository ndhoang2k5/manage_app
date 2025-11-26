import axiosClient from './axiosClient';

const productionApi = {
    // BOM (Công thức)
    getBoms: () => axiosClient.get('/production/boms'),
    createBOM: (data) => axiosClient.post('/production/bom/create', data),

    // Orders (Lệnh SX)
    getOrders: () => axiosClient.get('/production/orders'),
    createOrder: (data) => axiosClient.post('/production/orders/create', data),
    
    // Hành động
    startOrder: (id) => axiosClient.post(`/production/orders/${id}/start`),
    finishOrder: (id) => axiosClient.post(`/production/orders/${id}/complete`),
};

export default productionApi;