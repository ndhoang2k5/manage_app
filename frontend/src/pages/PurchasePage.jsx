import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Select, Input, InputNumber, DatePicker, message, Divider, Space, Radio, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import purchaseApi from '../api/purchaseApi';
import warehouseApi from '../api/warehouseApi';
import productApi from '../api/productApi';

const PurchasePage = () => {
    // Data States
    const [suppliers, setSuppliers] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [orders, setOrders] = useState([]);
    
    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false); 
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [supplierMode, setSupplierMode] = useState('select'); 
    
    const [currentOrder, setCurrentOrder] = useState(null);

    const [form] = Form.useForm();
    const [editForm] = Form.useForm(); 

    // 1. Tải dữ liệu
    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [suppRes, wareRes, prodRes, orderRes] = await Promise.all([
                purchaseApi.getAllSuppliers(),
                warehouseApi.getAllWarehouses(),
                productApi.getAll(),
                purchaseApi.getAllPOs()
            ]);
            setSuppliers(suppRes.data);
            setWarehouses(wareRes.data);
            setProducts(prodRes.data);
            setOrders(orderRes.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    // 2. Tạo Mới
    const handleCreatePO = async (values) => {
        setLoading(true);
        try {
            const payload = {
                warehouse_id: values.warehouse_id,
                po_code: values.po_code,
                order_date: values.order_date.format('YYYY-MM-DD'),
                supplier_id: supplierMode === 'select' ? values.supplier_id : null,
                new_supplier_name: supplierMode === 'create' ? values.new_supplier_name : null,
                items: values.items.map(item => ({
                    product_variant_id: item.product_variant_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price
                }))
            };
            await purchaseApi.createPO(payload);
            message.success(`Nhập hàng thành công!`);
            setIsModalOpen(false);
            form.resetFields();
            fetchInitialData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo"));
        }
        setLoading(false);
    };

    // --- 3. XỬ LÝ SỬA (QUAN TRỌNG) ---
    const handleOpenEdit = async (id) => {
        try {
            const res = await purchaseApi.getDetail(id);
            const data = res.data;
            setCurrentOrder(data);
            
            editForm.setFieldsValue({
                po_code: data.po_code,
                supplier_id: data.supplier_id,
                order_date: dayjs(data.order_date),
                items: data.items // Antd tự map mảng này vào Form.List
            });
            
            setIsEditModalOpen(true);
        } catch (error) {
            message.error("Lỗi tải chi tiết đơn hàng");
        }
    };

    const handleUpdatePO = async (values) => {
        setLoading(true);
        try {
            const payload = {
                po_code: values.po_code,
                supplier_id: values.supplier_id,
                order_date: values.order_date.format('YYYY-MM-DD'),
                // Map đúng cấu trúc Backend yêu cầu (PurchaseUpdateRequest)
                items: values.items.map(item => ({
                    id: item.id,            // ID dòng chi tiết (để backend biết dòng nào)
                    quantity: item.quantity, // Số lượng mới (để tính chênh lệch)
                    unit_price: item.unit_price
                }))
            };

            await purchaseApi.update(currentOrder.id, payload);
            message.success("Cập nhật phiếu & tồn kho thành công!");
            setIsEditModalOpen(false);
            fetchInitialData();
        } catch (error) {
            message.error("Lỗi cập nhật: " + error.response?.data?.detail);
        }
        setLoading(false);
    };

    // --- CỘT BẢNG ---
    const columns = [
        { title: 'Mã Phiếu', dataIndex: 'po_code', key: 'code', render: t => <b>{t}</b> },
        { title: 'Nhà Cung Cấp', dataIndex: 'supplier_name', key: 'supplier' },
        { title: 'Nhập Kho', dataIndex: 'warehouse_name', key: 'warehouse' },
        { title: 'Ngày Nhập', dataIndex: 'order_date', key: 'date' },
        { title: 'Tổng Tiền', dataIndex: 'total_amount', align: 'right', render: v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v) },
        { title: 'Trạng thái', dataIndex: 'status', render: s => <Tag color="success">{s}</Tag> },
        {
            title: 'Hành động',
            key: 'action',
            render: (_, record) => (
                <Button icon={<EditOutlined />} onClick={() => handleOpenEdit(record.id)} type="text" style={{color: '#1677ff'}}>Chi tiết/Sửa</Button>
            )
        }
    ];

    return (
        <div>
            <Card title="Lịch Sử Nhập Hàng" bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                extra={<Button type="primary" onClick={() => setIsModalOpen(true)} icon={<PlusOutlined />}>Tạo Phiếu Nhập</Button>}
            >
                <Table dataSource={orders} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
            </Card>

            {/* MODAL TẠO (GIỮ NGUYÊN) */}
            <Modal title="Tạo Phiếu Nhập Kho Mới" open={isModalOpen} onCancel={() => setIsModalOpen(false)} width={850} footer={null} style={{ top: 20 }}>
                <Form layout="vertical" form={form} onFinish={handleCreatePO}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Mã Phiếu (PO Code)" name="po_code" rules={[{ required: true }]}><Input placeholder="VD: PO-2025-11-01" /></Form.Item>
                        <Form.Item label="Ngày Nhập" name="order_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
                    </div>
                    <div style={{ background: '#f5f5f5', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
                        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 500 }}>Nhà Cung Cấp:</span>
                            <Radio.Group value={supplierMode} onChange={(e) => setSupplierMode(e.target.value)} size="small" buttonStyle="solid">
                                <Radio.Button value="select">Chọn có sẵn</Radio.Button><Radio.Button value="create">Nhập mới (+)</Radio.Button>
                            </Radio.Group>
                        </div>
                        {supplierMode === 'select' ? 
                            <Form.Item name="supplier_id" rules={[{ required: true }]} style={{ marginBottom: 0 }}><Select placeholder="Chọn NCC...">{suppliers.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}</Select></Form.Item> : 
                            <Form.Item name="new_supplier_name" rules={[{ required: true }]} style={{ marginBottom: 0 }}><Input placeholder="Nhập tên NCC mới..." /></Form.Item>
                        }
                    </div>
                    <Form.Item label="Nhập vào Kho" name="warehouse_id" rules={[{ required: true }]}><Select placeholder="Chọn Kho">{warehouses.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select></Form.Item>
                    <Divider orientation="left">Chi tiết hàng hóa</Divider>
                    <Form.List name="items" initialValue={[{}]}>
                        {(fields, { add, remove }) => (
                            <div style={{ background: '#fafafa', padding: 10, borderRadius: 6 }}>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                        <Form.Item {...restField} name={[name, 'product_variant_id']} rules={[{ required: true, message: 'Chọn hàng' }]} style={{ width: 320 }}><Select placeholder="Chọn Nguyên Vật Liệu" showSearch optionFilterProp="children">{products.map(p => <Select.Option key={p.id} value={p.id}>{p.sku} - {p.variant_name}</Select.Option>)}</Select></Form.Item>
                                        <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: 'Nhập SL' }]}><InputNumber placeholder="Số lượng" min={0} style={{ width: 120 }} /></Form.Item>
                                        <Form.Item {...restField} name={[name, 'unit_price']} rules={[{ required: true, message: 'Nhập giá' }]}><InputNumber placeholder="Đơn giá" min={0} formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} style={{ width: 150 }} /></Form.Item>
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red', cursor: 'pointer' }} />
                                    </Space>
                                ))}
                                <Form.Item style={{ marginBottom: 0 }}><Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm dòng hàng hóa</Button></Form.Item>
                            </div>
                        )}
                    </Form.List>
                    <Button type="primary" htmlType="submit" loading={loading} block size="large" style={{ marginTop: 24 }}>Hoàn tất nhập kho</Button>
                </Form>
            </Modal>

            {/* --- MODAL SỬA (CHO PHÉP SỬA SỐ LƯỢNG & GIÁ) --- */}
            <Modal 
                title="Chi Tiết / Chỉnh Sửa Phiếu Nhập" 
                open={isEditModalOpen} 
                onCancel={() => setIsEditModalOpen(false)} 
                width={950} 
                footer={null}
                style={{ top: 20 }}
            >
                <Form layout="vertical" form={editForm} onFinish={handleUpdatePO}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        <Form.Item label="Mã Phiếu" name="po_code" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item label="Nhà Cung Cấp" name="supplier_id" rules={[{ required: true }]}>
                            <Select>{suppliers.map(s => <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>)}</Select>
                        </Form.Item>
                        <Form.Item label="Ngày Nhập" name="order_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
                    </div>

                    <div style={{background: '#fffbe6', padding: 10, border: '1px solid #ffe58f', borderRadius: 6, marginBottom: 16, fontSize: 13}}>
                        ⚠️ <b>Lưu ý:</b> Thay đổi số lượng sẽ tự động <b>Cộng thêm</b> hoặc <b>Trừ bớt</b> tồn kho hiện tại.
                    </div>

                    <Form.List name="items">
                        {(fields) => (
                            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                                    <thead style={{background: '#fafafa', position: 'sticky', top: 0, zIndex: 1}}>
                                        <tr>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0'}}>Mã SKU</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0'}}>Tên Hàng</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0', width: 120}}>Số lượng (Sửa)</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0', width: 150}}>Đơn giá (Sửa)</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0', textAlign: 'right'}}>Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fields.map(({ key, name, ...restField }) => {
                                            // Lấy dữ liệu item từ form data để hiển thị text tĩnh (SKU, Name)
                                            // Dữ liệu này được set từ handleOpenEdit
                                            const itemData = editForm.getFieldValue(['items', name]);
                                            
                                            return (
                                                <tr key={key} style={{borderBottom: '1px solid #f0f0f0'}}>
                                                    {/* Hidden ID để gửi về Backend */}
                                                    <Form.Item name={[name, 'id']} hidden><Input /></Form.Item>
                                                    
                                                    <td style={{padding: 8}}><Tag>{itemData?.sku}</Tag></td>
                                                    <td style={{padding: 8}}><b>{itemData?.name}</b></td>
                                                    
                                                    {/* Ô NHẬP SỐ LƯỢNG */}
                                                    <td style={{padding: 8}}>
                                                        <Form.Item {...restField} name={[name, 'quantity']} style={{marginBottom: 0}}>
                                                            <InputNumber min={0} style={{width: '100%'}} />
                                                        </Form.Item>
                                                    </td>

                                                    {/* Ô NHẬP GIÁ */}
                                                    <td style={{padding: 8}}>
                                                        <Form.Item {...restField} name={[name, 'unit_price']} style={{marginBottom: 0}}>
                                                            <InputNumber 
                                                                min={0} 
                                                                style={{width: '100%'}}
                                                                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                            />
                                                        </Form.Item>
                                                    </td>
                                                    <td style={{padding: 8, textAlign: 'right', color: '#888'}}>
                                                        {/* Tính tạm thành tiền để hiển thị (chỉ là UI) */}
                                                        {/* Lưu ý: Giá trị này không tự nhảy real-time nếu không dùng Form.useWatch, nhưng để đơn giản ta hiển thị giá trị lúc load */}
                                                        {new Intl.NumberFormat('vi-VN').format((itemData?.quantity || 0) * (itemData?.unit_price || 0))}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Form.List>

                    <Button type="primary" htmlType="submit" block size="large" icon={<SaveOutlined />} style={{ marginTop: 24 }} loading={loading}>
                        Lưu & Cập nhật Kho
                    </Button>
                </Form>
            </Modal>
        </div>
    );
};

export default PurchasePage;