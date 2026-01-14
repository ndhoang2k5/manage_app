import axiosClient from './axiosClient';

const productionApi = {
    // Lấy danh sách
    getOrders: (params) => axiosClient.get('/production/orders', { params }),
    
    // Tạo lệnh
    createQuickOrder: (data) => axiosClient.post('/production/orders/create-quick', data),
    
    // Lấy chi tiết & Lịch sử
    getOrderDetails: (id) => axiosClient.get(`/production/orders/${id}/details`),
    getReceiveHistory: (id) => axiosClient.get(`/production/orders/${id}/history`),
    getPrintData: (id) => axiosClient.get(`/production/orders/${id}/print`),
    
    // Hành động
    receiveGoods: (id, data) => axiosClient.post(`/production/orders/${id}/receive`, data),
    startOrder: (id) => axiosClient.post(`/production/orders/${id}/start`),
    finishOrder: (id) => axiosClient.post(`/production/orders/${id}/complete`),
    forceFinish: (id) => axiosClient.post(`/production/orders/${id}/force-finish`),
    
    // Cập nhật & Xóa
    updateOrder: (id, data) => axiosClient.put(`/production/orders/${id}`, data),
    deleteOrder: (id) => axiosClient.delete(`/production/orders/${id}`),
    
    // Upload
    uploadImage: (formData) => axiosClient.post('/production/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    updateProgress: (id, data) => axiosClient.put(`/production/orders/${id}/progress`, data),
};

export default productionApi;