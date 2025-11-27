import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Modal, Form, Input, InputNumber, message, Statistic } from 'antd';
import productApi from '../api/productApi';

const InventoryPage = () => {
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();

    const fetchMaterials = async () => {
        setLoading(true);
        try {
            const response = await productApi.getAll();
            setMaterials(response.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu kho!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMaterials();
    }, []);

    // --- CẤU HÌNH CỘT BẢNG MỚI ---
    const columns = [
        { 
            title: 'ID', 
            dataIndex: 'id', 
            key: 'id', 
            width: 60,
            align: 'center',
            render: (text) => <span style={{color: '#888'}}>#{text}</span>
        },
        { 
            title: 'Mã SKU', 
            dataIndex: 'sku', 
            key: 'sku',
            render: (text) => <Tag color="geekblue" style={{ fontWeight: 500 }}>{text}</Tag>
        },
        { 
            title: 'Tên Vật Tư', 
            dataIndex: 'variant_name', 
            key: 'variant_name',
            render: (text) => <b style={{ fontSize: 15 }}>{text}</b>
        },
        // BỎ CỘT DANH MỤC VÌ BỊ TRÙNG LẶP
        { 
            title: 'Giá Vốn', 
            dataIndex: 'cost_price', 
            key: 'cost_price',
            align: 'right', // Số tiền nên căn phải
            render: (val) => (
                <span style={{ color: '#595959' }}>
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)}
                </span>
            )
        },
        { 
            title: 'Tồn kho', 
            dataIndex: 'quantity_on_hand', 
            key: 'quantity_on_hand',
            align: 'center',
            width: 120,
            render: (qty) => (
                <Tag color={qty > 0 ? 'success' : 'error'} style={{ fontSize: 14, padding: '4px 10px' }}>
                    {qty > 0 ? qty : 'Hết hàng'}
                </Tag>
            )
        },
    ];

    const handleCreate = async (values) => {
        try {
            await productApi.create(values);
            message.success("Tạo vật tư thành công!");
            setIsModalOpen(false);
            form.resetFields();
            fetchMaterials();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo"));
        }
    };

    return (
        <div>
            <Card 
                title="📦 Kho Nguyên Vật Liệu" 
                bordered={false} 
                style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                extra={<Button type="primary" onClick={() => setIsModalOpen(true)}>+ Nhập Vật Tư Mới</Button>}
            >
                <Table 
                    dataSource={materials} 
                    columns={columns} 
                    rowKey="id" 
                    loading={loading} 
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal title="Thêm Vật Tư Mới (Nhập tay)" open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null}>
                <Form layout="vertical" onFinish={handleCreate} form={form}>
                    <Form.Item label="Mã SKU (Tự đặt)" name="sku" rules={[{ required: true }]}>
                        <Input placeholder="VD: VAI-001" />
                    </Form.Item>
                    <Form.Item label="Tên Vật tư" name="name" rules={[{ required: true }]}>
                        <Input placeholder="VD: Vải Lụa Đỏ" />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Đơn vị tính" name="unit" initialValue="Cái">
                            <Input />
                        </Form.Item>
                        <Form.Item label="Giá vốn (VNĐ)" name="cost_price" initialValue={0}>
                            <InputNumber 
                                style={{ width: '100%' }} 
                                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            />
                        </Form.Item>
                    </div>
                    <Form.Item label="Ghi chú/Thuộc tính" name="attributes">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>Lưu Vật Tư</Button>
                </Form>
            </Modal>
        </div>
    );
};

export default InventoryPage;