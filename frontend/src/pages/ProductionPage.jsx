import React, { useEffect, useState } from 'react';
import { 
    Table, Card, Button, Modal, Form, Select, Input, 
    InputNumber, DatePicker, Tag, message, Divider, Space, 
    Checkbox, Statistic, Row, Col, Progress, Typography, Upload 
} from 'antd';
import { 
    PlusOutlined, DeleteOutlined, PlayCircleOutlined, 
    DownloadOutlined, StopOutlined, PrinterOutlined, 
    CheckCircleOutlined, SearchOutlined, HistoryOutlined, 
    EditOutlined, SaveOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import productionApi from '../api/productionApi';
import productApi from '../api/productApi';
import warehouseApi from '../api/warehouseApi';

const BASE_URL = 'http://localhost:8000'; 

const ProductionPage = () => {
    // Data States
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]); 
    const [warehouses, setWarehouses] = useState([]);
    
    // Search States
    const [searchText, setSearchText] = useState('');
    const [filterWarehouse, setFilterWarehouse] = useState(null);

    // Modal States
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false); 
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState(0); 
    
    // Detail States
    const [currentOrder, setCurrentOrder] = useState(null);
    const [orderSizes, setOrderSizes] = useState([]); 
    const [printData, setPrintData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [fileList, setFileList] = useState([]);

    const [orderForm] = Form.useForm();
    const [editForm] = Form.useForm();

    const sizeStandards = ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m", "2-3y", "3-4y", "4-5y"];

    // 1. Load Dữ liệu
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

    // Logic Lọc
    const filteredOrders = orders.filter(item => {
        const matchText = 
            (item.code && item.code.toLowerCase().includes(searchText.toLowerCase())) ||
            (item.product_name && item.product_name.toLowerCase().includes(searchText.toLowerCase()));
        const matchWarehouse = filterWarehouse ? item.warehouse_name === filterWarehouse : true;
        return matchText && matchWarehouse;
    });

    // 2. TÍNH GIÁ VỐN (LOGIC MỚI: TỔNG CHI PHÍ / TỔNG SẢN PHẨM)
    const calculateCost = () => {
        const values = orderForm.getFieldsValue();
        const materials = values.materials || [];
        const sizeBreakdown = values.size_breakdown || [];

        // A. Tính tổng tiền Nguyên liệu
        let totalMatCost = 0;
        materials.forEach(item => {
            if(item && item.quantity_needed && item.material_variant_id) {
                const mat = products.find(p => p.id === item.material_variant_id);
                // Lấy giá vốn từ DB, nếu không có tạm tính 0
                const price = mat ? (mat.cost_price || 0) : 0;
                totalMatCost += item.quantity_needed * price; 
            }
        });

        // B. Tính tổng các loại phí
        const totalFees = (values.shipping_fee || 0) + 
                          (values.labor_fee || 0) + 
                          (values.marketing_fee || 0) + 
                          (values.packaging_fee || 0) + 
                          (values.other_fee || 0);

        // C. Tính tổng số lượng sản phẩm
        const totalQty = sizeBreakdown.reduce((sum, i) => sum + (i.quantity || 0), 0);

        // D. Chia đều
        if (totalQty > 0) {
            setEstimatedCost((totalMatCost + totalFees) / totalQty);
        } else {
            setEstimatedCost(0);
        }
    };

    // Lắng nghe thay đổi form để tính lại giá
    const onFormValuesChange = (changedValues, allValues) => {
        calculateCost();
    };

    const handleUpload = async ({ file, onSuccess, onError }) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await productionApi.uploadImage(formData);
            file.url = res.data.url; 
            onSuccess("ok");
        } catch (err) {
            console.error(err);
            onError("Upload failed");
        }
    };
    const handleFileChange = ({ fileList: newFileList }) => { setFileList(newFileList); };

    // 3. TẠO LỆNH SẢN XUẤT
    const handleCreateQuickOrder = async (values) => {
        setLoading(true);
        try {
            const sizeBreakdown = values.size_breakdown || [];
            if (sizeBreakdown.length === 0) {
                message.warning("Vui lòng nhập ít nhất 1 size!");
                setLoading(false);
                return;
            }

            const imageUrls = fileList.filter(f => f.status === 'done' && f.originFileObj.url).map(f => f.originFileObj.url);

            const payload = {
                new_product_name: values.new_product_name,
                new_product_sku: values.new_product_sku,
                order_code: values.code,
                warehouse_id: values.warehouse_id,
                start_date: values.start_date.format('YYYY-MM-DD'),
                due_date: values.due_date.format('YYYY-MM-DD'),
                materials: values.materials,
                size_breakdown: sizeBreakdown, 
                image_urls: imageUrls, 
                auto_start: values.auto_start,
                
                // 5 loại phí
                shipping_fee: values.shipping_fee || 0,
                other_fee: values.other_fee || 0,
                labor_fee: values.labor_fee || 0,
                marketing_fee: values.marketing_fee || 0,
                packaging_fee: values.packaging_fee || 0
            };

            await productionApi.createQuickOrder(payload);
            message.success("Thành công! Đã tạo Lệnh SX.");
            setIsOrderModalOpen(false);
            orderForm.resetFields();
            setFileList([]); 
            setEstimatedCost(0);
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Lỗi tạo lệnh"));
        }
        setLoading(false);
    };

    // 4. MỞ MODAL SỬA (LẤY DỮ LIỆU CŨ)
    const openEditModal = (record) => {
        setCurrentOrder(record);
        productionApi.getPrintData(record.id).then(res => {
            const data = res.data;
            editForm.setFieldsValue({
                code: data.code,
                new_sku: data.sku, // Load SKU cũ lên
                start_date: dayjs(data.start_date),
                due_date: dayjs(data.due_date),
                
                // Load 5 loại phí
                shipping_fee: data.shipping_fee,
                other_fee: data.other_fee,
                labor_fee: data.labor_fee || 0,
                marketing_fee: data.marketing_fee || 0,
                packaging_fee: data.packaging_fee || 0
            });
            setIsEditModalOpen(true);
        }).catch(err => message.error("Lỗi tải thông tin chi tiết"));
    };

    // 5. CẬP NHẬT LỆNH (GỬI SKU VÀ PHÍ MỚI)
    const handleUpdateOrder = async (values) => {
        try {
            const payload = {
                start_date: values.start_date.format('YYYY-MM-DD'),
                due_date: values.due_date.format('YYYY-MM-DD'),
                shipping_fee: values.shipping_fee,
                other_fee: values.other_fee,
                labor_fee: values.labor_fee,
                marketing_fee: values.marketing_fee,
                packaging_fee: values.packaging_fee,
                new_sku: values.new_sku // Gửi SKU mới
            };
            await productionApi.updateOrder(currentOrder.id, payload);
            message.success("Cập nhật thành công!");
            setIsEditModalOpen(false);
            fetchData();
        } catch (error) {
            message.error("Lỗi cập nhật: " + error.response?.data?.detail);
        }
    };

    // 6. XÓA ĐƠN HÀNG (MỚI)
    const handleDeleteOrder = async (id) => {
        if(window.confirm("CẢNH BÁO: Xóa đơn hàng sẽ HOÀN TRẢ nguyên liệu về kho (nếu đã trừ). Bạn chắc chắn chứ?")) {
            try {
                // Giả định api/productionApi.js đã có hàm deleteOrder
                // Nếu chưa có, bạn nhớ thêm: deleteOrder: (id) => axiosClient.delete(`/production/orders/${id}`)
                if (productionApi.deleteOrder) {
                    await productionApi.deleteOrder(id);
                    message.success("Đã xóa đơn hàng!");
                    fetchData();
                } else {
                    message.error("Chưa cấu hình API xóa trong frontend!");
                }
            } catch (error) {
                message.error("Lỗi xóa: " + error.response?.data?.detail);
            }
        }
    }

    // ... Các hành động khác (Start, Finish, Receive, History, Print) ...
    const handleStart = async (id) => { try { await productionApi.startOrder(id); message.success("Đã trừ NVL & Bắt đầu SX!"); fetchData(); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleForceFinish = async (id) => { if(window.confirm("Kết thúc đơn hàng này?")) { try { await productionApi.forceFinish(id); message.success("Đã chốt đơn!"); fetchData(); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } } };
    const openReceiveModal = async (order) => { setCurrentOrder(order); try { const res = await productionApi.getOrderDetails(order.id); const data = res.data.map(item => ({...item, receiving: 0})); setOrderSizes(data); setIsReceiveModalOpen(true); } catch (error) { message.error("Lỗi tải chi tiết size"); } };
    const handleReceiveGoods = async () => {
        try {
            const itemsToReceive = orderSizes.filter(s => s.receiving > 0).map(s => ({ id: s.id, size: s.size, quantity: s.receiving }));
            if (itemsToReceive.length === 0) return message.warning("Chưa nhập số lượng trả hàng!");
            await productionApi.receiveGoods(currentOrder.id, { items: itemsToReceive });
            message.success("Đã nhập kho!");
            setIsReceiveModalOpen(false);
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + error.response?.data?.detail);
        }
    };
    const handleViewHistory = async (id) => { try { const res = await productionApi.getReceiveHistory(id); setHistoryData(res.data); setIsHistoryModalOpen(true); } catch (error) { message.error("Lỗi tải lịch sử"); } };
    const handlePrintOrder = async (id) => { try { const res = await productionApi.getPrintData(id); setPrintData(res.data); setIsPrintModalOpen(true); } catch (error) { message.error("Lỗi tải dữ liệu in"); } };

    const printContent = () => {
        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write('<html><head><title>In Lệnh Sản Xuất</title>');
        printWindow.document.write('<style>body { font-family: "Times New Roman"; padding: 20px; } .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; } th, td { border: 1px solid #000; padding: 8px; text-align: center; } .money-table td { text-align: right; } .footer { margin-top: 40px; display: flex; justify-content: space-between; } .images img { max-width: 150px; margin: 5px; border: 1px solid #ccc; }</style></head><body>');
        printWindow.document.write(document.getElementById('printable-area').innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    const orderColumns = [
        { title: 'Mã Lệnh', dataIndex: 'code', key: 'code', render: t => <b>{t}</b> },
        { title: 'Xưởng May', dataIndex: 'warehouse_name', key: 'warehouse_name' },
        { title: 'Sản Phẩm', dataIndex: 'product_name', key: 'product_name', render: t => <span style={{color: '#1677ff', fontWeight: 500}}>{t}</span> },
        { title: 'Trạng Thái', dataIndex: 'status', align: 'center', render: (s) => <Tag color={s==='draft'?'default':s==='in_progress'?'processing':'success'}>{s.toUpperCase()}</Tag> },
        {
            title: 'Hành động', key: 'action', align: 'center', width: 280,
            render: (_, record) => (
                <Space>
                    <Button icon={<PrinterOutlined />} size="small" onClick={() => handlePrintOrder(record.id)} />
                    <Button icon={<HistoryOutlined />} size="small" onClick={() => handleViewHistory(record.id)} />
                    
                    {/* Nút Sửa */}
                    <Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} />
                    
                    {/* Nút Xóa (MỚI) */}
                    <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDeleteOrder(record.id)} />

                    {record.status === 'draft' && <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(record.id)}>Start</Button>}
                    {record.status === 'in_progress' && (
                        <>
                            <Button size="small" style={{borderColor: '#3f8600', color: '#3f8600'}} icon={<DownloadOutlined />} onClick={() => openReceiveModal(record)}>Nhập</Button>
                            <Button type="text" size="small" danger icon={<StopOutlined />} onClick={() => handleForceFinish(record.id)} />
                        </>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div>
            <Card title="Quản Lý Sản Xuất" bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}
                extra={<Button type="primary" onClick={() => setIsOrderModalOpen(true)} size="large" icon={<PlusOutlined />}>Lên Kế Hoạch / Mẫu Mới</Button>}
            >
                <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Input placeholder="Tìm theo Mã/Tên..." prefix={<SearchOutlined />} style={{ width: 300 }} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
                    <Select placeholder="Lọc theo Xưởng" style={{ width: 200 }} allowClear onChange={val => setFilterWarehouse(val)}>
                        {warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                    </Select>
                    {searchText || filterWarehouse ? <Tag color="blue">Kết quả: {filteredOrders.length}</Tag> : null}
                </div>
                <Table dataSource={filteredOrders} columns={orderColumns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
            </Card>

            {/* MODAL 1: TẠO LỆNH (CẬP NHẬT LOGIC TÍNH GIÁ VÀ LABEL) */}
            <Modal title="Lên Mẫu Mới & Sản Xuất" open={isOrderModalOpen} onCancel={() => setIsOrderModalOpen(false)} footer={null} width={1100} style={{ top: 20 }}>
                <Form layout="vertical" form={orderForm} onFinish={handleCreateQuickOrder} onValuesChange={onFormValuesChange}>
                    <Row gutter={24}>
                        <Col span={8}>
                            <Card size="small" title="1. Thông tin Chung" bordered={false} style={{background: '#f9f9f9', marginBottom: 16}}>
                                <Form.Item label="Mã Lệnh" name="code" rules={[{ required: true }]}><Input placeholder="LSX-001" /></Form.Item>
                                <Form.Item label="Xưởng May" name="warehouse_id" rules={[{ required: true }]}>
                                    <Select placeholder="Chọn xưởng">{warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
                                </Form.Item>
                                <Form.Item label="Tên SP" name="new_product_name" rules={[{ required: true }]}><Input /></Form.Item>
                                <Form.Item label="Mã SKU" name="new_product_sku" rules={[{ required: true }]}><Input /></Form.Item>
                                <Row gutter={10}>
                                    <Col span={12}><Form.Item label="Bắt đầu" name="start_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                                    <Col span={12}><Form.Item label="Hạn xong" name="due_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
                                </Row>
                                
                                {/* 5 LOẠI PHÍ */}
                                <Divider orientation="left" style={{fontSize: 12}}>Chi phí (Tổng đơn)</Divider>
                                <Row gutter={8}>
                                    <Col span={12}><Form.Item label="Gia công" name="labor_fee" initialValue={0}><InputNumber style={{width: '100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                                    <Col span={12}><Form.Item label="Vận chuyển" name="shipping_fee" initialValue={0}><InputNumber style={{width: '100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                                    <Col span={12}><Form.Item label="Marketing" name="marketing_fee" initialValue={0}><InputNumber style={{width: '100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                                    <Col span={12}><Form.Item label="Đóng gói" name="packaging_fee" initialValue={0}><InputNumber style={{width: '100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                                    <Col span={24}><Form.Item label="Phụ phí khác" name="other_fee" initialValue={0}><InputNumber style={{width: '100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                                </Row>
                            </Card>
                            <Card size="small" title="Hình ảnh Mẫu" bordered={false} style={{background: '#fff7e6', border: '1px solid #ffd591'}}>
                                <Upload customRequest={handleUpload} listType="picture-card" fileList={fileList} onChange={handleFileChange}>{fileList.length >= 5 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}</Upload>
                            </Card>
                        </Col>
                        
                        <Col span={8}>
                            <Card size="small" title="2. Size & Ghi chú" bordered={false} style={{background: '#e6f7ff', border: '1px solid #91d5ff', height: '100%'}}>
                                <Form.List name="size_breakdown" initialValue={[{ size: '0-3m', quantity: 0 }]}>{(fields, { add, remove }) => (<div style={{ maxHeight: 400, overflowY: 'auto' }}>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'size']} rules={[{ required: true }]} style={{width: 80}}><Select>{sizeStandards.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}</Select></Form.Item><Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true }]}><InputNumber placeholder="SL" min={1} style={{width: 60}} /></Form.Item><Form.Item {...restField} name={[name, 'note']}><Input placeholder="Ghi chú" style={{width: 100}} /></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{color:'red'}}/></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm Size</Button></div>)}</Form.List>
                            </Card>
                        </Col>

                        <Col span={8}>
                            <Card size="small" title="3. Tổng lượng NVL (Cả lô)" bordered={false} style={{background: '#f9f9f9', height: '100%'}}>
                                <Form.List name="materials">{(fields, { add, remove }) => (<div style={{ maxHeight: 390, overflowY: 'auto' }}>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true }]} style={{ width: 240 }}><Select placeholder="Chọn NVL" showSearch optionFilterProp="children" size="small">{products.filter(p => p.sku && !p.sku.startsWith('AO') && !p.sku.startsWith('QUAN')).map(p => <Select.Option key={p.id} value={p.id}>{p.variant_name}</Select.Option>)}</Select></Form.Item><Form.Item {...restField} name={[name, 'quantity_needed']} rules={[{ required: true }]}><InputNumber placeholder="Tổng" step={0.1} style={{width: 70}} /></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} /></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm NVL</Button></div>)}</Form.List>
                                <Divider style={{margin: '12px 0'}} />
                                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Statistic title="Giá vốn ƯỚC TÍNH (1 SP)" value={estimatedCost} precision={0} valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} suffix="₫" />
                                    <div style={{fontSize: 11, color: '#888', marginTop: 4}}>(Tổng tiền NVL + Phí / Tổng SP)</div>
                                </div>
                                <div style={{marginTop: 20}}><Form.Item name="auto_start" valuePropName="checked"><Checkbox>Xuất kho vải & Chạy ngay?</Checkbox></Form.Item></div>
                            </Card>
                        </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{marginTop: 16}}>Xác nhận</Button>
                </Form>
            </Modal>

            {/* --- MODAL SỬA ĐƠN HÀNG (MỚI) --- */}
            <Modal title="Cập nhật Thông tin & Chi phí" open={isEditModalOpen} onCancel={() => setIsEditModalOpen(false)} footer={null}>
                <Form layout="vertical" form={editForm} onFinish={handleUpdateOrder}>
                    <Form.Item label="Mã Lệnh" name="code"><Input disabled /></Form.Item>
                    
                    {/* Ô SỬA SKU (MỚI) */}
                    <Form.Item label="Mã SKU Sản phẩm (Cập nhật)" name="new_sku" rules={[{ required: true, message: 'SKU không được để trống' }]}>
                        <Input />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}><Form.Item label="Ngày bắt đầu" name="start_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col>
                        <Col span={12}><Form.Item label="Hạn xong" name="due_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col>
                    </Row>
                    <Divider>Cập nhật Chi phí</Divider>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item label="Gia công" name="labor_fee"><InputNumber style={{width:'100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                        <Col span={12}><Form.Item label="Vận chuyển" name="shipping_fee"><InputNumber style={{width:'100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                        <Col span={12}><Form.Item label="Marketing" name="marketing_fee"><InputNumber style={{width:'100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                        <Col span={12}><Form.Item label="Đóng gói" name="packaging_fee"><InputNumber style={{width:'100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                        <Col span={24}><Form.Item label="Phụ phí" name="other_fee"><InputNumber style={{width:'100%'}} formatter={v=>`${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} /></Form.Item></Col>
                    </Row>
                    <Button type="primary" htmlType="submit" block>Lưu Thay Đổi</Button>
                </Form>
            </Modal>

            {/* Modal Nhập hàng & Lịch sử & In giữ nguyên */}
            <Modal title={`📦 Nhập Kho Thành Phẩm (Trả hàng) - ${currentOrder?.code}`} open={isReceiveModalOpen} onCancel={() => setIsReceiveModalOpen(false)} onOk={handleReceiveGoods}><Table dataSource={orderSizes} pagination={false} rowKey="id" size="small" bordered columns={[{ title: 'Size', dataIndex: 'size', align: 'center', width: 80 }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{color:'#888', fontSize: 12}}>{t}</span> }, { title: 'Kế hoạch', dataIndex: 'planned', align: 'center', width: 80 }, { title: 'Đã trả', dataIndex: 'finished', align: 'center', width: 80, render: t => <span style={{color: 'blue'}}>{t}</span> }, { title: 'Nhập Đợt Này', render: (_, r, idx) => <InputNumber min={0} value={r.receiving} onChange={(val) => { const n = [...orderSizes]; n[idx].receiving = val; setOrderSizes(n); }} /> }]} /></Modal>
            <Modal title="📜 Lịch Sử Nhập Hàng" open={isHistoryModalOpen} onCancel={() => setIsHistoryModalOpen(false)} footer={null}><Table dataSource={historyData} pagination={{ pageSize: 5 }} rowKey={(r, i) => i} size="small" columns={[{ title: 'Thời gian', dataIndex: 'date', width: 140 }, { title: 'Size', dataIndex: 'size', width: 80, align: 'center', render: t => <b>{t}</b> }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{fontSize: 12, color: '#888'}}>{t}</span> }, { title: 'Số lượng trả', dataIndex: 'quantity', align: 'center', render: q => <Tag color="green">+{q}</Tag> }]} /></Modal>
            <Modal open={isPrintModalOpen} onCancel={() => setIsPrintModalOpen(false)} footer={[<Button key="close" onClick={() => setIsPrintModalOpen(false)}>Đóng</Button>, <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printContent}>In Ngay</Button>]} width={800}>{printData && (<div id="printable-area" style={{ padding: 20, fontFamily: 'Times New Roman' }}><div className="header" style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 20 }}><h2 style={{margin: 0}}>LỆNH SẢN XUẤT</h2><i>Mã lệnh: <b>{printData.code}</b></i></div><div className="info" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}><div><p><b>Xưởng thực hiện:</b> {printData.warehouse}</p><p><b>Ngày bắt đầu:</b> {printData.start_date}</p></div><div><p><b>Sản phẩm:</b> {printData.product}</p><p><b>Mã SKU:</b> {printData.sku}</p><p><b>Tổng số lượng:</b> {printData.total_qty} cái</p><p><b>Hạn hoàn thành:</b> {printData.due_date}</p></div></div>{printData.images && printData.images.length > 0 && (<div style={{marginBottom: 20}}><h4>HÌNH ẢNH MẪU:</h4><div style={{display: 'flex', gap: 15, flexWrap: 'wrap'}}>{printData.images.map((url, idx) => (<img key={idx} src={`${BASE_URL}${url}`} alt="Mẫu" style={{maxHeight: 150, border: '1px solid #ddd', padding: 2}} />))}</div></div>)}<h4 style={{borderBottom: '1px solid #ccc'}}>1. CHI TIẾT SIZE & SỐ LƯỢNG</h4><table style={{width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #000'}}><thead><tr style={{backgroundColor: '#f0f0f0'}}><th style={{border: '1px solid #000', padding: 8}}>Size</th><th style={{border: '1px solid #000', padding: 8}}>Số lượng đặt</th><th style={{border: '1px solid #000', padding: 8}}>Ghi chú</th></tr></thead><tbody>{printData.sizes.map((s, idx) => (<tr key={idx}><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}><b>{s.size}</b></td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}>{s.qty}</td><td style={{border: '1px solid #000', padding: 8}}>{s.note}</td></tr>))}</tbody></table><h4 style={{borderBottom: '1px solid #ccc'}}>2. ĐỊNH MỨC NGUYÊN LIỆU & CHI PHÍ</h4><table style={{width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #000'}}><thead><tr style={{backgroundColor: '#f0f0f0'}}><th style={{border: '1px solid #000', padding: 8}}>Tên Vật Tư</th><th style={{border: '1px solid #000', padding: 8}}>Định mức/SP</th><th style={{border: '1px solid #000', padding: 8}}>Tổng cấp</th><th style={{border: '1px solid #000', padding: 8}}>Thành tiền (Dự kiến)</th></tr></thead><tbody>{printData.materials.map((m, idx) => (<tr key={idx}><td style={{border: '1px solid #000', padding: 8}}>{m.name} ({m.sku})</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}>{m.usage_per_unit}</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center', fontWeight: 'bold'}}>{m.total_needed}</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'right'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(m.total_cost)}</td></tr>))}</tbody></table><div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 20}}><table style={{width: '50%', borderCollapse: 'collapse', border: '1px solid #000'}} className="money-table"><tbody><tr><td style={{border: '1px solid #000', padding: 5}}><b>Tổng Tiền NVL:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.total_material_cost)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Gia Công:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.labor_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Vận Chuyển:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.shipping_fee)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Marketing:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.marketing_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Đóng Gói:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.packaging_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phụ phí:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.other_fee)}</td></tr><tr style={{backgroundColor: '#e6f7ff'}}><td style={{border: '1px solid #000', padding: 5}}><b>TỔNG CỘNG:</b></td><td style={{border: '1px solid #000', padding: 5, fontWeight: 'bold', color: '#d4380d'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.total_material_cost + printData.shipping_fee + printData.other_fee + (printData.labor_fee||0) + (printData.marketing_fee||0) + (printData.packaging_fee||0))}</td></tr></tbody></table></div><div className="footer" style={{ marginTop: 50, display: 'flex', justifyContent: 'space-between' }}><div className="signature" style={{textAlign: 'center', width: '40%'}}><p><b>Người Lập Lệnh</b></p><br/><br/><br/></div><div className="signature" style={{textAlign: 'center', width: '40%'}}><p><b>Xưởng Xác Nhận</b></p><br/><br/><br/></div></div></div>)}</Modal>
        </div>
    );
};

export default ProductionPage;