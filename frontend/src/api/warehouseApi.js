import axiosClient from './axiosClient';

const warehouseApi = {
    getAllBrands: () => axiosClient.get('/brands'),
    createBrand: (data) => axiosClient.post('/brands/create', data),
    
    getAllWarehouses: () => axiosClient.get('/warehouses'),
    createWarehouse: (data) => axiosClient.post('/warehouses/create', data),

    transferStock: (data) => axiosClient.post('/warehouses/transfer', data),
};

export default warehouseApi;