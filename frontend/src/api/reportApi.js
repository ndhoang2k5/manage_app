import axiosClient from './axiosClient';

const reportApi = {
    // Lấy dữ liệu tổng hợp cho Kho Tổng theo ID
    getCentralDashboard: (warehouseId) => {
        return axiosClient.get(`/reports/central-dashboard/${warehouseId}`);
    },

    getWorkshopDetail: (warehouseId) => {
        return axiosClient.get(`/reports/workshop/${warehouseId}`);
    }
};

export default reportApi;