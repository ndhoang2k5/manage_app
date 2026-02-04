import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Select, Input, InputNumber, DatePicker, message, Divider, Space, Radio, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import purchaseApi from '../api/purchaseApi';
import warehouseApi from '../api/warehouseApi';
import productApi from '../api/productApi';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

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

    // 3. Mở Modal Sửa
    const handleOpenEdit = async (id) => {
        try {
            const res = await purchaseApi.getDetail(id);
            const data = res.data;
            setCurrentOrder(data);
            
            editForm.setFieldsValue({
                po_code: data.po_code,
                supplier_id: data.supplier_id,
                order_date: dayjs(data.order_date),
                items: data.items.map(item => ({
                    id: item.id, // Quan trọng: ID dòng cũ
                    product_variant_id: item.product_variant_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    // Các trường hiển thị thêm (UI)
                    sku: item.sku,
                    name: item.name
                }))
            });
            
            setIsEditModalOpen(true);
        } catch (error) {
            message.error("Lỗi tải chi tiết đơn hàng");
        }
    };

    // 4. Cập Nhật (Sửa + Thêm mới)
    const handleUpdatePO = async (values) => {
        setLoading(true);
        try {
            const payload = {
                po_code: values.po_code,
                supplier_id: values.supplier_id,
                order_date: values.order_date.format('YYYY-MM-DD'),
                
                // Map items: Có ID -> Sửa, Không ID -> Thêm mới
                items: values.items.map(item => ({
                    id: item.id, // Gửi ID đi (nếu có)
                    product_variant_id: item.product_variant_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price
                }))
            };

            await purchaseApi.update(currentOrder.id, payload);
            message.success("Cập nhật phiếu & tồn kho thành công!");
            setIsEditModalOpen(false);
            fetchInitialData();
        } catch (error) {
            // Xử lý lỗi hiển thị [object Object]
            console.error("Lỗi chi tiết:", error.response?.data);
            let errorMsg = "Lỗi cập nhật";
            
            if (error.response?.data?.detail) {
                if (typeof error.response.data.detail === 'string') {
                    errorMsg = error.response.data.detail;
                } else if (Array.isArray(error.response.data.detail)) {
                    // Lỗi Validation (422)
                    errorMsg = "Dữ liệu không hợp lệ: " + error.response.data.detail[0].msg;
                }
            }
            message.error(errorMsg);
        }
        setLoading(false);
    };

    // 5. Xóa Phiếu Nhập
    const handleDeletePO = (id) => {
        Modal.confirm({
            title: 'Xóa phiếu nhập hàng?',
            icon: <ExclamationCircleOutlined />,
            content: 'CẢNH BÁO: Hành động này sẽ trừ lại số lượng tồn kho tương ứng. Bạn có chắc chắn muốn xóa?',
            okText: 'Xóa ngay',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                setLoading(true);
                try {
                    if (purchaseApi.delete) {
                        await purchaseApi.delete(id);
                        message.success("Đã xóa phiếu nhập!");
                        fetchInitialData();
                    } else {
                        message.error("Thiếu hàm API xóa!");
                    }
                } catch (error) {
                    message.error("Lỗi xóa: " + (error.response?.data?.detail || error.message));
                }
                setLoading(false);
            },
        });
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
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => handleOpenEdit(record.id)} size="small">Chi tiết/Sửa</Button>
                    <Button icon={<DeleteOutlined />} onClick={() => handleDeletePO(record.id)} size="small" danger type="primary" ghost />
                </Space>
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
                                        <Form.Item {...restField} name={[name, 'unit_price']} rules={[{ required: true, message: 'Nhập giá' }]}><InputNumber placeholder="Đơn giá" min={0} style={{ width: 150 }} /></Form.Item>
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

            {/* --- MODAL SỬA (CHO PHÉP SỬA & THÊM HÀNG MỚI) --- */}
            <Modal 
                title="Chỉnh sửa" 
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
                        {(fields, { add, remove }) => (
                            <div style={{ maxHeight: 400, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
                                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                                    <thead style={{background: '#fafafa', position: 'sticky', top: 0, zIndex: 1}}>
                                        <tr>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0'}}>Tên Hàng</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0', width: 100}}>Số lượng (Sửa)</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0', width: 140}}>Đơn giá (Sửa)</th>
                                            <th style={{padding: 8, borderBottom: '1px solid #f0f0f0', textAlign: 'right'}}>Thành tiền</th>
                                            <th style={{width: 40}}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fields.map(({ key, name, ...restField }) => {
                                            const itemData = editForm.getFieldValue(['items', name]);
                                            const isExisting = !!itemData?.id; // Check xem là dòng cũ hay mới

                                            return (
                                                <tr key={key} style={{borderBottom: '1px solid #f0f0f0', background: isExisting ? '#fff' : '#f6ffed'}}>
                                                    {/* Hidden ID */}
                                                    <Form.Item name={[name, 'id']} hidden><Input /></Form.Item>
                                                    
                                                    <td style={{padding: 8}}>
                                                        {isExisting ? (
                                                            // Dòng cũ: Chỉ hiện text
                                                            <div>
                                                                <Tag>{itemData?.sku}</Tag> <b>{itemData?.name}</b>
                                                                {/* Hidden field product_variant_id để gửi kèm nếu cần */}
                                                                <Form.Item name={[name, 'product_variant_id']} hidden><Input /></Form.Item>
                                                            </div>
                                                        ) : (
                                                            // Dòng mới: Hiện Select
                                                            <Form.Item 
                                                                {...restField} 
                                                                name={[name, 'product_variant_id']} 
                                                                rules={[{ required: true, message: 'Chọn hàng' }]} 
                                                                style={{marginBottom: 0}}
                                                            >
                                                                <Select 
                                                                    placeholder="Chọn nguyên liệu thêm..." 
                                                                    showSearch 
                                                                    optionFilterProp="children"
                                                                    style={{width: '100%'}}
                                                                >
                                                                    {products.map(p => (
                                                                        <Select.Option key={p.id} value={p.id}>
                                                                            {p.sku} - {p.variant_name}
                                                                        </Select.Option>
                                                                    ))}
                                                                </Select>
                                                            </Form.Item>
                                                        )}
                                                    </td>
                                                    
                                                    <td style={{padding: 8}}>
                                                        <Form.Item {...restField} name={[name, 'quantity']} style={{marginBottom: 0}} rules={[{ required: true }]}>
                                                            <InputNumber min={0} style={{width: '100%'}} />
                                                        </Form.Item>
                                                    </td>

                                                    <td style={{padding: 8}}>
                                                        <Form.Item {...restField} name={[name, 'unit_price']} style={{marginBottom: 0}} rules={[{ required: true }]}>
                                                            <InputNumber min={0} style={{width: '100%'}} 
                                                                formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                                parser={value => value.replace(/\$\s?|(,*)/g, '')}
                                                            />
                                                        </Form.Item>
                                                    </td>
                                                    <td style={{padding: 8, textAlign: 'right', color: '#888'}}>
                                                        {new Intl.NumberFormat('vi-VN').format((editForm.getFieldValue(['items', name, 'quantity']) || 0) * (editForm.getFieldValue(['items', name, 'unit_price']) || 0))}
                                                    </td>
                                                    <td style={{padding: 8, textAlign: 'center'}}>
                                                        {!isExisting && (
                                                            <DeleteOutlined onClick={() => remove(name)} style={{color: 'red', cursor: 'pointer'}} />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {/* Nút thêm dòng */}
                                        <tr>
                                            <td colSpan={5} style={{padding: 10, textAlign: 'center'}}>
                                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                                    Thêm nguyên liệu vào phiếu này
                                                </Button>
                                            </td>
                                        </tr>
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