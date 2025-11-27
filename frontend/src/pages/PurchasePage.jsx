import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Select, Input, InputNumber, DatePicker, message, Divider, Space, Radio } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import purchaseApi from '../api/purchaseApi';
import warehouseApi from '../api/warehouseApi';
import productApi from '../api/productApi';

const PurchasePage = () => {
    // State dữ liệu
    const [suppliers, setSuppliers] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    
    // State giao diện
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    
    // State kiểm soát chế độ nhập Nhà cung cấp ('select' = chọn cũ, 'create' = nhập mới)
    const [supplierMode, setSupplierMode] = useState('select'); 

    const [form] = Form.useForm();

    // 1. Tải dữ liệu ban đầu (Dropdown list)
    const fetchInitialData = async () => {
        try {
            const [suppRes, wareRes, prodRes] = await Promise.all([
                purchaseApi.getAllSuppliers(),
                warehouseApi.getAllWarehouses(),
                productApi.getAll()
            ]);
            setSuppliers(suppRes.data);
            setWarehouses(wareRes.data);
            setProducts(prodRes.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu!");
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    // 2. Xử lý tạo Phiếu Nhập
    const handleCreatePO = async (values) => {
        setLoading(true);
        try {
            // Chuẩn bị payload gửi xuống Backend
            const payload = {
                warehouse_id: values.warehouse_id,
                po_code: values.po_code,
                order_date: values.order_date.format('YYYY-MM-DD'),
                
                // LOGIC QUAN TRỌNG: Gửi ID hoặc Tên mới tùy theo chế độ
                supplier_id: supplierMode === 'select' ? values.supplier_id : null,
                new_supplier_name: supplierMode === 'create' ? values.new_supplier_name : null,

                items: values.items.map(item => ({
                    product_variant_id: item.product_variant_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price
                }))
            };

            await purchaseApi.createPO(payload);
            message.success(`Nhập hàng thành công! Mã: ${values.po_code}`);
            
            // Reset form và đóng modal
            setIsModalOpen(false);
            form.resetFields();
            setSupplierMode('select'); // Reset về mặc định

            // Tải lại danh sách NCC (để nếu vừa tạo mới thì nó hiện ra luôn cho lần sau)
            fetchInitialData();

        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo phiếu"));
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: 0 }}> 
            {/* Lưu ý: Padding để 0 vì App.jsx đã căn lề rồi, hoặc để div trống */}
            <Card 
                title="Quản Lý Nhập Hàng" 
                bordered={false}
                style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                extra={<Button type="primary" onClick={() => setIsModalOpen(true)}>+ Tạo Phiếu Nhập</Button>}
            >
                <div style={{ textAlign: 'center', color: '#888', padding: 20 }}>
                    Danh sách lịch sử nhập hàng sẽ được hiển thị ở đây (Table)
                </div>
            </Card>

            {/* MODAL TẠO PHIẾU NHẬP */}
            <Modal 
                title="Tạo Phiếu Nhập Kho Mới" 
                open={isModalOpen} 
                onCancel={() => setIsModalOpen(false)}
                width={850}
                footer={null}
                style={{ top: 20 }}
            >
                <Form layout="vertical" form={form} onFinish={handleCreatePO}>
                    
                    {/* Hàng 1: Mã và Ngày */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Mã Phiếu (PO Code)" name="po_code" rules={[{ required: true }]}>
                            <Input placeholder="VD: PO-2025-11-01" />
                        </Form.Item>
                        <Form.Item label="Ngày Nhập" name="order_date" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                    </div>

                    {/* Hàng 2: Nhà Cung Cấp (Logic Phức tạp) */}
                    <div style={{ background: '#f5f5f5', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 500 }}>Nhà Cung Cấp:</span>
                            <Radio.Group 
                                value={supplierMode} 
                                onChange={(e) => setSupplierMode(e.target.value)}
                                buttonStyle="solid"
                                size="small"
                            >
                                <Radio.Button value="select">Chọn có sẵn</Radio.Button>
                                <Radio.Button value="create">Nhập mới (+)</Radio.Button>
                            </Radio.Group>
                        </div>

                        {supplierMode === 'select' ? (
                            <Form.Item name="supplier_id" rules={[{ required: true, message: 'Vui lòng chọn NCC' }]} style={{ marginBottom: 0 }}>
                                <Select placeholder="Tìm kiếm NCC..." showSearch optionFilterProp="children">
                                    {suppliers.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        ) : (
                            <Form.Item name="new_supplier_name" rules={[{ required: true, message: 'Nhập tên NCC mới' }]} style={{ marginBottom: 0 }}>
                                <Input placeholder="VD: Nhà may Chị Bảy (Chợ Lớn)..." style={{ border: '1px solid #1677ff' }} />
                            </Form.Item>
                        )}
                    </div>

                    {/* Hàng 3: Kho nhập */}
                    <Form.Item label="Nhập vào Kho" name="warehouse_id" rules={[{ required: true }]}>
                        <Select placeholder="Chọn Kho">
                            {warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                        </Select>
                    </Form.Item>

                    <Divider orientation="left" style={{ borderColor: '#d9d9d9' }}>Chi tiết hàng hóa</Divider>

                    {/* DYNAMIC FORM LIST (Danh sách hàng hóa) */}
                    <Form.List name="items" initialValue={[{}]}>
                        {(fields, { add, remove }) => (
                            <div style={{ background: '#fafafa', padding: 10, borderRadius: 6 }}>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'product_variant_id']}
                                            rules={[{ required: true, message: 'Chọn hàng' }]}
                                            style={{ width: 320 }}
                                        >
                                            <Select placeholder="Chọn Nguyên Vật Liệu" showSearch optionFilterProp="children">
                                                {products.map(p => (
                                                    <Select.Option key={p.id} value={p.id}>
                                                        {p.sku} - {p.variant_name}
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'quantity']}
                                            rules={[{ required: true, message: 'Nhập SL' }]}
                                        >
                                            <InputNumber placeholder="Số lượng" min={0} style={{ width: 120 }} />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'unit_price']}
                                            rules={[{ required: true, message: 'Nhập giá' }]}
                                        >
                                            <InputNumber 
                                                placeholder="Đơn giá" 
                                                min={0} 
                                                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                style={{ width: 150 }}
                                            />
                                        </Form.Item>
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red', cursor: 'pointer' }} />
                                    </Space>
                                ))}
                                <Form.Item style={{ marginBottom: 0 }}>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                        Thêm dòng hàng hóa
                                    </Button>
                                </Form.Item>
                            </div>
                        )}
                    </Form.List>

                    <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ marginTop: 24 }}>
                        Hoàn tất nhập kho
                    </Button>
                </Form>
            </Modal>
        </div>
    );
};

export default PurchasePage;