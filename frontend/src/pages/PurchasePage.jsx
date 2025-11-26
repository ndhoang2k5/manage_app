import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Select, Input, InputNumber, DatePicker, message, Divider, Space } from 'antd';
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
    const [form] = Form.useForm();

    // 1. Tải dữ liệu ban đầu (Dropdown list)
    useEffect(() => {
        const fetchData = async () => {
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
        fetchData();
    }, []);

    // 2. Xử lý tạo Phiếu Nhập
    const handleCreatePO = async (values) => {
        setLoading(true);
        try {
            // Format dữ liệu đúng chuẩn Backend yêu cầu
            const payload = {
                warehouse_id: values.warehouse_id,
                supplier_id: values.supplier_id,
                po_code: values.po_code,
                order_date: values.order_date.format('YYYY-MM-DD'),
                items: values.items.map(item => ({
                    product_variant_id: item.product_variant_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price
                }))
            };

            await purchaseApi.createPO(payload);
            message.success(`Nhập hàng thành công! Mã: ${values.po_code}`);
            setIsModalOpen(false);
            form.resetFields();
            // Ở đây nên có logic reload lại bảng lịch sử (nếu có)
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo phiếu"));
        }
        setLoading(false);
    };

    return (
        <div style={{ padding: 20 }}>
            <Card 
                title="Quản Lý Nhập Hàng" 
                extra={<Button type="primary" onClick={() => setIsModalOpen(true)}>+ Tạo Phiếu Nhập</Button>}
            >
                <div style={{ textAlign: 'center', color: '#888' }}>
                    Danh sách lịch sử nhập hàng (Tính năng sẽ phát triển sau)
                </div>
            </Card>

            {/* MODAL TẠO PHIẾU NHẬP */}
            <Modal 
                title="Tạo Phiếu Nhập Kho Mới" 
                open={isModalOpen} 
                onCancel={() => setIsModalOpen(false)}
                width={800}
                footer={null}
            >
                <Form layout="vertical" form={form} onFinish={handleCreatePO}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Mã Phiếu (PO Code)" name="po_code" rules={[{ required: true }]}>
                            <Input placeholder="VD: PO-2025-11-01" />
                        </Form.Item>
                        <Form.Item label="Ngày Nhập" name="order_date" rules={[{ required: true }]}>
                            <DatePicker style={{ width: '100%' }} />
                        </Form.Item>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Nhà Cung Cấp" name="supplier_id" rules={[{ required: true }]}>
                            <Select placeholder="Chọn NCC">
                                {suppliers.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                        <Form.Item label="Nhập vào Kho" name="warehouse_id" rules={[{ required: true }]}>
                            <Select placeholder="Chọn Kho">
                                {warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                            </Select>
                        </Form.Item>
                    </div>

                    <Divider>Chi tiết hàng hóa</Divider>

                    {/* DYNAMIC FORM LIST (Danh sách hàng hóa) */}
                    <Form.List name="items" initialValue={[{}]}>
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'product_variant_id']}
                                            rules={[{ required: true, message: 'Chọn hàng' }]}
                                            style={{ width: 300 }}
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
                                            <InputNumber placeholder="Số lượng" min={0} />
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
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                    </Space>
                                ))}
                                <Form.Item>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                        Thêm dòng hàng hóa
                                    </Button>
                                </Form.Item>
                            </>
                        )}
                    </Form.List>

                    <Button type="primary" htmlType="submit" loading={loading} block size="large">
                        Hoàn tất nhập kho
                    </Button>
                </Form>
            </Modal>
        </div>
    );
};

export default PurchasePage;