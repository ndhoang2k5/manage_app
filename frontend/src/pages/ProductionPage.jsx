import React, { useEffect, useState } from 'react';
import { 
    Table, Card, Button, Modal, Form, Select, Input, 
    InputNumber, DatePicker, Tag, message, Divider, Space, 
    Checkbox, Statistic, Row, Col, Progress, Typography, Upload, Tooltip 
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
    // 1. Data States
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]); // Danh sách chung (dùng cho list)
    const [warehouses, setWarehouses] = useState([]);
    
    // --- STATE QUAN TRỌNG: NVL THEO KHO ---
    const [warehouseMaterials, setWarehouseMaterials] = useState([]); 
    // --------------------------------------

    const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
    const [searchText, setSearchText] = useState('');
    const [filterWarehouse, setFilterWarehouse] = useState(null);

    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false); 
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState(0); 
    
    const [currentOrder, setCurrentOrder] = useState(null);
    const [orderSizes, setOrderSizes] = useState([]); 
    const [printData, setPrintData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [fileList, setFileList] = useState([]);

    const [orderForm] = Form.useForm();
    const [editForm] = Form.useForm();

    const sizeStandards = ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m", "2-3y", "3-4y", "4-5y"];

    // Load Dữ liệu ban đầu
    const fetchData = async (page = 1, pageSize = 10, search = null, warehouse = null) => {
        setLoading(true);
        try {
            // Load master data 1 lần
            const [prodRes, wareRes] = await Promise.all([
                productApi.getAll(),
                warehouseApi.getAllWarehouses()
            ]);
            setProducts(prodRes.data);
            setWarehouses(wareRes.data);

            const params = {
                page: page,
                limit: pageSize,
                search: search || undefined,
                warehouse: warehouse || undefined
            };
            const res = await productionApi.getOrders(params);
            
            if (res.data && Array.isArray(res.data.data)) {
                setOrders(res.data.data);
                setPagination({ current: page, pageSize: pageSize, total: res.data.total });
            } else {
                setOrders([]);
            }
        } catch (error) {
            console.error(error);
            message.error("Lỗi tải dữ liệu!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData(1, 10);
    }, []);

    // --- LOGIC 1: KHI CHỌN XƯỞNG -> LOAD NVL CỦA XƯỞNG ĐÓ ---
    const handleWarehouseChange = async (warehouseId) => {
        if (!warehouseId) {
            setWarehouseMaterials([]);
            return;
        }
        
        // Reset form để tránh chọn nhầm
        orderForm.setFieldsValue({ materials: [] });
        setEstimatedCost(0);

        try {
            // Gọi API lấy NVL theo kho (Đảm bảo backend và api frontend đã có hàm này)
            const res = await productApi.getByWarehouse(warehouseId);
            setWarehouseMaterials(res.data);
            message.success(`Đã tải danh sách NVL tại kho!`);
        } catch (error) {
            message.error("Lỗi tải NVL của kho này");
        }
    };
    // ---------------------------------------------------------

    // --- LOGIC 2: CHỌN VẬT TƯ -> TỰ ĐIỀN TỒN KHO ---
    const handleMaterialSelect = (value, fieldName) => {
        // Tìm trong danh sách NVL CỦA XƯỞNG (warehouseMaterials)
        const selectedMaterial = warehouseMaterials.find(p => p.id === value);
        
        if (selectedMaterial) {
            const stock = selectedMaterial.quantity_on_hand || 0;
            const currentMaterials = orderForm.getFieldValue('materials');
            
            // Tự điền số lượng (Optional: Nếu bạn muốn tự điền max tồn kho)
            // currentMaterials[fieldName].quantity_needed = stock; 
            
            orderForm.setFieldsValue({ materials: currentMaterials });
            calculateCost();
            
            // Thông báo tồn kho
            if (stock <= 0) {
                message.warning(`Vật tư này đang hết hàng tại xưởng! (Tồn: 0)`);
            } else {
                message.info(`Tồn kho tại xưởng: ${stock}`);
            }
        }
    };
    // ------------------------------------------------

    // Tính giá vốn (Dựa trên warehouseMaterials)
    const calculateCost = () => {
        const values = orderForm.getFieldsValue();
        const materials = values.materials || [];
        const sizeBreakdown = values.size_breakdown || [];

        let totalMatCost = 0;
        materials.forEach(item => {
            if(item && item.quantity_needed && item.material_variant_id) {
                // Tìm trong warehouseMaterials để lấy giá
                const mat = warehouseMaterials.find(p => p.id === item.material_variant_id);
                // Fallback: Nếu không tìm thấy (hiếm), tìm trong products chung
                const fallbackMat = products.find(p => p.id === item.material_variant_id);
                
                const price = (mat && mat.cost_price) ? mat.cost_price : (fallbackMat ? fallbackMat.cost_price : 0);
                totalMatCost += Number(item.quantity_needed) * price; 
            }
        });

        const totalFees = Number(values.shipping_fee || 0) + Number(values.labor_fee || 0) + Number(values.marketing_fee || 0) + Number(values.packaging_fee || 0) + Number(values.print_fee || 0) + Number(values.other_fee || 0);
        const totalQty = sizeBreakdown.reduce((sum, i) => sum + Number(i.quantity || 0), 0);

        if (totalQty > 0) {
            setEstimatedCost((totalMatCost + totalFees) / totalQty);
        } else {
            setEstimatedCost(0);
        }
    };
    const onFormValuesChange = () => calculateCost();

    // ... (Các hàm Upload, Create, Update, Delete, Print, Receive... giữ nguyên như file trước) ...
    const handleUpload = async ({ file, onSuccess, onError }) => { const formData = new FormData(); formData.append('file', file); try { const res = await productionApi.uploadImage(formData); file.url = res.data.url; onSuccess("ok"); } catch (err) { onError("Upload failed"); } };
    const handleFileChange = ({ fileList: newFileList }) => { setFileList(newFileList); };
    const handleCreateQuickOrder = async (values) => { setLoading(true); try { const sizeBreakdown = values.size_breakdown || []; if (sizeBreakdown.length === 0) { message.warning("Nhập ít nhất 1 size!"); setLoading(false); return; } const imageUrls = fileList.filter(f => f.status === 'done' && f.originFileObj.url).map(f => f.originFileObj.url); const payload = { new_product_name: values.new_product_name, new_product_sku: values.new_product_sku, order_code: values.code, warehouse_id: values.warehouse_id, start_date: values.start_date.format('YYYY-MM-DD'), due_date: values.due_date.format('YYYY-MM-DD'), materials: values.materials.map(m => ({...m, quantity_needed: Number(m.quantity_needed)})), size_breakdown: sizeBreakdown.map(s => ({...s, quantity: Number(s.quantity)})), image_urls: imageUrls, auto_start: values.auto_start, shipping_fee: Number(values.shipping_fee || 0), other_fee: Number(values.other_fee || 0), labor_fee: Number(values.labor_fee || 0), marketing_fee: Number(values.marketing_fee || 0), packaging_fee: Number(values.packaging_fee || 0), print_fee: Number(values.print_fee || 0) }; await productionApi.createQuickOrder(payload); message.success("Thành công!"); setIsOrderModalOpen(false); orderForm.resetFields(); setFileList([]); setEstimatedCost(0); fetchData(1, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + (error.response?.data?.detail || "Lỗi tạo")); } setLoading(false); };
    const handleSearch = () => { fetchData(1, pagination.pageSize, searchText, filterWarehouse); };
    const handleFilterWarehouse = (val) => { setFilterWarehouse(val); fetchData(1, pagination.pageSize, searchText, val); };
    const handleTableChange = (newPagination) => { fetchData(newPagination.current, newPagination.pageSize, searchText, filterWarehouse); };
    const openEditModal = (record) => { setCurrentOrder(record); productionApi.getPrintData(record.id).then(res => { const data = res.data; editForm.setFieldsValue({ code: data.code, new_sku: data.sku, start_date: dayjs(data.start_date), due_date: dayjs(data.due_date), shipping_fee: data.shipping_fee, other_fee: data.other_fee, labor_fee: data.labor_fee || 0, marketing_fee: data.marketing_fee || 0, packaging_fee: data.packaging_fee || 0, print_fee: data.print_fee || 0 }); setIsEditModalOpen(true); }).catch(err => message.error("Lỗi tải")); };
    const handleUpdateOrder = async (values) => { try { const payload = { start_date: values.start_date.format('YYYY-MM-DD'), due_date: values.due_date.format('YYYY-MM-DD'), shipping_fee: Number(values.shipping_fee || 0), other_fee: Number(values.other_fee || 0), labor_fee: Number(values.labor_fee || 0), marketing_fee: Number(values.marketing_fee || 0), packaging_fee: Number(values.packaging_fee || 0), print_fee: Number(values.print_fee || 0), new_sku: values.new_sku }; await productionApi.updateOrder(currentOrder.id, payload); message.success("Cập nhật thành công!"); setIsEditModalOpen(false); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi cập nhật"); } };
    const handleDeleteOrder = async (id) => { if(window.confirm("CẢNH BÁO: Xóa đơn hàng sẽ HOÀN TRẢ nguyên liệu!")) { try { if (productionApi.deleteOrder) { await productionApi.deleteOrder(id); message.success("Đã xóa!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } else { message.error("Chưa cấu hình API xóa!"); } } catch (error) { message.error("Lỗi xóa: " + error.response?.data?.detail); } } }
    const handleStart = async (id) => { try { await productionApi.startOrder(id); message.success("Bắt đầu SX!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleForceFinish = async (id) => { if(window.confirm("Kết thúc đơn?")) { try { await productionApi.forceFinish(id); message.success("Đã chốt!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } } };
    const openReceiveModal = async (order) => { setCurrentOrder(order); try { const res = await productionApi.getOrderDetails(order.id); const data = res.data.map(item => ({...item, receiving: 0})); setOrderSizes(data); setIsReceiveModalOpen(true); } catch (error) { message.error("Lỗi tải chi tiết"); } };
    const handleReceiveGoods = async () => { try { const itemsToReceive = orderSizes.filter(s => s.receiving > 0).map(s => ({ id: s.id, size: s.size, quantity: Number(s.receiving) })); if (itemsToReceive.length === 0) return message.warning("Chưa nhập số lượng!"); await productionApi.receiveGoods(currentOrder.id, { items: itemsToReceive }); message.success("Đã nhập kho!"); setIsReceiveModalOpen(false); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleViewHistory = async (id) => { try { const res = await productionApi.getReceiveHistory(id); setHistoryData(res.data); setIsHistoryModalOpen(true); } catch (error) { message.error("Lỗi tải lịch sử"); } };
    const handlePrintOrder = async (id) => { try { const res = await productionApi.getPrintData(id); setPrintData(res.data); setIsPrintModalOpen(true); } catch (error) { message.error("Lỗi tải dữ liệu in"); } };
    const printContent = () => { const printWindow = window.open('', '', 'width=800,height=600'); printWindow.document.write('<html><head><title>In Lệnh Sản Xuất</title>'); printWindow.document.write('<style>body { font-family: "Times New Roman"; padding: 20px; } .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; } th, td { border: 1px solid #000; padding: 8px; text-align: center; } .money-table td { text-align: right; } .footer { margin-top: 40px; display: flex; justify-content: space-between; } .images img { max-width: 150px; margin: 5px; border: 1px solid #ccc; }</style></head><body>'); printWindow.document.write(document.getElementById('printable-area').innerHTML); printWindow.document.write('</body></html>'); printWindow.document.close(); setTimeout(() => { printWindow.print(); }, 500); };

    const orderColumns = [
        { title: 'Mã Lệnh', dataIndex: 'code', key: 'code', render: t => <b>{t}</b> },
        { title: 'Xưởng May', dataIndex: 'warehouse_name', key: 'warehouse_name' },
        { title: 'Sản Phẩm', dataIndex: 'product_name', key: 'product_name', render: t => <span style={{color: '#1677ff', fontWeight: 500}}>{t}</span> },
        { title: 'Tiến độ', width: 180, render: (_, r) => { const percent = r.quantity_planned > 0 ? Math.round((r.quantity_finished / r.quantity_planned) * 100) : 0; return <div><Progress percent={percent} size="small" status={percent >= 100 ? 'success' : 'active'} /><div style={{fontSize: 12, textAlign: 'center'}}>{r.quantity_finished} / {r.quantity_planned} cái</div></div> } },
        { title: 'Trạng Thái', dataIndex: 'status', align: 'center', render: (s) => <Tag color={s==='draft'?'default':s==='in_progress'?'processing':'success'}>{s.toUpperCase()}</Tag> },
        { title: 'Hành động', key: 'action', align: 'center', width: 280, render: (_, record) => (<Space><Button icon={<PrinterOutlined />} size="small" onClick={() => handlePrintOrder(record.id)} title="In" /><Button icon={<HistoryOutlined />} size="small" onClick={() => handleViewHistory(record.id)} title="Lịch sử" /><Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} title="Sửa" /><Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDeleteOrder(record.id)} />{record.status === 'draft' && <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(record.id)}>Start</Button>}{record.status === 'in_progress' && (<><Button size="small" icon={<DownloadOutlined />} onClick={() => openReceiveModal(record)}>Nhập</Button><Button type="text" size="small" danger icon={<StopOutlined />} onClick={() => handleForceFinish(record.id)} /></>)}</Space>) }
    ];

    return (
        <div>
            <Card title="Quản Lý Sản Xuất" bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}
                extra={<Button type="primary" onClick={() => setIsOrderModalOpen(true)} size="large" icon={<PlusOutlined />}>Lên Kế Hoạch / Mẫu Mới</Button>}
            >
                <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Input.Search placeholder="Tìm theo Mã/Tên..." style={{ width: 300 }} value={searchText} onChange={e => setSearchText(e.target.value)} onSearch={handleSearch} enterButton allowClear />
                    <Select placeholder="Lọc theo Xưởng" style={{ width: 200 }} allowClear onChange={handleFilterWarehouse} value={filterWarehouse}>
                        {warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                    </Select>
                    <Tag color="blue">Tổng: {pagination.total} đơn</Tag>
                </div>
                <Table dataSource={orders} columns={orderColumns} rowKey="id" loading={loading} pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }} onChange={handleTableChange} />
            </Card>

            {/* MODAL 1: TẠO LỆNH (GIAO DIỆN NÂNG CẤP) */}
            <Modal title="Lên Mẫu Mới & Sản Xuất" open={isOrderModalOpen} onCancel={() => setIsOrderModalOpen(false)} footer={null} width={1400} style={{ top: 20 }}>
                <Form layout="vertical" form={orderForm} onFinish={handleCreateQuickOrder} onValuesChange={onFormValuesChange}>
                    <Row gutter={24}>
                        <Col span={6}>
                            <Card size="small" title="1. Thông tin Chung" bordered={false} style={{background: '#f9f9f9', marginBottom: 16}}>
                                <Form.Item label="Mã Lệnh" name="code" rules={[{ required: true }]}><Input placeholder="LSX-001" /></Form.Item>
                                
                                {/* --- SỬA Ở ĐÂY: THÊM onChange để gọi API lọc --- */}
                                <Form.Item label="Xưởng May" name="warehouse_id" rules={[{ required: true }]}>
                                    <Select placeholder="Chọn xưởng" onChange={handleWarehouseChange}>
                                        {warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                                    </Select>
                                </Form.Item>

                                <Form.Item label="Tên SP" name="new_product_name" rules={[{ required: true }]}><Input /></Form.Item>
                                <Form.Item label="Mã SKU" name="new_product_sku" rules={[{ required: true }]}><Input /></Form.Item>
                                <Row gutter={10}><Col span={12}><Form.Item label="Bắt đầu" name="start_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item label="Hạn xong" name="due_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col></Row>
                            </Card>
                            <Card size="small" title="Hình ảnh Mẫu" bordered={false} style={{background: '#fff7e6', border: '1px solid #ffd591'}}><Upload customRequest={handleUpload} listType="picture-card" fileList={fileList} onChange={handleFileChange}>{fileList.length >= 5 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}</Upload></Card>
                        </Col>
                        
                        <Col span={6}>
                            <Card size="small" title="2. Size & Ghi chú" bordered={false} style={{background: '#e6f7ff', border: '1px solid #91d5ff', height: '100%'}}>
                                <Form.List name="size_breakdown" initialValue={[{ size: '0-3m', quantity: 0 }]}>{(fields, { add, remove }) => (<div style={{ maxHeight: 600, overflowY: 'auto' }}>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'size']} rules={[{ required: true }]} style={{width: 90}}><Select>{sizeStandards.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}</Select></Form.Item><Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true }]}><Input type="number" placeholder="SL" min={1} style={{width: 70}} /></Form.Item><Form.Item {...restField} name={[name, 'note']}><Input placeholder="Ghi chú" style={{width: 120}} /></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{color:'red'}}/></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm Size</Button></div>)}</Form.List>
                            </Card>
                        </Col>

                        <Col span={12}>
                            <Card size="small" title="3. Tổng lượng NVL (Cả lô)" bordered={false} style={{background: '#f9f9f9', height: '100%'}}>
                                <Form.List name="materials">
                                    {(fields, { add, remove }) => (
                                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                            {fields.map(({ key, name, ...restField }) => (
                                                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                    
                                                    {/* --- DROPDOWN DÙNG warehouseMaterials (MỚI) --- */}
                                                    <Form.Item 
                                                        {...restField} 
                                                        name={[name, 'material_variant_id']} 
                                                        rules={[{ required: true }]} 
                                                        style={{ width: 450 }} 
                                                    >
                                                        <Select 
                                                            placeholder="Chọn NVL (Có tại xưởng này)" 
                                                            showSearch 
                                                            optionFilterProp="children" 
                                                            dropdownMatchSelectWidth={false}
                                                            size="large"
                                                            onChange={(val) => handleMaterialSelect(val, name)}
                                                        >
                                                            {/* RENDER LIST ĐÃ LỌC */}
                                                            {warehouseMaterials.map(p => (
                                                                <Select.Option key={p.id} value={p.id}>
                                                                    <div style={{display: 'flex', justifyContent: 'space-between', width: '500px'}}>
                                                                        <span>
                                                                            <b style={{color:'#1677ff'}}>[{p.sku}]</b> {p.variant_name} 
                                                                            {p.color && <Tag color="magenta" style={{marginLeft: 5}}>{p.color}</Tag>}
                                                                            {p.note && <span style={{color: '#888', fontSize: 12}}> ({p.note})</span>}
                                                                        </span>
                                                                        <span style={{color: p.quantity_on_hand > 0 ? 'green' : 'red', fontWeight: 'bold'}}>
                                                                            Tồn: {p.quantity_on_hand}
                                                                        </span>
                                                                    </div>
                                                                </Select.Option>
                                                            ))}
                                                        </Select>
                                                    </Form.Item>

                                                    <Form.Item {...restField} name={[name, 'quantity_needed']} rules={[{ required: true }]}>
                                                        <Input type="number" placeholder="Tổng" step={0.1} style={{width: 80}} />
                                                    </Form.Item>
                                                    <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                                </Space>
                                            ))}
                                            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm NVL</Button>
                                        </div>
                                    )}
                                </Form.List>
                                <Divider style={{margin: '12px 0'}} />
                                
                                <Row gutter={8}><Col span={8}><Form.Item label="Gia công" name="labor_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col><Col span={8}><Form.Item label="In/Thêu" name="print_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col><Col span={8}><Form.Item label="Vận chuyển" name="shipping_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col><Col span={8}><Form.Item label="Marketing" name="marketing_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col><Col span={8}><Form.Item label="Đóng gói" name="packaging_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col><Col span={8}><Form.Item label="Phụ phí" name="other_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col></Row>
                                
                                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    <Statistic title="Giá vốn ƯỚC TÍNH (1 SP)" value={estimatedCost} precision={0} valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} suffix="₫" />
                                </div>
                                <div style={{marginTop: 20}}><Form.Item name="auto_start" valuePropName="checked"><Checkbox>Xuất kho vải & Chạy ngay?</Checkbox></Form.Item></div>
                            </Card>
                        </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{marginTop: 16}}>Xác nhận</Button>
                </Form>
            </Modal>
            
            {/* Các Modal Sửa, Nhập hàng, In... giữ nguyên như cũ */}
            <Modal title="Cập nhật Thông tin & Chi phí" open={isEditModalOpen} onCancel={() => setIsEditModalOpen(false)} footer={null}><Form layout="vertical" form={editForm} onFinish={handleUpdateOrder}><Form.Item label="Mã Lệnh" name="code"><Input disabled /></Form.Item><Form.Item label="Mã SKU Sản phẩm (Cập nhật)" name="new_sku" rules={[{ required: true }]}><Input /></Form.Item><Row gutter={16}><Col span={12}><Form.Item label="Ngày bắt đầu" name="start_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col><Col span={12}><Form.Item label="Hạn xong" name="due_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col></Row><Divider>Chi phí</Divider><Row gutter={16}><Col span={12}><Form.Item label="Gia công" name="labor_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="In/Thêu" name="print_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Vận Chuyển" name="shipping_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Marketing" name="marketing_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Đóng Gói" name="packaging_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Phụ phí" name="other_fee"><Input type="number" suffix="₫" /></Form.Item></Col></Row><Button type="primary" htmlType="submit" block>Lưu Thay Đổi</Button></Form></Modal>
            <Modal title={`📦 Nhập Kho Thành Phẩm (Trả hàng) - ${currentOrder?.code}`} open={isReceiveModalOpen} onCancel={() => setIsReceiveModalOpen(false)} onOk={handleReceiveGoods}><Table dataSource={orderSizes} pagination={false} rowKey="id" size="small" bordered columns={[{ title: 'Size', dataIndex: 'size', align: 'center', width: 80 }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{color:'#888', fontSize: 12}}>{t}</span> }, { title: 'Kế hoạch', dataIndex: 'planned', align: 'center', width: 80 }, { title: 'Đã trả', dataIndex: 'finished', align: 'center', width: 80, render: t => <span style={{color: 'blue'}}>{t}</span> }, { title: 'Nhập Đợt Này', render: (_, r, idx) => <Input type="number" min={0} value={r.receiving} onChange={(val) => { const n = [...orderSizes]; n[idx].receiving = Number(val.target.value); setOrderSizes(n); }} /> }]} /></Modal>
            <Modal title="📜 Lịch Sử Nhập Hàng" open={isHistoryModalOpen} onCancel={() => setIsHistoryModalOpen(false)} footer={null}><Table dataSource={historyData} pagination={{ pageSize: 5 }} rowKey={(r, i) => i} size="small" columns={[{ title: 'Thời gian', dataIndex: 'date', width: 140 }, { title: 'Size', dataIndex: 'size', width: 80, align: 'center', render: t => <b>{t}</b> }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{fontSize: 12, color: '#888'}}>{t}</span> }, { title: 'Số lượng trả', dataIndex: 'quantity', align: 'center', render: q => <Tag color="green">+{q}</Tag> }]} /></Modal>
            <Modal open={isPrintModalOpen} onCancel={() => setIsPrintModalOpen(false)} footer={[<Button key="close" onClick={() => setIsPrintModalOpen(false)}>Đóng</Button>, <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printContent}>In Ngay</Button>]} width={800}>{printData && (<div id="printable-area" style={{ padding: 20, fontFamily: 'Times New Roman' }}><div className="header" style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 20 }}><h2 style={{margin: 0}}>LỆNH SẢN XUẤT</h2><i>Mã lệnh: <b>{printData.code}</b></i></div><div className="info" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}><div><p><b>Xưởng thực hiện:</b> {printData.warehouse}</p><p><b>Ngày bắt đầu:</b> {printData.start_date}</p></div><div><p><b>Sản phẩm:</b> {printData.product}</p><p><b>Hạn hoàn thành:</b> {printData.due_date}</p></div></div>{printData.images && printData.images.length > 0 && (<div style={{marginBottom: 20}}><h4>HÌNH ẢNH MẪU:</h4><div style={{display: 'flex', gap: 15, flexWrap: 'wrap'}}>{printData.images.map((url, idx) => (<img key={idx} src={`${BASE_URL}${url}`} alt="Mẫu" style={{maxHeight: 150, border: '1px solid #ddd', padding: 2}} />))}</div></div>)}<h4 style={{borderBottom: '1px solid #ccc'}}>1. CHI TIẾT SIZE & SỐ LƯỢNG</h4><table style={{width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #000'}}><thead><tr style={{backgroundColor: '#f0f0f0'}}><th style={{border: '1px solid #000', padding: 8}}>Size</th><th style={{border: '1px solid #000', padding: 8}}>Số lượng đặt</th><th style={{border: '1px solid #000', padding: 8}}>Ghi chú</th></tr></thead><tbody>{printData.sizes.map((s, idx) => (<tr key={idx}><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}><b>{s.size}</b></td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}>{s.qty}</td><td style={{border: '1px solid #000', padding: 8}}>{s.note}</td></tr>))}</tbody></table><h4 style={{borderBottom: '1px solid #ccc'}}>2. ĐỊNH MỨC NGUYÊN LIỆU & CHI PHÍ</h4><table style={{width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #000'}}><thead><tr style={{backgroundColor: '#f0f0f0'}}><th style={{border: '1px solid #000', padding: 8}}>Tên Vật Tư</th><th style={{border: '1px solid #000', padding: 8}}>Định mức/SP</th><th style={{border: '1px solid #000', padding: 8}}>Tổng cấp</th><th style={{border: '1px solid #000', padding: 8}}>Thành tiền (Dự kiến)</th></tr></thead><tbody>{printData.materials.map((m, idx) => (<tr key={idx}><td style={{border: '1px solid #000', padding: 8}}>{m.name} ({m.sku})</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}>{m.usage_per_unit}</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center', fontWeight: 'bold'}}>{m.total_needed}</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'right'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(m.total_cost)}</td></tr>))}</tbody></table><div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 20}}><table style={{width: '50%', borderCollapse: 'collapse', border: '1px solid #000'}} className="money-table"><tbody><tr><td style={{border: '1px solid #000', padding: 5}}><b>Tổng Tiền NVL:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.total_material_cost)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Gia Công:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.labor_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí In/Thêu:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.print_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Vận Chuyển:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.shipping_fee)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Marketing:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.marketing_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phí Đóng Gói:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.packaging_fee || 0)}</td></tr><tr><td style={{border: '1px solid #000', padding: 5}}><b>Phụ phí:</b></td><td style={{border: '1px solid #000', padding: 5}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.other_fee)}</td></tr><tr style={{backgroundColor: '#e6f7ff'}}><td style={{border: '1px solid #000', padding: 5}}><b>TỔNG CỘNG:</b></td><td style={{border: '1px solid #000', padding: 5, fontWeight: 'bold', color: '#d4380d'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(printData.total_material_cost + printData.shipping_fee + printData.other_fee + (printData.labor_fee||0) + (printData.marketing_fee||0) + (printData.packaging_fee||0) + (printData.print_fee||0))}</td></tr></tbody></table></div><div className="footer" style={{ marginTop: 50, display: 'flex', justifyContent: 'space-between' }}><div className="signature" style={{textAlign: 'center', width: '40%'}}><p><b>Người Lập Lệnh</b></p><br/><br/><br/></div><div className="signature" style={{textAlign: 'center', width: '40%'}}><p><b>Xưởng Xác Nhận</b></p><br/><br/><br/></div></div></div>)}</Modal>
        </div>
    );
};

export default ProductionPage;