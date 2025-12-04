import React, { useEffect, useState } from 'react';
import { 
    Table, Card, Button, Modal, Form, Select, Input, 
    InputNumber, DatePicker, Tag, message, Divider, Space, 
    Checkbox, Statistic, Row, Col, Progress, Typography, Upload 
} from 'antd';
import { 
    PlusOutlined, DeleteOutlined, PlayCircleOutlined, 
    DownloadOutlined, StopOutlined, PrinterOutlined, 
    CheckCircleOutlined, SearchOutlined, HistoryOutlined // <--- Đã thêm lại Icon History
} from '@ant-design/icons';
import productionApi from '../api/productionApi';
import productApi from '../api/productApi';
import warehouseApi from '../api/warehouseApi';

// Cấu hình URL backend
const BASE_URL = 'http://localhost:8000'; 

const ProductionPage = () => {
    // Data States
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]); 
    const [warehouses, setWarehouses] = useState([]);

    // Search States
    const [searchText, setSearchText] = useState('');
    const [filterWarehouse, setFilterWarehouse] = useState(null);

    // UI States
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false); 
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false); // <--- State Modal Lịch sử
    
    const [loading, setLoading] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState(0); 
    
    // States chi tiết
    const [currentOrder, setCurrentOrder] = useState(null);
    const [orderSizes, setOrderSizes] = useState([]); 
    const [printData, setPrintData] = useState(null);
    const [historyData, setHistoryData] = useState([]); // <--- Data Lịch sử
    const [fileList, setFileList] = useState([]);

    const [orderForm] = Form.useForm();
    const sizeStandards = ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m", "2-3y", "3-4y", "4-5y"];

    // 1. Load dữ liệu
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

    // --- LOGIC LỌC DỮ LIỆU ---
    const filteredOrders = orders.filter(item => {
        const matchText = 
            (item.code && item.code.toLowerCase().includes(searchText.toLowerCase())) ||
            (item.product_name && item.product_name.toLowerCase().includes(searchText.toLowerCase()));
        const matchWarehouse = filterWarehouse ? item.warehouse_name === filterWarehouse : true;
        return matchText && matchWarehouse;
    });

    // 2. Logic tính giá vốn
    const calculateCost = (currentMaterials) => {
        let tempTotal = 0;
        if (currentMaterials) {
            currentMaterials.forEach(item => {
               if(item && item.quantity_needed && item.material_variant_id) {
                   const mat = products.find(p => p.id === item.material_variant_id);
                   const price = mat ? (mat.cost_price || 0) : 0;
                   const finalPrice = price > 0 ? price : 50000; 
                   tempTotal += item.quantity_needed * finalPrice; 
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

    // Upload Ảnh
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

    const handleFileChange = ({ fileList: newFileList }) => {
        setFileList(newFileList);
    };

    // 3. Tạo Lệnh
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
                auto_start: values.auto_start
            };

            await productionApi.createQuickOrder(payload);
            message.success("Thành công! Đã tạo Lệnh SX.");
            setIsOrderModalOpen(false);
            orderForm.resetFields();
            setFileList([]); 
            setEstimatedCost(0);
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo lệnh"));
        }
        setLoading(false);
    };

    // 4. Các hành động
    const handleStart = async (id) => { try { await productionApi.startOrder(id); message.success("Đã trừ NVL & Bắt đầu SX!"); fetchData(); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleForceFinish = async (id) => { if(window.confirm("Kết thúc đơn hàng này?")) { try { await productionApi.forceFinish(id); message.success("Đã chốt đơn!"); fetchData(); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } } };
    
    // Mở Modal Nhập Hàng
    const openReceiveModal = async (order) => { setCurrentOrder(order); try { const res = await productionApi.getOrderDetails(order.id); const data = res.data.map(item => ({...item, receiving: 0})); setOrderSizes(data); setIsReceiveModalOpen(true); } catch (error) { message.error("Lỗi tải chi tiết size"); } };
    
    // Xử lý Nhập Hàng
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

    // --- XEM LỊCH SỬ (ĐÃ THÊM LẠI) ---
    const handleViewHistory = async (id) => {
        try {
            const res = await productionApi.getReceiveHistory(id);
            setHistoryData(res.data);
            setIsHistoryModalOpen(true);
        } catch (error) {
            message.error("Lỗi tải lịch sử");
        }
    };

    // In Lệnh
    const handlePrintOrder = async (id) => { try { const res = await productionApi.getPrintData(id); setPrintData(res.data); setIsPrintModalOpen(true); } catch (error) { message.error("Lỗi tải dữ liệu in"); } };

    const printContent = () => {
        const printWindow = window.open('', '', 'width=800,height=600');
        printWindow.document.write('<html><head><title>In Lệnh Sản Xuất</title>');
        printWindow.document.write('<style>body { font-family: "Times New Roman"; padding: 20px; } .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #000; } th, td { border: 1px solid #000; padding: 8px; text-align: center; } .footer { margin-top: 40px; display: flex; justify-content: space-between; } .images img { max-width: 150px; margin: 5px; border: 1px solid #ccc; }</style></head><body>');
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
            title: 'Tiến độ', width: 180,
            render: (_, r) => {
                const percent = r.quantity_planned > 0 ? Math.round((r.quantity_finished / r.quantity_planned) * 100) : 0;
                return <div><Progress percent={percent} size="small" status={percent >= 100 ? 'success' : 'active'} /><div style={{fontSize: 12, textAlign: 'center'}}>{r.quantity_finished} / {r.quantity_planned}</div></div>
            }
        },
        {
            title: 'Hành động', key: 'action', align: 'center', width: 200,
            render: (_, record) => (
                <Space>
                    <Button icon={<PrinterOutlined />} size="small" onClick={() => handlePrintOrder(record.id)} title="In" />
                    
                    {/* NÚT LỊCH SỬ (ĐÃ CÓ LẠI) */}
                    <Button icon={<HistoryOutlined />} size="small" onClick={() => handleViewHistory(record.id)} title="Lịch sử" />

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
                {/* BỘ LỌC */}
                <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Input placeholder="Tìm theo Mã/Tên..." prefix={<SearchOutlined />} style={{ width: 300 }} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
                    <Select placeholder="Lọc theo Xưởng" style={{ width: 200 }} allowClear onChange={val => setFilterWarehouse(val)}>
                        {warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                    </Select>
                    {searchText || filterWarehouse ? <Tag color="blue">Kết quả: {filteredOrders.length}</Tag> : null}
                </div>

                <Table dataSource={filteredOrders} columns={orderColumns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
            </Card>

            {/* MODAL 1: TẠO LỆNH */}
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
                                <Row gutter={10}><Col span={12}><Form.Item label="Bắt đầu" name="start_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item label="Hạn xong" name="due_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col></Row>
                            </Card>
                            <Card size="small" title="Hình ảnh Mẫu" bordered={false} style={{background: '#fff7e6', border: '1px solid #ffd591'}}><Upload customRequest={handleUpload} listType="picture-card" fileList={fileList} onChange={handleFileChange}>{fileList.length >= 5 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}</Upload></Card>
                        </Col>
                        <Col span={8}>
                            <Card size="small" title="2. Size & Ghi chú" bordered={false} style={{background: '#e6f7ff', border: '1px solid #91d5ff', height: '100%'}}>
                                <Form.List name="size_breakdown" initialValue={[{ size: '0-3m', quantity: 0 }]}>{(fields, { add, remove }) => (<div style={{ maxHeight: 400, overflowY: 'auto' }}>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'size']} rules={[{ required: true }]} style={{width: 80}}><Select>{sizeStandards.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}</Select></Form.Item><Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true }]}><InputNumber placeholder="SL" min={1} style={{width: 60}} /></Form.Item><Form.Item {...restField} name={[name, 'note']}><Input placeholder="Ghi chú" style={{width: 100}} /></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{color:'red'}}/></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm Size</Button></div>)}</Form.List>
                            </Card>
                        </Col>
                        <Col span={8}>
                            <Card size="small" title="3. Định mức NVL" bordered={false} style={{background: '#f9f9f9', height: '100%'}}>
                                <Form.List name="materials">{(fields, { add, remove }) => (<div style={{ maxHeight: 350, overflowY: 'auto' }}>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true }]} style={{ width: 160 }}><Select placeholder="Chọn NVL" showSearch optionFilterProp="children" size="small">{products.filter(p => p.sku && !p.sku.startsWith('AO') && !p.sku.startsWith('QUAN')).map(p => <Select.Option key={p.id} value={p.id}>{p.variant_name}</Select.Option>)}</Select></Form.Item><Form.Item {...restField} name={[name, 'quantity_needed']} rules={[{ required: true }]}><InputNumber placeholder="Định mức" step={0.1} style={{width: 70}} /></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} /></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm NVL</Button></div>)}</Form.List>
                                <Divider style={{margin: '12px 0'}} /><div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #d9d9d9', textAlign: 'center' }}><Statistic title="Giá vốn NVL dự kiến" value={estimatedCost} precision={0} valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} suffix="₫" /></div><div style={{marginTop: 20}}><Form.Item name="auto_start" valuePropName="checked"><Checkbox>Xuất kho vải & Chạy ngay?</Checkbox></Form.Item></div>
                            </Card>
                        </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{marginTop: 16}}>Xác nhận</Button>
                </Form>
            </Modal>

            {/* MODAL 2: NHẬP HÀNG */}
            <Modal title={`📦 Nhập Kho Thành Phẩm (Trả hàng) - ${currentOrder?.code}`} open={isReceiveModalOpen} onCancel={() => setIsReceiveModalOpen(false)} onOk={handleReceiveGoods}><Table dataSource={orderSizes} pagination={false} rowKey="id" size="small" bordered columns={[{ title: 'Size', dataIndex: 'size', align: 'center', width: 80 }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{color:'#888', fontSize: 12}}>{t}</span> }, { title: 'Kế hoạch', dataIndex: 'planned', align: 'center', width: 80 }, { title: 'Đã trả', dataIndex: 'finished', align: 'center', width: 80, render: t => <span style={{color: 'blue'}}>{t}</span> }, { title: 'Nhập Đợt Này', render: (_, r, idx) => <InputNumber min={0} value={r.receiving} onChange={(val) => { const n = [...orderSizes]; n[idx].receiving = val; setOrderSizes(n); }} /> }]} /></Modal>

            {/* MODAL 3: IN LỆNH */}
            <Modal open={isPrintModalOpen} onCancel={() => setIsPrintModalOpen(false)} footer={[<Button key="close" onClick={() => setIsPrintModalOpen(false)}>Đóng</Button>, <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printContent}>In Ngay</Button>]} width={800}>{printData && (<div id="printable-area" style={{ padding: 20, fontFamily: 'Times New Roman' }}><div className="header" style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 20 }}><h2 style={{margin: 0}}>LỆNH SẢN XUẤT</h2><i>Mã lệnh: <b>{printData.code}</b></i></div><div className="info" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}><div><p><b>Xưởng thực hiện:</b> {printData.warehouse}</p><p><b>Ngày bắt đầu:</b> {printData.start_date}</p></div><div><p><b>Sản phẩm:</b> {printData.product}</p><p><b>Hạn hoàn thành:</b> {printData.due_date}</p></div></div>{printData.images && printData.images.length > 0 && (<div style={{marginBottom: 20}}><h4>HÌNH ẢNH MẪU:</h4><div style={{display: 'flex', gap: 15, flexWrap: 'wrap'}}>{printData.images.map((url, idx) => (<img key={idx} src={`${BASE_URL}${url}`} alt="Mẫu" style={{maxHeight: 150, border: '1px solid #ddd', padding: 2}} />))}</div></div>)}<h4 style={{borderBottom: '1px solid #ccc'}}>1. CHI TIẾT SIZE & SỐ LƯỢNG</h4><table style={{width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #000'}}><thead><tr style={{backgroundColor: '#f0f0f0'}}><th style={{border: '1px solid #000', padding: 8}}>Size</th><th style={{border: '1px solid #000', padding: 8}}>Số lượng đặt</th><th style={{border: '1px solid #000', padding: 8}}>Ghi chú</th></tr></thead><tbody>{printData.sizes.map((s, idx) => (<tr key={idx}><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}><b>{s.size}</b></td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}>{s.qty}</td><td style={{border: '1px solid #000', padding: 8}}>{s.note}</td></tr>))}</tbody></table><h4 style={{borderBottom: '1px solid #ccc'}}>2. NGUYÊN PHỤ LIỆU CẤP ĐI</h4><table style={{width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #000'}}><thead><tr style={{backgroundColor: '#f0f0f0'}}><th style={{border: '1px solid #000', padding: 8}}>Tên Vật Tư</th><th style={{border: '1px solid #000', padding: 8}}>Định mức/SP</th><th style={{border: '1px solid #000', padding: 8}}>Tổng cấp</th></tr></thead><tbody>{printData.materials.map((m, idx) => (<tr key={idx}><td style={{border: '1px solid #000', padding: 8}}>{m.name} ({m.sku})</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center'}}>{m.usage_per_unit}</td><td style={{border: '1px solid #000', padding: 8, textAlign: 'center', fontWeight: 'bold'}}>{m.total_needed}</td></tr>))}</tbody></table><div className="footer" style={{ marginTop: 50, display: 'flex', justifyContent: 'space-between' }}><div className="signature" style={{textAlign: 'center', width: '40%'}}><p><b>Người Lập Lệnh</b></p><br/><br/><br/></div><div className="signature" style={{textAlign: 'center', width: '40%'}}><p><b>Xưởng Xác Nhận</b></p><br/><br/><br/></div></div></div>)}</Modal>

            {/* --- MODAL 4: LỊCH SỬ TRẢ HÀNG (ĐÃ THÊM LẠI) --- */}
            <Modal title="📜 Lịch Sử Nhập Hàng" open={isHistoryModalOpen} onCancel={() => setIsHistoryModalOpen(false)} footer={null}>
                <Table dataSource={historyData} pagination={{ pageSize: 5 }} rowKey={(r, i) => i} size="small" columns={[{ title: 'Thời gian', dataIndex: 'date', width: 140 }, { title: 'Size', dataIndex: 'size', width: 80, align: 'center', render: t => <b>{t}</b> }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{fontSize: 12, color: '#888'}}>{t}</span> }, { title: 'Số lượng trả', dataIndex: 'quantity', align: 'center', render: q => <Tag color="green">+{q}</Tag> }]} />
            </Modal>
        </div>
    );
};

export default ProductionPage;