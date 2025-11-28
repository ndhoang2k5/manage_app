import React, { useEffect, useState } from 'react';
import { 
    Table, Card, Button, Modal, Form, Select, Input, 
    InputNumber, DatePicker, Tag, message, Divider, Space, 
    Checkbox, Statistic, Row, Col 
} from 'antd';
import { 
    PlusOutlined, DeleteOutlined, PlayCircleOutlined, 
    CheckCircleOutlined 
} from '@ant-design/icons';
import productionApi from '../api/productionApi';
import productApi from '../api/productApi';
import warehouseApi from '../api/warehouseApi';

const ProductionPage = () => {
    // Data States
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]); 
    const [warehouses, setWarehouses] = useState([]);

    // UI States
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState(0); 
    
    const [orderForm] = Form.useForm();

    // 1. Load dữ liệu chung (Bỏ load BOM)
    const fetchData = async () => {
        setLoading(true);
        try {
            const [orderRes, prodRes, wareRes] = await Promise.all([
                productionApi.getOrders(),
                productApi.getAll(),
                warehouseApi.getAllWarehouses()
            ]);
            setOrders(orderRes.data);
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

    // 2. Logic tính toán Giá Vốn Realtime
    const calculateCost = (currentMaterials) => {
        let tempTotal = 0;
        if (currentMaterials) {
            currentMaterials.forEach(item => {
               if(item && item.quantity_needed) {
                   // Giả sử giá trung bình NVL là 50.000 để demo (thực tế nên lấy từ DB)
                   tempTotal += item.quantity_needed * 50000; 
               }
            });
        }
        setEstimatedCost(tempTotal);
    };

    const onFormValuesChange = (changedValues, allValues) => {
        if (allValues.materials) {
            calculateCost(allValues.materials);
        }
    };

    // 3. Xử lý Tạo Lệnh Sản Xuất Nhanh
    const handleCreateQuickOrder = async (values) => {
        setLoading(true);
        try {
            const payload = {
                new_product_name: values.new_product_name,
                new_product_sku: values.new_product_sku,
                order_code: values.code,
                warehouse_id: values.warehouse_id,
                quantity_planned: values.quantity_planned,
                start_date: values.start_date.format('YYYY-MM-DD'),
                due_date: values.due_date.format('YYYY-MM-DD'),
                materials: values.materials,
                auto_start: values.auto_start
            };

            await productionApi.createQuickOrder(payload);
            message.success("Thành công! Đã tạo Mẫu mới & Lệnh SX.");
            setIsOrderModalOpen(false);
            orderForm.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo lệnh"));
        }
        setLoading(false);
    };

    // 4. Hành động Workflow
    const handleStart = async (id) => {
        try {
            await productionApi.startOrder(id);
            message.success("Đã giữ nguyên liệu & Bắt đầu SX!");
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail);
        }
    };

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
        { title: 'Sản Phẩm', dataIndex: 'product_name', key: 'product_name', render: t => <span style={{color: '#1677ff', fontWeight: 500}}>{t}</span> },
        { title: 'Số lượng', dataIndex: 'quantity_planned', key: 'qty' },
        { 
            title: 'Trạng Thái', 
            dataIndex: 'status', 
            key: 'status',
            render: (status) => {
                let color = status === 'draft' ? 'default' : status === 'in_progress' ? 'processing' : 'success';
                let text = status === 'draft' ? 'Mới (Nháp)' : status === 'in_progress' ? 'Đang May' : 'Hoàn Thành';
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
                        <Button type="primary" size="small" style={{background: '#52c41a'}} icon={<CheckCircleOutlined />} onClick={() => handleFinish(record.id)}>
                            Hoàn thành
                        </Button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div>
            <Card 
                title="Quản Lý & Điều Hành Sản Xuất" 
                bordered={false} 
                style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}
                extra={
                    <Button type="primary" onClick={() => setIsOrderModalOpen(true)} size="large" icon={<PlusOutlined />}>
                        Lên Kế Hoạch / Mẫu Mới
                    </Button>
                }
            >
                {/* Bỏ Tabs, hiển thị trực tiếp bảng Lệnh Sản Xuất */}
                <Table dataSource={orders} columns={orderColumns} rowKey="id" loading={loading} />
            </Card>

            {/* MODAL: TẠO LỆNH SẢN XUẤT NHANH (ALL-IN-ONE) */}
            <Modal 
                title="Lên Mẫu Mới & Sản Xuất Ngay" 
                open={isOrderModalOpen} 
                onCancel={() => setIsOrderModalOpen(false)} 
                footer={null} 
                width={900}
                style={{ top: 20 }}
            >
                <Form 
                    layout="vertical" 
                    form={orderForm} 
                    onFinish={handleCreateQuickOrder}
                    onValuesChange={onFormValuesChange}
                >
                    <Row gutter={16}>
                        <Col span={12}>
                            <Card size="small" title="1. Thông tin Mẫu Mới" bordered={false} style={{background: '#f9f9f9', marginBottom: 16}}>
                                <Form.Item label="Tên Sản Phẩm Mới" name="new_product_name" rules={[{ required: true }]}>
                                    <Input placeholder="VD: Váy Dạ Hội Đỏ 2025" />
                                </Form.Item>
                                <Form.Item label="Mã SKU (Tự đặt)" name="new_product_sku" rules={[{ required: true }]}>
                                    <Input placeholder="VD: VAY-DH-RED-01" />
                                </Form.Item>
                            </Card>

                            <Card size="small" title="2. Thông tin Lệnh SX" bordered={false} style={{background: '#f9f9f9'}}>
                                <Form.Item label="Mã Lệnh" name="code" rules={[{ required: true }]}>
                                    <Input placeholder="VD: LSX-2025-01" />
                                </Form.Item>
                                <Form.Item label="Chọn Xưởng May" name="warehouse_id" rules={[{ required: true }]}>
                                    <Select placeholder="Chọn xưởng">
                                        {warehouses.filter(w => !w.is_central).map(w => (
                                            <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                                <Form.Item label="Số lượng may" name="quantity_planned" rules={[{ required: true }]}>
                                    <InputNumber style={{width: '100%'}} min={1} />
                                </Form.Item>
                                <Row gutter={10}>
                                    <Col span={12}>
                                        <Form.Item label="Ngày bắt đầu" name="start_date" rules={[{ required: true }]}>
                                            <DatePicker style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item label="Hạn xong" name="due_date" rules={[{ required: true }]}>
                                            <DatePicker style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </Card>
                        </Col>

                        <Col span={12}>
                            <Card size="small" title="3. Định mức Nguyên Liệu (BOM)" bordered={false} style={{background: '#f9f9f9', height: '100%'}}>
                                <Form.List name="materials">
                                    {(fields, { add, remove }) => (
                                        <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 5 }}>
                                            {fields.map(({ key, name, ...restField }) => (
                                                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                    <Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true }]} style={{ width: 180 }}>
                                                        <Select placeholder="Chọn NVL" showSearch optionFilterProp="children" size="small">
                                                            {products.filter(p => p.sku && !p.sku.startsWith('AO') && !p.sku.startsWith('QUAN')).map(p => (
                                                                <Select.Option key={p.id} value={p.id}>
                                                                    {p.variant_name}
                                                                </Select.Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>
                                                    <Form.Item {...restField} name={[name, 'quantity_needed']} rules={[{ required: true }]}>
                                                        <InputNumber placeholder="Định mức" step={0.1} size="small" style={{width: 80}} />
                                                    </Form.Item>
                                                    <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red', cursor: 'pointer' }} />
                                                </Space>
                                            ))}
                                            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="small">
                                                Thêm NVL
                                            </Button>
                                        </div>
                                    )}
                                </Form.List>

                                <Divider style={{margin: '12px 0'}} />
                                
                                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Statistic 
                                        title="Giá vốn dự kiến (1 SP)" 
                                        value={estimatedCost} 
                                        precision={0}
                                        valueStyle={{ color: '#3f8600', fontWeight: 'bold' }}
                                        suffix="₫" 
                                    />
                                </div>

                                <div style={{marginTop: 20}}>
                                    <Form.Item name="auto_start" valuePropName="checked">
                                        <Checkbox>
                                            <span style={{fontWeight: 500, color: '#1677ff'}}>Giữ nguyên liệu & Chạy ngay?</span>
                                        </Checkbox>
                                    </Form.Item>
                                </div>
                            </Card>
                        </Col>
                    </Row>

                    <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{marginTop: 16, height: 45, fontSize: 16}}>
                        Xác nhận Lên Mẫu & Sản Xuất
                    </Button>
                </Form>
            </Modal>
        </div>
    );
};

export default ProductionPage;