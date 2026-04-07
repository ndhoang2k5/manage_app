import axiosClient from './axiosClient';

const warehouseApi = {
    getAllBrands: () => axiosClient.get('/brands'),
    createBrand: (data) => axiosClient.post('/brands/create', data),
    
    getAllWarehouses: () => axiosClient.get('/warehouses'),
    createWarehouse: (data) => axiosClient.post('/warehouses/create', data),

    updateWarehouse: (id, data) => axiosClient.put(`/warehouses/${id}`, data),
    updateWorkshopCentralLinks: (id, central_ids) =>
        axiosClient.put(`/warehouses/${id}/central-links`, { central_ids }),
    deleteWarehouse: (id) => axiosClient.delete(`/warehouses/${id}`),

    transferStock: (data) => axiosClient.post('/warehouses/transfer', data),
};

export default warehouseApi;