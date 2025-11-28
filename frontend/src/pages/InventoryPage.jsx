import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Modal, Form, Input, InputNumber, message, Tabs, Space, Select, Divider } from 'antd';
import { PlusOutlined, AppstoreOutlined, GroupOutlined, DeleteOutlined } from '@ant-design/icons';
import productApi from '../api/productApi';

const InventoryPage = () => {
    // Data States
    const [materials, setMaterials] = useState([]); // Vật tư lẻ
    const [groups, setGroups] = useState([]);       // Nhóm vật tư
    
    // UI States
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false); // Modal tạo lẻ
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false); // Modal tạo nhóm
    
    const [form] = Form.useForm();
    const [groupForm] = Form.useForm();

    // Load dữ liệu
    const fetchData = async () => {
        setLoading(true);
        try {
            const [matRes, groupRes] = await Promise.all([
                productApi.getAll(),
                productApi.getAllGroups()
            ]);
            setMaterials(matRes.data);
            setGroups(groupRes.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- XỬ LÝ TẠO VẬT TƯ LẺ ---
    const handleCreateMaterial = async (values) => {
        try {
            await productApi.create(values);
            message.success("Tạo vật tư thành công!");
            setIsModalOpen(false);
            form.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo"));
        }
    };

    // --- XỬ LÝ TẠO NHÓM (SET) ---
    const handleCreateGroup = async (values) => {
        try {
            // LOGIC MỚI: Tự động gán quantity = 1 cho mỗi item vì giao diện đã bỏ ô nhập
            // Điều này để thỏa mãn yêu cầu của Backend (nếu Backend bắt buộc có field quantity)
            const payload = {
                ...values,
                items: values.items.map(item => ({
                    material_variant_id: item.material_variant_id,
                    quantity: 1 // Mặc định là 1 (Đánh dấu là có mặt trong nhóm)
                }))
            };

            await productApi.createGroup(payload);
            message.success("Tạo nhóm vật tư thành công!");
            setIsGroupModalOpen(false);
            groupForm.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo nhóm"));
        }
    };

    // --- CẤU HÌNH CỘT BẢNG VẬT TƯ LẺ ---
    const materialColumns = [
        { title: 'ID', dataIndex: 'id', width: 60, align: 'center', render: t => <span style={{color:'#888'}}>#{t}</span> },
        { title: 'Mã SKU', dataIndex: 'sku', render: t => <Tag color="blue">{t}</Tag> },
        { title: 'Tên Vật Tư', dataIndex: 'variant_name', render: t => <b>{t}</b> },
        { title: 'Giá Vốn', dataIndex: 'cost_price', align: 'right', render: v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0) },
        { title: 'Tồn kho', dataIndex: 'quantity_on_hand', align: 'center', render: q => <Tag color={q > 0 ? 'success' : 'error'}>{q > 0 ? q : 'Hết'}</Tag> },
    ];

    // --- CẤU HÌNH CỘT BẢNG NHÓM ---
    const groupColumns = [
        { title: 'Mã Nhóm', dataIndex: 'code', width: 150, render: t => <Tag color="purple" style={{fontSize: 14}}>{t}</Tag> },
        { title: 'Tên Nhóm / Bộ', dataIndex: 'name', width: 250, render: t => <b>{t}</b> },
        { title: 'Thành phần', dataIndex: 'items_summary', render: t => <span style={{color: '#666'}}>{t}</span> }, // Backend trả về tên (x1)
        { title: 'Ghi chú', dataIndex: 'description' },
    ];

    return (
        <div>
            <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <Tabs defaultActiveKey="1" items={[
                    {
                        key: '1',
                        label: <span><AppstoreOutlined /> Kho Vật Tư Lẻ</span>,
                        children: (
                            <>
                                <div style={{marginBottom: 16, textAlign: 'right'}}>
                                    <Button type="primary" onClick={() => setIsModalOpen(true)} icon={<PlusOutlined />}>Nhập Vật Tư Mới</Button>
                                </div>
                                <Table dataSource={materials} columns={materialColumns} rowKey="id" loading={loading} pagination={{ pageSize: 8 }} />
                            </>
                        )
                    },
                    {
                        key: '2',
                        label: <span><GroupOutlined /> Danh sách Bộ/Nhóm (Sets)</span>,
                        children: (
                            <>
                                <div style={{marginBottom: 16, textAlign: 'right'}}>
                                    <Button type="dashed" onClick={() => setIsGroupModalOpen(true)} icon={<PlusOutlined />}>Tạo Nhóm Mới</Button>
                                </div>
                                <Table dataSource={groups} columns={groupColumns} rowKey="id" loading={loading} />
                            </>
                        )
                    }
                ]} />
            </Card>

            {/* MODAL 1: TẠO VẬT TƯ LẺ */}
            <Modal title="Thêm Vật Tư Mới (Nhập tay)" open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null}>
                <Form layout="vertical" onFinish={handleCreateMaterial} form={form}>
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
                            <InputNumber style={{ width: '100%' }} formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                        </Form.Item>
                    </div>
                    <Button type="primary" htmlType="submit" block>Lưu Vật Tư</Button>
                </Form>
            </Modal>

            {/* MODAL 2: TẠO NHÓM/SET VẬT TƯ (ĐÃ SỬA GIAO DIỆN) */}
            <Modal title="Tạo Nhóm Vật Tư (Gộp nhiều chi tiết)" open={isGroupModalOpen} onCancel={() => setIsGroupModalOpen(false)} footer={null} width={700}>
                <Form layout="vertical" onFinish={handleCreateGroup} form={groupForm}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Mã Nhóm" name="code" rules={[{ required: true }]}>
                            <Input placeholder="VD: SET-VEST-01" />
                        </Form.Item>
                        <Form.Item label="Tên Nhóm" name="name" rules={[{ required: true }]}>
                            <Input placeholder="VD: Bộ phụ kiện Vest Nam" />
                        </Form.Item>
                    </div>
                    <Form.Item label="Mô tả" name="description">
                        <Input.TextArea rows={1} />
                    </Form.Item>

                    <Divider orientation="left">Chi tiết trong nhóm</Divider>

                    <Form.List name="items">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        {/* Ô Chọn Vật Tư - Kéo dài ra 100% */}
                                        <Form.Item 
                                            {...restField} 
                                            name={[name, 'material_variant_id']} 
                                            rules={[{ required: true, message: 'Chọn vật tư' }]} 
                                            style={{ width: 450 }} // Tăng chiều rộng
                                        >
                                            <Select placeholder="Chọn vật tư con..." showSearch optionFilterProp="children">
                                                {materials.map(m => (
                                                    <Select.Option key={m.id} value={m.id}>
                                                        {/* Hiển thị rõ Tên và Tồn kho hiện tại */}
                                                        {m.sku} - {m.variant_name} (Tồn: {m.quantity_on_hand})
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        
                                        {/* Đã XÓA ô nhập Số lượng (SL) ở đây */}
                                        
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                    </Space>
                                ))}
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                    Thêm dòng vật tư con
                                </Button>
                            </>
                        )}
                    </Form.List>

                    <Button type="primary" htmlType="submit" block style={{marginTop: 20}}>Lưu Nhóm Vật Tư</Button>
                </Form>
            </Modal>
        </div>
    );
};

export default InventoryPage;