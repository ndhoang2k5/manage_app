import axiosClient from './axiosClient';

const salesManagementApi = {
    fetchSales: (data) => axiosClient.post('/sales-management/fetch', data),
    getReport: (params) => axiosClient.get('/sales-management/report', { params }),
    searchProductCodes: (params) => axiosClient.get('/sales-management/product-codes/search', { params }),
    searchProductCodesForPlanning: (params) => axiosClient.get('/sales-management/product-planning/product-codes/search', { params }),
    getProductPlanning4w: (data) => axiosClient.post('/sales-management/product-planning/4w', data),
    getSyncStatus: (params) => axiosClient.get('/sales-management/sync-status', { params }),
    syncNow: (params) => axiosClient.post('/sales-management/sync-now', null, { params }),
    syncStock: (params) => axiosClient.post('/sales-management/sync-stock', null, { params }),
    backfill: (data) => axiosClient.post('/sales-management/backfill', data),
    exportReport: (params) => axiosClient.get('/sales-management/export', { params, responseType: 'blob' }),
    getHouseholds: () => axiosClient.get('/sales-management/households'),
    getHouseholdReport: (params) => axiosClient.get('/sales-management/household/report', { params }),
    exportHouseholdReport: (params) => axiosClient.get('/sales-management/household/export', { params, responseType: 'blob' }),
    getPriorityCodes: (params) => axiosClient.get('/sales-management/priority-codes', { params }),
    savePriorityCodes: (data) => axiosClient.post('/sales-management/priority-codes', data),
};

export default salesManagementApi;
