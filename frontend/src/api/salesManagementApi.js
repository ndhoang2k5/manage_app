import axiosClient from './axiosClient';

const salesManagementApi = {
    fetchSales: (data) => axiosClient.post('/sales-management/fetch', data),
    getReport: (params) => axiosClient.get('/sales-management/report', { params }),
    getSyncStatus: () => axiosClient.get('/sales-management/sync-status'),
    syncNow: () => axiosClient.post('/sales-management/sync-now'),
    syncStock: () => axiosClient.post('/sales-management/sync-stock'),
    backfill: (data) => axiosClient.post('/sales-management/backfill', data),
    exportReport: (params) => axiosClient.get('/sales-management/export', { params, responseType: 'blob' }),
    getPriorityCodes: () => axiosClient.get('/sales-management/priority-codes'),
    savePriorityCodes: (data) => axiosClient.post('/sales-management/priority-codes', data),
};

export default salesManagementApi;
