import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Select, Input, Tabs, Tag, message, Divider, Space, InputNumber } from 'antd';
import { SwapOutlined, PlusOutlined, DeleteOutlined, CrownOutlined, EditOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import warehouseApi from '../api/warehouseApi';
import productApi from '../api/productApi';

const WarehousePage = () => {
    const [activeTab, setActiveTab] = useState('1');
    const [warehouses, setWarehouses] = useState([]);
    const [brands, setBrands] = useState([]);
    const [products, setProducts] = useState([]);
    
    // Modal States
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); // Tạo kho
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false); // Điều chuyển
    const [isBrandModalOpen, setIsBrandModalOpen] = useState(false); // Tạo Brand
    const [isEditModalOpen, setIsEditModalOpen] = useState(false); // Sửa kho
    
    const [currentWarehouse, setCurrentWarehouse] = useState(null);
    const [loading, setLoading] = useState(false);
    
    const [createForm] = Form.useForm();
    const [transferForm] = Form.useForm();
    const [brandForm] = Form.useForm(); 
    const [editForm] = Form.useForm();

    // 1. Load dữ liệu
    const fetchData = async () => {
        setLoading(true);
        try {
            const [wareRes, brandRes, prodRes] = await Promise.all([
                warehouseApi.getAllWarehouses(),
                warehouseApi.getAllBrands(),
                productApi.getAll()
            ]);
            setWarehouses(wareRes.data);
            setBrands(brandRes.data);
            setProducts(prodRes.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 2. Tạo Kho Mới
    const handleCreateWarehouse = async (values) => {
        try {
            if (values.is_central) {
                const existingCentral = warehouses.find(w => w.brand_id === values.brand_id && w.type_name === 'Kho Tổng');
                if (existingCentral) {
                    message.warning("Cảnh báo: Brand này đã có Kho Tổng rồi!");
                }
            }
            await warehouseApi.createWarehouse(values);
            message.success("Tạo kho thành công!");
            setIsCreateModalOpen(false);
            createForm.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail);
        }
    };

    // 3. Tạo Brand Mới
    const handleCreateBrand = async (values) => {
        try {
            await warehouseApi.createBrand(values);
            message.success("Tạo Brand mới thành công!");
            setIsBrandModalOpen(false);
            brandForm.resetFields();
            fetchData(); 
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail);
        }
    };

    // 4. Sửa Kho (MỚI)
    const openEditModal = (record) => {
        setCurrentWarehouse(record);
        editForm.setFieldsValue({
            name: record.name,
            address: record.address,
            // Không set brand_id hay is_central để tránh sửa nhầm
        });
        setIsEditModalOpen(true);
    };

    const handleUpdateWarehouse = async (values) => {
        try {
            await warehouseApi.updateWarehouse(currentWarehouse.id, values);
            message.success("Cập nhật kho thành công!");
            setIsEditModalOpen(false);
            fetchData();
        } catch (error) {
            message.error("Lỗi cập nhật: " + error.response?.data?.detail);
        }
    };

    // 5. Xóa Kho (MỚI)
    const handleDeleteWarehouse = (id) => {
        Modal.confirm({
            title: 'Xóa Kho/Xưởng này?',
            icon: <ExclamationCircleOutlined />,
            content: 'CẢNH BÁO: Chỉ được xóa khi kho chưa có hàng tồn và chưa phát sinh đơn hàng. Hành động này không thể hoàn tác.',
            okText: 'Xóa Vĩnh Viễn',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                try {
                    await warehouseApi.deleteWarehouse(id);
                    message.success("Đã xóa kho!");
                    fetchData();
                } catch (error) {
                    message.error("Không thể xóa: " + (error.response?.data?.detail || "Lỗi server"));
                }
            }
        });
    };

    // 6. Điều Chuyển Kho
    const handleTransfer = async (values) => {
        try {
            await warehouseApi.transferStock(values);
            message.success("Điều chuyển hàng thành công!");
            setIsTransferModalOpen(false);
            transferForm.resetFields();
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail);
        }
    };

    // --- COLUMNS ---
    const columns = [
        { title: 'ID', dataIndex: 'id', width: 50, align: 'center' },
        { title: 'Tên Kho / Xưởng', dataIndex: 'name', key: 'name', render: t => <b>{t}</b> },
        { title: 'Thuộc Brand', dataIndex: 'brand_name', key: 'brand', render: t => <Tag color="purple">{t}</Tag> },
        { 
            title: 'Loại', 
            dataIndex: 'type_name', 
            key: 'type',
            render: (t) => <Tag color={t === 'Kho Tổng' ? 'blue' : 'orange'}>{t}</Tag>
        },
        { title: 'Địa chỉ', dataIndex: 'address', key: 'addr' },
        {
            title: 'Hành động',
            key: 'action',
            align: 'center',
            width: 120,
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} />
                    <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDeleteWarehouse(record.id)} />
                </Space>
            )
        }
    ];

    return (
        <div>
            <Card title="Quản Lý Kho Vận & Điều Chuyển" bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}>
                <Tabs activeKey={activeTab} onChange={setActiveTab}>
                    
                    {/* TAB 1: DANH SÁCH KHO */}
                    <Tabs.TabPane tab="Danh sách Kho bãi" key="1">
                        <Space style={{ marginBottom: 16 }}>
                            <Button type="default" onClick={() => setIsBrandModalOpen(true)} icon={<CrownOutlined />}>
                                Tạo Brand Mới
                            </Button>
                            
                            <Button type="primary" onClick={() => setIsCreateModalOpen(true)} icon={<PlusOutlined />}>
                                Thêm Kho Mới
                            </Button>
                            
                            <Button type="dashed" onClick={() => setIsTransferModalOpen(true)} icon={<SwapOutlined />}>
                                Tạo Lệnh Điều Chuyển
                            </Button>
                        </Space>
                        <Table dataSource={warehouses} columns={columns} rowKey="id" loading={loading} pagination={{pageSize: 10}} />
                    </Tabs.TabPane>

                </Tabs>
            </Card>

            {/* MODAL TẠO BRAND */}
            <Modal title="Khai báo Brand (Nhãn hàng) Mới" open={isBrandModalOpen} onCancel={() => setIsBrandModalOpen(false)} footer={null}>
                <Form layout="vertical" form={brandForm} onFinish={handleCreateBrand}>
                    <Form.Item label="Tên Brand" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên Brand' }]}>
                        <Input placeholder="VD: Brand C - Thời trang Trẻ em" />
                    </Form.Item>
                    <p style={{color: '#888', fontSize: 12}}>Lưu ý: Sau khi tạo Brand, hãy tạo ngay Kho Tổng cho Brand này.</p>
                    <Button type="primary" htmlType="submit" block>Lưu Brand</Button>
                </Form>
            </Modal>

            {/* MODAL TẠO KHO */}
            <Modal title="Thêm Kho / Xưởng Mới" open={isCreateModalOpen} onCancel={() => setIsCreateModalOpen(false)} footer={null}>
                <Form layout="vertical" form={createForm} onFinish={handleCreateWarehouse}>
                    <Form.Item label="Thuộc Brand" name="brand_id" rules={[{ required: true }]}>
                        <Select placeholder="Chọn Brand">
                            {brands.map(b => (
                                <Select.Option key={b.id} value={b.id}>{b.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Tên Kho" name="name" rules={[{ required: true }]}>
                        <Input placeholder="VD: Kho Tổng Brand C" />
                    </Form.Item>
                    <Form.Item label="Loại Kho" name="is_central" initialValue={false}>
                        <Select>
                            <Select.Option value={true}>Kho Tổng (Lưu trữ)</Select.Option>
                            <Select.Option value={false}>Xưởng Sản Xuất</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="Địa chỉ" name="address">
                        <Input.TextArea />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>Lưu Kho</Button>
                </Form>
            </Modal>

            {/* MODAL SỬA KHO */}
            <Modal title="Cập nhật thông tin Kho" open={isEditModalOpen} onCancel={() => setIsEditModalOpen(false)} footer={null}>
                <Form layout="vertical" onFinish={handleUpdateWarehouse} form={editForm}>
                    <Form.Item label="Tên Kho" name="name" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item label="Địa chỉ" name="address"><Input.TextArea /></Form.Item>
                    
                    <div style={{marginTop: 15, padding: 10, background: '#f5f5f5', borderRadius: 4, fontSize: 12, color: '#666'}}>
                        * Để đảm bảo tính toàn vẹn dữ liệu phân quyền, bạn không thể thay đổi <b>Thương hiệu</b> và <b>Loại kho</b> ở đây.
                        Nếu cần thay đổi cấu trúc, hãy xóa kho cũ (nếu trống) và tạo mới.
                    </div>

                    <Button type="primary" htmlType="submit" block style={{marginTop: 15}}>Lưu Thay Đổi</Button>
                </Form>
            </Modal>

            {/* MODAL ĐIỀU CHUYỂN */}
            <Modal title="Điều Chuyển Nội Bộ" open={isTransferModalOpen} onCancel={() => setIsTransferModalOpen(false)} footer={null} width={700}>
                <Form layout="vertical" form={transferForm} onFinish={handleTransfer}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Từ Kho (Nguồn)" name="from_warehouse_id" rules={[{ required: true }]}>
                            <Select placeholder="Chọn kho xuất">
                                {warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item label="Đến Kho (Đích)" name="to_warehouse_id" rules={[{ required: true }]}>
                            <Select placeholder="Chọn kho nhập">
                                {warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    </div>

                    <Divider>Danh sách hàng điều chuyển</Divider>

                    <Form.List name="items" initialValue={[{}]}>
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item {...restField} name={[name, 'product_variant_id']} rules={[{ required: true }]} style={{ width: 300 }}>
                                            <Select placeholder="Chọn hàng hóa..." showSearch optionFilterProp="children">
                                                {products.map(p => (
                                                    <Select.Option key={p.id} value={p.id}>
                                                        {p.sku} - {p.variant_name} (Tồn: {p.quantity_on_hand})
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true }]}>
                                            <InputNumber placeholder="Số lượng" />
                                        </Form.Item>
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                    </Space>
                                ))}
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm hàng hóa</Button>
                            </>
                        )}
                    </Form.List>

                    <Button type="primary" htmlType="submit" block style={{ marginTop: 20 }} icon={<SwapOutlined />}>
                        Xác nhận Điều chuyển
                    </Button>
                </Form>
            </Modal>
        </div>
    );
};

export default WarehousePage;