import axiosClient from './axiosClient';

const inventoryCheckApi = {
  getSaleworkProducts: (params) => axiosClient.get('/inventory-check/salework/products', { params }),
  importAccountingMovements: (file) => {
    const form = new FormData();
    form.append('file', file);
    return axiosClient.post('/inventory-check/accounting/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getAccountingMovements: (params) => axiosClient.get('/inventory-check/accounting/movements', { params }),
  getAccountingSummary: (params) => axiosClient.get('/inventory-check/accounting/summary', { params }),
  getAccountingOpenings: (params) => axiosClient.get('/inventory-check/accounting/openings', { params }),
  closeAccounting: () => axiosClient.post('/inventory-check/accounting/close'),
  syncSalesFromSalework: (data) => axiosClient.post('/inventory-check/accounting/sync-sales', null, { params: data }),
  syncSalesRealtime: () => axiosClient.post('/inventory-check/accounting/sync-sales-realtime'),
  initOpeningsFromSalework: () => axiosClient.post('/inventory-check/accounting/init-openings-from-salework'),
  getBootstrapState: () => axiosClient.get('/inventory-check/accounting/bootstrap-state'),
  getPeriods: () => axiosClient.get('/inventory-check/periods'),
};

export default inventoryCheckApi;

