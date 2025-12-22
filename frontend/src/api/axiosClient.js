import axios from 'axios';

const axiosClient = axios.create({
   baseURL: 'http://45.117.177.181:8000/api/v1', 
    headers: {
        'Content-Type': 'application/json',
    },
});

// INTERCEPTOR (CHẶN REQUEST ĐỂ GẮN TOKEN)
axiosClient.interceptors.request.use(async (config) => {
    const token = localStorage.getItem('token'); // Lấy token từ bộ nhớ
    if (token) {
        // Gắn vào Header: Authorization: Bearer <token>
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// INTERCEPTOR (CHẶN RESPONSE ĐỂ XỬ LÝ LỖI 401)
axiosClient.interceptors.response.use((response) => {
    return response;
}, (error) => {
    if (error.response && error.response.status === 401) {
        // Nếu Token hết hạn hoặc sai -> Xóa token và đá về trang Login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login'; 
    }
    return Promise.reject(error);
});

export default axiosClient;