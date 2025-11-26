import axios from 'axios';

const axiosClient = axios.create({
    baseURL: 'http://localhost:8000/api/v1', // URL của Backend FastAPI
    headers: {
        'Content-Type': 'application/json',
    },
});

export default axiosClient;