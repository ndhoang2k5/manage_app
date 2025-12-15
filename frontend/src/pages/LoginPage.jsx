// import React, { useState } from 'react';
// import { Card, Form, Input, Button, message, Typography } from 'antd';
// import { UserOutlined, LockOutlined, SkinOutlined } from '@ant-design/icons';
// import axios from 'axios';

// const { Title } = Typography;

// const LoginPage = () => {
//     const [loading, setLoading] = useState(false);

//     const onFinish = async (values) => {
//         setLoading(true);
//         try {
//             // Gọi API Login trực tiếp (hoặc qua axiosClient nếu muốn)
//             const res = await axios.post('http://localhost:8000/api/v1/auth/login', values);
            
//             // Lưu Token và thông tin User vào bộ nhớ trình duyệt
//             localStorage.setItem('token', res.data.access_token);
//             localStorage.setItem('user', JSON.stringify(res.data.user_info));
            
//             message.success("Đăng nhập thành công!");
            
//             // Load lại trang để vào App chính
//             window.location.href = '/'; 
            
//         } catch (error) {
//             message.error("Đăng nhập thất bại! Kiểm tra lại tài khoản.");
//         }
//         setLoading(false);
//     };

//     return (
//         <div style={{
//             height: '100vh', 
//             display: 'flex', 
//             justifyContent: 'center', 
//             alignItems: 'center', 
//             background: 'linear-gradient(135deg, #001529 0%, #003eb3 100%)'
//         }}>
//             <Card style={{ width: 400, borderRadius: 10, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
//                 <div style={{ textAlign: 'center', marginBottom: 30 }}>
//                     <div style={{background: '#001529', width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px'}}>
//                         <SkinOutlined style={{ fontSize: 30, color: '#fff' }} />
//                     </div>
//                     <Title level={3} style={{color: '#001529'}}>FASHION WMS</Title>
//                     <span style={{color: '#888'}}>Đăng nhập hệ thống quản lý</span>
//                 </div>

//                 <Form
//                     name="login"
//                     onFinish={onFinish}
//                     size="large"
//                 >
//                     <Form.Item
//                         name="username"
//                         rules={[{ required: true, message: 'Vui lòng nhập tài khoản!' }]}
//                     >
//                         <Input prefix={<UserOutlined />} placeholder="Tài khoản (admin)" />
//                     </Form.Item>

//                     <Form.Item
//                         name="password"
//                         rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
//                     >
//                         <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu (123456)" />
//                     </Form.Item>

//                     <Form.Item>
//                         <Button type="primary" htmlType="submit" block loading={loading} style={{background: '#001529', borderColor: '#001529'}}>
//                             Đăng Nhập
//                         </Button>
//                     </Form.Item>
//                 </Form>
//                 <div style={{textAlign: 'center', fontSize: 12, color: '#888'}}>
//                     ©2025 Hệ thống nội bộ
//                 </div>
//             </Card>
//         </div>
//     );
// };

// export default LoginPage;