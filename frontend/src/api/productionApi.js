// frontend/src/api/productionApi.js
import axiosClient from './axiosClient';

const productionApi = {
    // BOM (Công thức)
    getBoms: () => axiosClient.get('/production/boms'),
    createBOM: (data) => axiosClient.post('/production/bom/create', data),

    // Orders (Lệnh SX)
    getOrders: () => axiosClient.get('/production/orders'),
    createOrder: (data) => axiosClient.post('/production/orders/create', data),
    createQuickOrder: (data) => axiosClient.post('/production/orders/create-quick', data),
    
    // 1. Lấy chi tiết size (Hàm này đang bị thiếu gây lỗi)
    getOrderDetails: (id) => axiosClient.get(`/production/orders/${id}/details`),
    
    // 2. Nhập kho (Trả hàng)
    receiveGoods: (id, data) => axiosClient.post(`/production/orders/${id}/receive`, data),
    forceFinish: (id) => axiosClient.post(`/production/orders/${id}/force-finish`),
    
    startOrder: (id) => axiosClient.post(`/production/orders/${id}/start`),
    
    finishOrder: (id) => axiosClient.post(`/production/orders/${id}/complete`),

    // In lệnh sản xuất
    getPrintData: (id) => axiosClient.get(`/production/orders/${id}/print`),

    // 3. Lấy lịch sử nhập hàng theo đợt
    getReceiveHistory: (id) => axiosClient.get(`/production/orders/${id}/history`),


    // Tải lên hình ảnh
    uploadImage: (formData) => axiosClient.post('/production/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

export default productionApi;