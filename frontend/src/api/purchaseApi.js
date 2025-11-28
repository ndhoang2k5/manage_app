import axiosClient from './axiosClient';

const purchaseApi = {
    getAllSuppliers: () => axiosClient.get('/suppliers'),
    createSupplier: (data) => axiosClient.post('/suppliers/create', data),
    
    createPO: (data) => axiosClient.post('/purchases/create', data),
    getAllPOs: () => axiosClient.get('/purchases'), 
};

export default purchaseApi;