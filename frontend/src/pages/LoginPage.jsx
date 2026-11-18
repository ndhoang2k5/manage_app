import React, { useState } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title } = Typography;

const LoginPage = () => {
    const [loading, setLoading] = useState(false);

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('username', values.username);
            formData.append('password', values.password);

            const res = await axios.post('/api/v1/auth/login', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('user', JSON.stringify(res.data.user_info));
            
            message.success("Đăng nhập thành công!");
            window.location.href = '/'; 
            
        } catch (error) {
            console.error(error);
            if (error.response && error.response.status === 401) {
                message.error("Sai tài khoản hoặc mật khẩu!");
            } else {
                message.error("Lỗi kết nối: " + (error.response?.data?.detail || "Server Error"));
            }
        }
        setLoading(false);
    };
    return (
        <div className="wms-login">
            <Card className="wms-login-card" style={{ width: 400 }}>
                <div style={{ textAlign: 'center', marginBottom: 30 }}>
                    <div className="wms-login-mark" aria-label="GENMEC" />
                    <Title level={3} style={{ color: '#3f2e27', margin: 0 }}>GENMEC WMS</Title>
                    <span style={{ color: '#7b6d63' }}>Hệ thống Quản lý Nội bộ</span>
                </div>

                <Form
                    name="login"
                    onFinish={onFinish}
                    size="large"
                    layout="vertical"
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: 'Vui lòng nhập tài khoản!' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="Tài khoản (admin)" />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" block loading={loading}
                            style={{ fontWeight: 'bold', height: 45 }}>
                            ĐĂNG NHẬP
                        </Button>
                    </Form.Item>
                </Form>
                
                <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: '#a09185' }}>
                    ©2025 Fashion WMS System
                </div>
            </Card>
        </div>
    );
};

export default LoginPage;
