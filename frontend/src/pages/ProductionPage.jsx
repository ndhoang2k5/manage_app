import React, { useEffect, useState } from 'react';
import { Tabs, Table, Card, Button, Modal, Form, Select, Input, InputNumber, DatePicker, Tag, message, Divider, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import productionApi from '../api/productionApi';
import productApi from '../api/productApi';
import warehouseApi from '../api/warehouseApi';

const ProductionPage = () => {
    const [activeTab, setActiveTab] = useState('1'); // 1: Lệnh SX, 2: Công thức
    
    // Data States
    const [orders, setOrders] = useState([]);
    const [boms, setBoms] = useState([]);
    const [products, setProducts] = useState([]); // List vật tư & thành phẩm
    const [warehouses, setWarehouses] = useState([]);

    // UI States
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isBomModalOpen, setIsBomModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    
    const [orderForm] = Form.useForm();
    const [bomForm] = Form.useForm();

    // 1. Load dữ liệu chung
    const fetchData = async () => {
        setLoading(true);
        try {
            const [orderRes, bomRes, prodRes, wareRes] = await Promise.all([
                productionApi.getOrders(),
                productionApi.getBoms(),
                productApi.getAll(),
                warehouseApi.getAllWarehouses()
            ]);
            setOrders(orderRes.data);
            setBoms(bomRes.data);
            setProducts(prodRes.data);
            setWarehouses(wareRes.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // 2. Xử lý tạo Công thức (BOM)
    const handleCreateBOM = async (values) => {
        try {
            await productionApi.createBOM(values);
            message.success("Tạo công thức thành công!");
            setIsBomModalOpen(false);
            bomForm.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi tạo BOM: " + error.response?.data?.detail);
        }
    };

    // 3. Xử lý tạo Lệnh SX
    const handleCreateOrder = async (values) => {
        try {
            const payload = {
                ...values,
                start_date: values.start_date.format('YYYY-MM-DD'),
                due_date: values.due_date.format('YYYY-MM-DD')
            };
            await productionApi.createOrder(payload);
            message.success("Tạo lệnh SX thành công!");
            setIsOrderModalOpen(false);
            orderForm.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi tạo lệnh: " + error.response?.data?.detail);
        }
    };

    // 4. Hành động: Bắt đầu SX
    const handleStart = async (id) => {
        try {
            await productionApi.startOrder(id);
            message.success("Đã giữ nguyên liệu & Bắt đầu SX!");
            fetchData();
        } catch (error) {
            message.error("Không thể bắt đầu: " + error.response?.data?.detail);
        }
    };

    // 5. Hành động: Hoàn thành
    const handleFinish = async (id) => {
        try {
            await productionApi.finishOrder(id);
            message.success("Sản xuất hoàn tất! Đã nhập kho thành phẩm.");
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail);
        }
    };

    // --- CẤU HÌNH CỘT BẢNG ---
    const orderColumns = [
        { title: 'Mã Lệnh', dataIndex: 'code', key: 'code', render: t => <b>{t}</b> },
        { title: 'Xưởng May', dataIndex: 'warehouse_name', key: 'warehouse_name' },
        { title: 'Sản Phẩm', dataIndex: 'product_name', key: 'product_name' },
        { title: 'Số lượng', dataIndex: 'quantity_planned', key: 'qty' },
        { 
            title: 'Trạng Thái', 
            dataIndex: 'status', 
            key: 'status',
            render: (status) => {
                let color = status === 'draft' ? 'default' : status === 'in_progress' ? 'processing' : 'success';
                let text = status === 'draft' ? 'Nháp' : status === 'in_progress' ? 'Đang May' : 'Hoàn Thành';
                return <Tag color={color}>{text.toUpperCase()}</Tag>;
            }
        },
        {
            title: 'Hành động',
            key: 'action',
            render: (_, record) => (
                <Space>
                    {record.status === 'draft' && (
                        <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(record.id)}>
                            Bắt đầu
                        </Button>
                    )}
                    {record.status === 'in_progress' && (
                        <Button type="primary" size="small" style={{background: 'green'}} icon={<CheckCircleOutlined />} onClick={() => handleFinish(record.id)}>
                            Hoàn thành
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    const bomColumns = [
        { title: 'ID', dataIndex: 'id', width: 50 },
        { title: 'Tên Công Thức', dataIndex: 'name', key: 'name', render: t => <b>{t}</b> },
        { title: 'Áp dụng cho SP', dataIndex: 'product_name', key: 'pname', render: t => <Tag color="purple">{t}</Tag> },
    ];

    return (
        <div style={{ padding: 20 }}>
            <Card title="Quản Lý Sản Xuất">
                <Tabs activeKey={activeTab} onChange={setActiveTab}>
                    
                    {/* TAB 1: DANH SÁCH LỆNH SX */}
                    <Tabs.TabPane tab="Lệnh Sản Xuất" key="1">
                        <Button type="primary" style={{ marginBottom: 16 }} onClick={() => setIsOrderModalOpen(true)}>
                            + Tạo Lệnh Sản Xuất Mới
                        </Button>
                        <Table dataSource={orders} columns={orderColumns} rowKey="id" loading={loading} />
                    </Tabs.TabPane>

                    {/* TAB 2: QUẢN LÝ CÔNG THỨC */}
                    <Tabs.TabPane tab="Công Thức (BOM)" key="2">
                        <Button type="dashed" style={{ marginBottom: 16 }} onClick={() => setIsBomModalOpen(true)}>
                            + Thiết lập Công thức Mới
                        </Button>
                        <Table dataSource={boms} columns={bomColumns} rowKey="id" loading={loading} />
                    </Tabs.TabPane>

                </Tabs>
            </Card>

            {/* MODAL 1: TẠO LỆNH SX */}
            <Modal title="Lên Kế Hoạch Sản Xuất" open={isOrderModalOpen} onCancel={() => setIsOrderModalOpen(false)} footer={null}>
                <Form layout="vertical" form={orderForm} onFinish={handleCreateOrder}>
                    <Form.Item label="Mã Lệnh (Tự đặt)" name="code" rules={[{ required: true }]}>
                        <Input placeholder="VD: LSX-2025-01" />
                    </Form.Item>
                    <Form.Item label="Chọn Xưởng May" name="warehouse_id" rules={[{ required: true }]}>
                        <Select placeholder="Chọn Xưởng">
                            {warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Sản phẩm cần may" name="product_variant_id" rules={[{ required: true }]}>
                        <Select placeholder="Chọn Áo/Quần" showSearch optionFilterProp="children">
                            {products.map(p => (
                                <Select.Option key={p.id} value={p.id}>{p.variant_name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Số lượng may" name="quantity_planned" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={1} />
                    </Form.Item>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <Form.Item label="Ngày bắt đầu" name="start_date" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item label="Ngày trả hàng" name="due_date" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                    </div>
                    <Button type="primary" htmlType="submit" block>Lưu Lệnh (Nháp)</Button>
                </Form>
            </Modal>

            {/* MODAL 2: TẠO CÔNG THỨC (BOM) */}
            <Modal title="Thiết lập Công thức (Định mức)" open={isBomModalOpen} onCancel={() => setIsBomModalOpen(false)} footer={null} width={700}>
                <Form layout="vertical" form={bomForm} onFinish={handleCreateBOM}>
                    <Form.Item label="Tên Công thức" name="name" rules={[{ required: true }]}>
                        <Input placeholder="VD: Công thức Áo Sơ mi Mùa Hè" />
                    </Form.Item>
                    <Form.Item label="Sản phẩm áp dụng (Thành phẩm)" name="product_variant_id" rules={[{ required: true }]}>
                        <Select placeholder="Chọn Áo/Quần..." showSearch optionFilterProp="children">
                            {products.map(p => (
                                <Select.Option key={p.id} value={p.id}>{p.variant_name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    
                    <Divider>Thành phần Nguyên liệu (Cho 1 đơn vị SP)</Divider>
                    
                    <Form.List name="materials" initialValue={[{}]}>
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true }]} style={{ width: 300 }}>
                                            <Select placeholder="Chọn Vải/Cúc..." showSearch optionFilterProp="children">
                                                {products.map(p => (
                                                    <Select.Option key={p.id} value={p.id}>{p.variant_name}</Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item {...restField} name={[name, 'quantity_needed']} rules={[{ required: true }]}>
                                            <InputNumber placeholder="Định mức (VD: 1.5)" step={0.1} />
                                        </Form.Item>
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                    </Space>
                                ))}
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm nguyên liệu</Button>
                            </>
                        )}
                    </Form.List>
                    <Button type="primary" htmlType="submit" block style={{ marginTop: 20 }}>Lưu Công Thức</Button>
                </Form>
            </Modal>
        </div>
    );
};

export default ProductionPage;