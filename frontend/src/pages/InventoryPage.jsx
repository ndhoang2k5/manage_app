import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Modal, Form, Input, InputNumber, message } from 'antd';
import productApi from '../api/productApi';

const InventoryPage = () => {
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();

    // 1. Hàm lấy dữ liệu từ Backend
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

    // 2. Cấu hình cột cho bảng
    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
        { 
            title: 'Mã SKU', 
            dataIndex: 'sku', 
            key: 'sku',
            render: (text) => <Tag color="blue">{text}</Tag>
        },
        { title: 'Tên Vật Tư', dataIndex: 'variant_name', key: 'variant_name' },
        { title: 'Danh mục', dataIndex: 'category_name', key: 'category_name' },
        { 
            title: 'Tồn kho', 
            dataIndex: 'quantity_on_hand', 
            key: 'quantity_on_hand',
            render: (qty) => <b style={{ color: qty > 0 ? 'green' : 'red' }}>{qty}</b>
        },
    ];

    // 3. Xử lý khi nhấn nút Lưu (Tạo mới)
    const handleCreate = async (values) => {
        try {
            await productApi.create(values);
            message.success("Tạo vật tư thành công!");
            setIsModalOpen(false);
            form.resetFields();
            fetchMaterials(); // Tải lại bảng
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail || "Không thể tạo");
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <Card 
                title="Kho Nguyên Vật Liệu" 
                extra={<Button type="primary" onClick={() => setIsModalOpen(true)}>+ Nhập Vật Tư Mới</Button>}
            >
                <Table 
                    dataSource={materials} 
                    columns={columns} 
                    rowKey="id" 
                    loading={loading} 
                />
            </Card>

            {/* Modal Form Tạo Mới */}
            <Modal title="Thêm Vật Tư Mới (Nhập tay)" open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null}>
                <Form layout="vertical" onFinish={handleCreate} form={form}>
                    <Form.Item label="Mã SKU (Tự đặt)" name="sku" rules={[{ required: true }]}>
                        <Input placeholder="VD: VAI-001" />
                    </Form.Item>
                    <Form.Item label="Tên Vật tư" name="name" rules={[{ required: true }]}>
                        <Input placeholder="VD: Vải Lụa Đỏ" />
                    </Form.Item>
                    <Form.Item label="Đơn vị tính" name="unit" initialValue="Cái">
                        <Input />
                    </Form.Item>
                    <Form.Item label="Giá vốn (VNĐ)" name="cost_price">
                        <InputNumber style={{ width: '100%' }} formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                    </Form.Item>
                    <Form.Item label="Ghi chú/Thuộc tính" name="attributes">
                        <Input.TextArea />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>Lưu Vật Tư</Button>
                </Form>
            </Modal>
        </div>
    );
};

export default InventoryPage;