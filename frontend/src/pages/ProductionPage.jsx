import React, { useEffect, useState } from 'react';
import { 
    Table, Card, Button, Modal, Form, Select, Input, 
    InputNumber, DatePicker, Tag, message, Divider, Space, 
    Checkbox, Statistic, Row, Col, Progress, Typography, Upload, Empty, Spin, List
} from 'antd';
import { 
    PlusOutlined, DeleteOutlined, PlayCircleOutlined, 
    DownloadOutlined, StopOutlined, PrinterOutlined, 
    CheckCircleOutlined, SearchOutlined, HistoryOutlined, 
    EditOutlined, SaveOutlined, CalendarOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import productionApi from '../api/productionApi';
import productApi from '../api/productApi';
import warehouseApi from '../api/warehouseApi';

const BASE_URL = window.location.origin; 

const ProductionPage = () => {
    // 1. Data States
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]); 
    const [warehouses, setWarehouses] = useState([]);
    const [warehouseMaterials, setWarehouseMaterials] = useState([]);

    // 2. Pagination & Search
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
    const [searchText, setSearchText] = useState('');
    const [filterWarehouse, setFilterWarehouse] = useState(null);

    // 3. UI States
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false); 
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    // todolist model
    const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
    const [currentTodos, setCurrentTodos] = useState([]); // List các bước của đơn đang chọn
    
    const [loading, setLoading] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState(0); 
    
    // 4. Detail States
    const [currentOrder, setCurrentOrder] = useState(null);
    const [orderSizes, setOrderSizes] = useState([]); 
    const [printData, setPrintData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [fileList, setFileList] = useState([]);

    const [orderForm] = Form.useForm();
    const [editForm] = Form.useForm();

    const sizeStandards = ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m", "2-3y", "3-4y", "4-5y"];

    // --- HÀM LOAD DỮ LIỆU ---
    const fetchData = async (page = 1, pageSize = 10, search = null, warehouse = null) => {
        setLoading(true);
        try {
            const [prodRes, wareRes] = await Promise.all([
                productApi.getAll(),
                warehouseApi.getAllWarehouses()
            ]);
            setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
            setWarehouses(Array.isArray(wareRes.data) ? wareRes.data : []);

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
            } else if (Array.isArray(res.data)) {
                setOrders(res.data); // Fallback
                setPagination({ current: 1, pageSize: 10, total: res.data.length });
            } else {
                setOrders([]);
            }
        } catch (error) {
            console.error("Lỗi fetch data:", error);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData(1, 10);
    }, []);

    // --- LOGIC KHO & NVL ---
    const handleWarehouseChange = async (warehouseId) => {
        if (!warehouseId) {
            setWarehouseMaterials([]);
            return;
        }
        orderForm.setFieldsValue({ materials: [] });
        setEstimatedCost(0);
        try {
            const res = await productApi.getByWarehouse(warehouseId);
            setWarehouseMaterials(res.data || []);
            message.success(`Đã cập nhật danh sách NVL tại kho!`);
        } catch (error) {
            message.error("Lỗi tải NVL của kho này");
        }
    };

    const handleMaterialSelect = (value, fieldName) => {
        // Tìm trong danh sách NVL của Xưởng (warehouseMaterials)
        const selectedMaterial = warehouseMaterials.find(p => p.id === value);
        
        if (selectedMaterial) {
            const stock = selectedMaterial.quantity_on_hand || 0;
            
            const currentMaterials = orderForm.getFieldValue('materials');
            currentMaterials[fieldName].quantity_needed = stock; 
            orderForm.setFieldsValue({ materials: currentMaterials });
            message.info(`Đã tự điền tồn kho: ${stock} ${selectedMaterial.unit || ''}`);
            calculateCost();
        }
    };

    // --- TÍNH GIÁ VỐN ---
    const calculateCost = () => {
        const values = orderForm.getFieldsValue();
        const materials = values.materials || [];
        const sizeBreakdown = values.size_breakdown || [];

        let totalMatCost = 0;
        if (Array.isArray(materials)) {
            materials.forEach(item => {
                if(item && item.quantity_needed && item.material_variant_id) {
                    const mat = warehouseMaterials.find(p => p.id === item.material_variant_id) || products.find(p => p.id === item.material_variant_id);
                    const price = mat ? (mat.cost_price || 0) : 0;
                    totalMatCost += Number(item.quantity_needed) * price; 
                }
            });
        }

        const totalFees = Number(values.shipping_fee || 0) + Number(values.labor_fee || 0) + Number(values.marketing_fee || 0) + Number(values.packaging_fee || 0) + Number(values.print_fee || 0) + Number(values.other_fee || 0);
        const totalQty = Array.isArray(sizeBreakdown) ? sizeBreakdown.reduce((sum, i) => sum + Number(i.quantity || 0), 0) : 0;

        if (totalQty > 0) {
            setEstimatedCost((totalMatCost + totalFees) / totalQty);
        } else {
            setEstimatedCost(0);
        }
    };
    const onFormValuesChange = () => calculateCost();

    // --- CÁC HÀM XỬ LÝ ---
    const handleSearch = () => { fetchData(1, pagination.pageSize, searchText, filterWarehouse); };
    const handleFilterWarehouse = (val) => { setFilterWarehouse(val); fetchData(1, pagination.pageSize, searchText, val); };
    const handleTableChange = (newPagination) => { fetchData(newPagination.current, newPagination.pageSize, searchText, filterWarehouse); };

    const handleUpload = async ({ file, onSuccess, onError }) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await productionApi.uploadImage(formData);
            file.url = res.data.url; 
            onSuccess("ok");
        } catch (err) { onError("Upload failed"); }
    };
    const handleFileChange = ({ fileList: newFileList }) => { setFileList(newFileList); };

    const handleCreateQuickOrder = async (values) => {
        setLoading(true);
        try {
            const sizeBreakdown = values.size_breakdown || [];
            if (sizeBreakdown.length === 0) { message.warning("Nhập ít nhất 1 size!"); setLoading(false); return; }
            const imageUrls = fileList.filter(f => f.status === 'done' && f.originFileObj.url).map(f => f.originFileObj.url);

            const payload = {
                new_product_name: values.new_product_name,
                new_product_sku: values.new_product_sku,
                order_code: values.code,
                warehouse_id: values.warehouse_id,
                start_date: values.start_date.format('YYYY-MM-DD'),
                due_date: values.due_date.format('YYYY-MM-DD'),
                materials: (values.materials || []).map(m => ({...m, quantity_needed: Number(m.quantity_needed)})),
                size_breakdown: sizeBreakdown.map(s => ({...s, quantity: Number(s.quantity)})),
                image_urls: imageUrls, 
                auto_start: values.auto_start,
                shipping_fee: Number(values.shipping_fee || 0),
                other_fee: Number(values.other_fee || 0),
                labor_fee: Number(values.labor_fee || 0),
                marketing_fee: Number(values.marketing_fee || 0),
                packaging_fee: Number(values.packaging_fee || 0),
                print_fee: Number(values.print_fee || 0)
            };

            await productionApi.createQuickOrder(payload);
            message.success("Thành công!");
            setIsOrderModalOpen(false);
            orderForm.resetFields();
            setFileList([]); setEstimatedCost(0);
            fetchData(1, pagination.pageSize, searchText, filterWarehouse);
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Lỗi tạo lệnh"));
        }
        setLoading(false);
    };

    const openEditModal = (record) => { setCurrentOrder(record); productionApi.getPrintData(record.id).then(res => { const data = res.data; editForm.setFieldsValue({ code: data.code, new_sku: data.sku, start_date: dayjs(data.start_date), due_date: dayjs(data.due_date), shipping_fee: data.shipping_fee, other_fee: data.other_fee, labor_fee: data.labor_fee || 0, marketing_fee: data.marketing_fee || 0, packaging_fee: data.packaging_fee || 0, print_fee: data.print_fee || 0 }); setIsEditModalOpen(true); }).catch(err => message.error("Lỗi tải thông tin")); };
    const handleUpdateOrder = async (values) => { try { const payload = { start_date: values.start_date.format('YYYY-MM-DD'), due_date: values.due_date.format('YYYY-MM-DD'), shipping_fee: Number(values.shipping_fee || 0), other_fee: Number(values.other_fee || 0), labor_fee: Number(values.labor_fee || 0), marketing_fee: Number(values.marketing_fee || 0), packaging_fee: Number(values.packaging_fee || 0), print_fee: Number(values.print_fee || 0), new_sku: values.new_sku }; await productionApi.updateOrder(currentOrder.id, payload); message.success("Cập nhật thành công!"); setIsEditModalOpen(false); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi cập nhật"); } };
    const handleDeleteOrder = async (id) => { if(window.confirm("CẢNH BÁO: Xóa đơn hàng sẽ HOÀN TRẢ nguyên liệu!")) { try { if (productionApi.deleteOrder) { await productionApi.deleteOrder(id); message.success("Đã xóa!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } else { message.error("Chưa cấu hình API xóa!"); } } catch (error) { message.error("Lỗi xóa: " + error.response?.data?.detail); } } }
    const handleStart = async (id) => { try { await productionApi.startOrder(id); message.success("Bắt đầu SX!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleForceFinish = async (id) => { if(window.confirm("Kết thúc đơn?")) { try { await productionApi.forceFinish(id); message.success("Đã chốt!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } } };
    const openReceiveModal = async (order) => { setCurrentOrder(order); try { const res = await productionApi.getOrderDetails(order.id); const data = res.data.map(item => ({...item, receiving: 0})); setOrderSizes(data); setIsReceiveModalOpen(true); } catch (error) { message.error("Lỗi tải chi tiết"); } };
    const handleReceiveGoods = async () => { try { const itemsToReceive = orderSizes.filter(s => s.receiving > 0).map(s => ({ id: s.id, size: s.size, quantity: Number(s.receiving) })); if (itemsToReceive.length === 0) return message.warning("Chưa nhập số lượng trả hàng!"); await productionApi.receiveGoods(currentOrder.id, { items: itemsToReceive }); message.success("Đã nhập kho!"); setIsReceiveModalOpen(false); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleViewHistory = async (id) => { try { const res = await productionApi.getReceiveHistory(id); setHistoryData(res.data); setIsHistoryModalOpen(true); } catch (error) { message.error("Lỗi tải lịch sử"); } };
    const handlePrintOrder = async (id) => { try { const res = await productionApi.getPrintData(id); setPrintData(res.data); setIsPrintModalOpen(true); } catch (error) { message.error("Lỗi tải dữ liệu in"); } };


    const openTodoModal = (record) => {
        setCurrentOrder(record);
        // Lấy progress từ record (Backend trả về)
        // Nếu chưa có (đơn cũ), tạo mặc định
        const steps = record.progress || [
            { name: "Bước 1: Chuẩn bị NVL", done: false },
            { name: "Bước 2: Cắt bán thành phẩm", done: false },
            { name: "Bước 3: May gia công", done: false },
            { name: "Bước 4: KCS & Đóng gói", done: false }
        ];
        setCurrentTodos(steps);
        setIsTodoModalOpen(true);
    };

    const handleToggleStep = (index) => {
        const newTodos = [...currentTodos];
        newTodos[index].done = !newTodos[index].done;
        setCurrentTodos(newTodos);
    };

    const handleSaveProgress = async () => {
        try {
            await productionApi.updateProgress(currentOrder.id, { steps: currentTodos });
            message.success("Đã cập nhật tiến độ!");
            setIsTodoModalOpen(false);
            fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse); // Reload để cập nhật màu nút
        } catch (error) {
            message.error("Lỗi lưu tiến độ");
        }
    };


    const handleOpenCreateModal = () => {
        orderForm.resetFields(); // 1. Xóa sạch dữ liệu trong Form
        setFileList([]);         // 2. Xóa danh sách ảnh cũ
        setEstimatedCost(0);     // 3. Reset giá vốn ước tính về 0
        
        // 4. Reset danh sách NVL về rỗng (nếu cần thiết)
        // Mặc định resetFields sẽ đưa về initialValue, nhưng an toàn thì set lại state nếu có
        
        setIsOrderModalOpen(true); // 5. Mở Modal
    };



    // --- HÀM IN ---
    const printContent = () => {
        if (!printData) return;
        const printWindow = window.open('', '', 'width=900,height=800');
        printWindow.document.write('<html><head><title>PO - ' + (printData.code || '') + '</title>');
        printWindow.document.write(`
            <style>
                body { font-family: 'Arial', sans-serif; padding: 20px; font-size: 14px; }
                .container { max-width: 800px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                h2 { margin: 0; text-transform: uppercase; }
                .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .info-col { width: 48%; }
                .info-row { margin-bottom: 5px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; border: 1px solid #000; }
                th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
                th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .images-container { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 20px; }
                .product-img { max-height: 250px; border: 1px solid #ccc; padding: 4px; object-fit: contain; }
                .page-break { page-break-before: always; border-top: 2px dashed #999; margin-top: 40px; padding-top: 40px; }
                .warning-text { color: red; font-weight: bold; text-align: center; margin-bottom: 10px; font-size: 16px; border: 2px solid red; padding: 5px; }
                .footer { margin-top: 50px; display: flex; justify-content: space-between; }
                .signature { text-align: center; width: 40%; }
            </style>
        `);
        printWindow.document.write('</head><body><div class="container">');

        // PHẦN 1
        printWindow.document.write(`
            <div class="header">
                <h2>LỆNH SẢN XUẤT (PO)</h2>
                <p>Mã lệnh: <b>${printData.code}</b></p>
            </div>
            
            <div class="info-grid">
                <div class="info-col">
                    <div class="info-row"><b>Xưởng may:</b> ${printData.warehouse}</div>
                    <div class="info-row"><b>Địa chỉ:</b> ${printData.address || '---'}</div>
                    <div class="info-row"><b>Ngày bắt đầu:</b> ${printData.start_date}</div>
                    <div class="info-row"><b>Hạn giao hàng:</b> ${printData.due_date}</div>
                </div>
                <div class="info-col">
                    <div class="info-row"><b>Sản phẩm:</b> ${printData.product}</div>
                    <div class="info-row"><b>Mã SKU:</b> ${printData.sku}</div>
                    <div class="info-row"><b>Tổng số lượng:</b> ${printData.total_qty} cái</div>
                </div>
            </div>

            ${printData.images && printData.images.length > 0 ? `
                <div class="images-container">
                    ${printData.images.map(url => `
                        <img src="${BASE_URL}${url}" class="product-img" />
                    `).join('')}
                </div>
            ` : ''}

            <h3>1. CHI TIẾT SIZE & SỐ LƯỢNG</h3>
            <table>
                <thead><tr><th width="30%">Size</th><th width="30%">Số lượng</th><th>Ghi chú kỹ thuật</th></tr></thead>
                <tbody>
                    ${(printData.sizes || []).map(s => `
                        <tr>
                            <td class="text-center"><b>${s.size}</b></td>
                            <td class="text-center"><b>${s.qty}</b></td>
                            <td>${s.note || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3>2. NGUYÊN PHỤ LIỆU CẤP ĐI</h3>
            <table>
                <thead><tr><th>Tên Vật Tư</th><th width="30%">Tổng cấp</th><th width="30%">Ghi chú</th></tr></thead>
                <tbody>
                    ${(printData.materials || []).map(m => `
                        <tr>
                            <td>${m.name} <small>(${m.sku})</small></td>
                            <td class="text-center"><b>${m.total_needed}</b></td>
                            <td>${m.note || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                <div class="signature"><p><b>Người Lập Lệnh</b></p><br/><br/><br/></div>
                <div class="signature"><p><b>Xưởng Xác Nhận</b></p><br/><br/><br/></div>
            </div>
        `);

        // NGẮT TRANG
        printWindow.document.write('<div class="page-break"></div>');

        // PHẦN 2
        const totalCost = (printData.total_material_cost || 0) + (printData.shipping_fee || 0) + (printData.other_fee || 0) + (printData.labor_fee || 0) + (printData.marketing_fee || 0) + (printData.packaging_fee || 0) + (printData.print_fee || 0);
        const unitCost = printData.total_qty > 0 ? (totalCost / printData.total_qty) : 0;

        printWindow.document.write(`
            <div class="warning-text">PHẦN DÀNH RIÊNG CHO QUẢN LÝ</div>
            <div class="header">
                <h2>BẢNG KÊ CHI PHÍ & GIÁ VỐN</h2>
                <p>Mã lệnh: <b>${printData.code}</b></p>
            </div>

            <h3>1. CHI PHÍ NGUYÊN VẬT LIỆU</h3>
            <table>
                <thead><tr><th>Tên Vật Tư</th><th>Số lượng</th><th>Đơn giá vốn</th><th>Thành tiền</th></tr></thead>
                <tbody>
                    ${(printData.materials || []).map(m => `
                        <tr>
                            <td>${m.name}</td>
                            <td class="text-center">${m.total_needed}</td>
                            <td class="text-right">${safeMoney(m.total_cost / (m.total_needed || 1))}</td>
                            <td class="text-right">${safeMoney(m.total_cost)}</td>
                        </tr>
                    `).join('')}
                    <tr>
                        <td colspan="3" class="text-right"><b>TỔNG TIỀN NVL:</b></td>
                        <td class="text-right"><b>${safeMoney(printData.total_material_cost)}</b></td>
                    </tr>
                </tbody>
            </table>

            <h3>2. CÁC CHI PHÍ KHÁC</h3>
            <table style="width: 60%; margin-left: auto;">
                <tr><td>Phí Nhân Công:</td><td class="text-right">${safeMoney(printData.labor_fee)}</td></tr>
                <tr><td>Phí In / Thêu:</td><td class="text-right">${safeMoney(printData.print_fee)}</td></tr>
                <tr><td>Phí Vận Chuyển:</td><td class="text-right">${safeMoney(printData.shipping_fee)}</td></tr>
                <tr><td>Phí Marketing:</td><td class="text-right">${safeMoney(printData.marketing_fee)}</td></tr>
                <tr><td>Phí Đóng Gói:</td><td class="text-right">${safeMoney(printData.packaging_fee)}</td></tr>
                <tr><td>Phụ phí khác:</td><td class="text-right">${safeMoney(printData.other_fee)}</td></tr>
                <tr style="background-color: #eee;">
                    <td><b>TỔNG CHI PHÍ:</b></td>
                    <td class="text-right"><b style="color: red; font-size: 16px;">${safeMoney(totalCost)}</b></td>
                </tr>
            </table>

            <div style="text-align: right; margin-top: 20px; font-size: 18px; padding: 15px; border: 2px solid blue;">
                GIÁ VỐN / 1 SẢN PHẨM: <b style="color: blue;">${safeMoney(unitCost)}</b>
            </div>
        `);

        printWindow.document.write('</div></body></html>');
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 1000);
    };

    const orderColumns = [
        { title: 'Mã Lệnh', dataIndex: 'code', key: 'code', render: t => <b>{t}</b> },
        { title: 'Xưởng May', dataIndex: 'warehouse_name' },
        { title: 'Sản Phẩm', dataIndex: 'product_name', render: t => <span style={{color: '#1677ff'}}>{t}</span> },
        { 
            title: 'Đã trả', 
            align: 'center',
            width: 120,
            render: (_, r) => (
                <div style={{ fontSize: 15 }}>
                    {/* Số lượng đã xong: Màu xanh nếu xong hết, màu cam nếu đang làm */}
                    <b style={{ color: r.quantity_finished >= r.quantity_planned ? '#52c41a' : '#fa8c16' }}>
                        {r.quantity_finished}
                    </b>
                    <span style={{ color: '#999', margin: '0 4px' }}>/</span>
                    {/* Số lượng kế hoạch */}
                    <b>{r.quantity_planned}</b>
                </div>
            )
        },
        
        // --- CỘT TRẠNG THÁI (TODO LIST) ---
        { 
            title: 'Quy trình / Tiến độ', 
            align: 'center',
            width: 250,
            render: (_, r) => {
                const steps = r.progress || [];
                const doneCount = steps.filter(s => s.done).length;
                const totalCount = steps.length || 4; // Mặc định 4 bước
                
                // Màu sắc dựa trên tiến độ
                let color = 'default';
                if (doneCount > 0) color = 'processing';
                if (doneCount === totalCount) color = 'success';
                if (r.status === 'completed') color = 'green';

                return (
                    <div style={{cursor: 'pointer'}} onClick={() => openTodoModal(r)}>
                        <Tag color={color} style={{fontSize: 13, padding: '4px 10px'}}>
                            {r.status === 'completed' ? 'HOÀN THÀNH' : `Bước ${doneCount}/${totalCount}`}
                        </Tag>
                        <Progress percent={Math.round((doneCount/totalCount)*100)} size="small" showInfo={false} strokeColor={color === 'success' ? '#52c41a' : '#1890ff'} />
                    </div>
                );
            }
        },
        // ----------------------------------

        {
            title: 'Hành động', key: 'action', align: 'center', width: 220,
            render: (_, record) => (
                <Space>
                    <Button icon={<PrinterOutlined />} size="small" onClick={() => handlePrintOrder(record.id)} />
                    <Button icon={<HistoryOutlined />} size="small" onClick={() => handleViewHistory(record.id)} />
                    <Button icon={<EditOutlined />} size="small" onClick={() => openEditModal(record)} />
                    <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDeleteOrder(record.id)} />
                    
                    {/* Logic nút bấm */}
                    {record.status === 'draft' && (
                        <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => handleStart(record.id)}>Start</Button>
                    )}
                    {record.status === 'in_progress' && (
                        <>
                            <Button size="small" icon={<DownloadOutlined />} onClick={() => openReceiveModal(record)}>Nhập</Button>
                            {/* Nút Chốt đơn sẽ gọi API forceFinish, Backend sẽ check đủ bước chưa */}
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
                extra={<Button type="primary" onClick={handleOpenCreateModal} size="large" icon={<PlusOutlined />}>Lên Kế Hoạch / Mẫu Mới</Button>}
            >
                <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Input.Search placeholder="Tìm theo Mã/Tên..." style={{ width: 300 }} value={searchText} onChange={e => setSearchText(e.target.value)} onSearch={handleSearch} enterButton allowClear />
                    <Select placeholder="Lọc theo Xưởng" style={{ width: 200 }} allowClear onChange={handleFilterWarehouse} value={filterWarehouse}>
                        {warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                    </Select>
                    <Tag color="blue">Tổng: {pagination.total} đơn</Tag>
                </div>
                {/* --- FIX LỖI "filteredOrders is not defined" --- */}
                {Array.isArray(orders) ? (
                    <Table dataSource={orders} columns={orderColumns} rowKey="id" loading={loading} pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }} onChange={handleTableChange} />
                ) : (
                    <Empty />
                )}
            </Card>

            {/* --- MODAL TODO LIST (MỚI) --- */}
            <Modal 
                title={`Tiến độ đơn hàng: ${currentOrder?.code}`} 
                open={isTodoModalOpen} 
                onCancel={() => setIsTodoModalOpen(false)}
                onOk={handleSaveProgress}
                okText="Lưu Tiến Độ"
            >
                <List
                    dataSource={currentTodos}
                    renderItem={(item, index) => (
                        <List.Item>
                            <Checkbox 
                                checked={item.done} 
                                onChange={() => handleToggleStep(index)}
                                disabled={currentOrder?.status === 'completed'} // Không sửa nếu đã xong
                            >
                                <span style={{
                                    textDecoration: item.done ? 'line-through' : 'none', 
                                    color: item.done ? '#999' : '#000',
                                    fontWeight: 500
                                }}>
                                    {item.name}
                                </span>
                            </Checkbox>
                            {/* Hiển thị Deadline */}
                            <Tag color="orange" icon={<CalendarOutlined />}>{item.deadline || "N/A"}</Tag>
                        </List.Item>
                    )}
                />
                {currentOrder?.status === 'completed' && <div style={{color: 'green', marginTop: 10, textAlign: 'center'}}>✔ Đơn hàng đã hoàn tất!</div>}
            </Modal>
            

            {/* MODAL 1: TẠO LỆNH (CẬP NHẬT: GHI CHÚ NVL) */}
            <Modal title="Lên Mẫu Mới & Sản Xuất" open={isOrderModalOpen} onCancel={() => setIsOrderModalOpen(false)} footer={null} width={1400} style={{ top: 20 }}>
                <Form layout="vertical" form={orderForm} onFinish={handleCreateQuickOrder} onValuesChange={onFormValuesChange}>
                    <Row gutter={24}>
                        <Col span={6}>
                            <Card size="small" title="1. Thông tin Chung" bordered={false} style={{background: '#f9f9f9', marginBottom: 16}}>
                                <Form.Item label="Mã Lệnh" name="code" rules={[{ required: true }]}><Input placeholder="LSX-001" /></Form.Item>
                                <Form.Item label="Xưởng May" name="warehouse_id" rules={[{ required: true }]}>
                                    <Select placeholder="Chọn xưởng" onChange={handleWarehouseChange}>{warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}</Select>
                                </Form.Item>
                                <Form.Item label="Tên SP" name="new_product_name" rules={[{ required: true }]}><Input /></Form.Item>
                                <Form.Item label="Mã SKU" name="new_product_sku" rules={[{ required: true }]}><Input /></Form.Item>
                                <Row gutter={10}><Col span={12}><Form.Item label="Bắt đầu" name="start_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item label="Hạn xong" name="due_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col></Row>
                            </Card>
                            <Card size="small" title="Hình ảnh Mẫu" bordered={false} style={{background: '#fff7e6', border: '1px solid #ffd591'}}><Upload customRequest={handleUpload} listType="picture-card" fileList={fileList} onChange={handleFileChange}>{fileList.length >= 5 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}</Upload></Card>
                        </Col>
                        <Col span={6}>
                            <Card size="small" title="2. Size & Ghi chú" bordered={false} style={{background: '#e6f7ff', border: '1px solid #91d5ff', height: '100%'}}>
                                <Form.List name="size_breakdown" initialValue={[{ size: '0-3m', quantity: 0 }]}>{(fields, { add, remove }) => (<div style={{ maxHeight: 600, overflowY: 'auto' }}>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'size']} rules={[{ required: true }]} style={{width: 90}}><Select>{sizeStandards.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}</Select></Form.Item>
                                <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true }]}><Input type="number" placeholder="SL" min={1} style={{width: 70}} /></Form.Item>
                                <Form.Item {...restField} name={[name, 'note']}><Input placeholder="Ghi chú" style={{width: 120}} /></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{color:'red'}}/></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm Size</Button></div>)}</Form.List>
                            </Card>
                        </Col>
                        <Col span={12}>
                            <Card size="small" title="3. Tổng lượng NVL (Cả lô)" bordered={false} style={{background: '#f9f9f9', height: '100%'}}>
                                <Form.List name="materials">
                                    {(fields, { add, remove }) => (
                                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                            {fields.map(({ key, name, ...restField }) => (
                                                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                    <Form.Item 
                                                        {...restField} 
                                                        name={[name, 'material_variant_id']} 
                                                        rules={[{ required: true }]} 
                                                        style={{ width: 450 }} 
                                                    >
                                                        <Select 
                                                            placeholder="Chọn NVL..." 
                                                            showSearch 
                                                            optionFilterProp="children" 
                                                            dropdownMatchSelectWidth={false}
                                                            size="large"
                                                            onChange={(val) => handleMaterialSelect(val, name)}
                                                        >
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
                                                    
                                                    {/* Ô GHI CHÚ NVL (MỚI) */}
                                                    <Form.Item {...restField} name={[name, 'note']}>
                                                        <Input placeholder="Ghi chú NVL" style={{width: 120}} />
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

            {/* Các Modal khác giữ nguyên */}
            <Modal title="Cập nhật Thông tin & Chi phí" open={isEditModalOpen} onCancel={() => setIsEditModalOpen(false)} footer={null}><Form layout="vertical" form={editForm} onFinish={handleUpdateOrder}><Form.Item label="Mã Lệnh" name="code"><Input disabled /></Form.Item><Form.Item label="Mã SKU Sản phẩm (Cập nhật)" name="new_sku" rules={[{ required: true }]}><Input /></Form.Item><Row gutter={16}><Col span={12}><Form.Item label="Ngày bắt đầu" name="start_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col><Col span={12}><Form.Item label="Hạn xong" name="due_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col></Row><Divider>Chi phí</Divider><Row gutter={16}><Col span={12}><Form.Item label="Gia công" name="labor_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="In/Thêu" name="print_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Vận Chuyển" name="shipping_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Marketing" name="marketing_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Đóng Gói" name="packaging_fee"><Input type="number" suffix="₫" /></Form.Item></Col><Col span={12}><Form.Item label="Phụ phí" name="other_fee"><Input type="number" suffix="₫" /></Form.Item></Col></Row><Button type="primary" htmlType="submit" block>Lưu Thay Đổi</Button></Form></Modal>
            <Modal title={`📦 Nhập Kho Thành Phẩm (Trả hàng) - ${currentOrder?.code}`} open={isReceiveModalOpen} onCancel={() => setIsReceiveModalOpen(false)} onOk={handleReceiveGoods}><Table dataSource={orderSizes} pagination={false} rowKey="id" size="small" bordered columns={[{ title: 'Size', dataIndex: 'size', align: 'center', width: 80 }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{color:'#888', fontSize: 12}}>{t}</span> }, { title: 'Kế hoạch', dataIndex: 'planned', align: 'center', width: 80 }, { title: 'Đã trả', dataIndex: 'finished', align: 'center', width: 80, render: t => <span style={{color: 'blue'}}>{t}</span> }, { title: 'Nhập Đợt Này', render: (_, r, idx) => <Input type="number" min={0} value={r.receiving} onChange={(val) => { const n = [...orderSizes]; n[idx].receiving = Number(val.target.value); setOrderSizes(n); }} /> }]} /></Modal>
            <Modal title="📜 Lịch Sử Nhập Hàng" open={isHistoryModalOpen} onCancel={() => setIsHistoryModalOpen(false)} footer={null}><Table dataSource={historyData} pagination={{ pageSize: 5 }} rowKey={(r, i) => i} size="small" columns={[{ title: 'Thời gian', dataIndex: 'date', width: 140 }, { title: 'Size', dataIndex: 'size', width: 80, align: 'center', render: t => <b>{t}</b> }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{fontSize: 12, color: '#888'}}>{t}</span> }, { title: 'Số lượng trả', dataIndex: 'quantity', align: 'center', render: q => <Tag color="green">+{q}</Tag> }, {title: 'Còn thiếu', dataIndex: 'remaining', align: 'center', render: r => <b style={{color: r > 0 ? 'red' : 'gray'}}>{r}</b> }]} /></Modal>
{/* --- MODAL IN ẤN (ĐÃ SỬA: XÓA NOTE Ở PHẦN 1, THÊM DÒNG PHÍ MARKETING/ĐÓNG GÓI) --- */}
            <Modal
                open={isPrintModalOpen}
                onCancel={() => setIsPrintModalOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setIsPrintModalOpen(false)}>Đóng</Button>,
                    <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printContent}>In Ngay</Button>
                ]}
                width={900}
                style={{ top: 20 }}
            >
                {printData && (
                    <div id="printable-area" style={{ padding: 20, fontFamily: 'Times New Roman', color: '#000' }}>
                        
                        {/* HEADER */}
                        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 10, marginBottom: 20 }}>
                            <h2 style={{ margin: 0, textTransform: 'uppercase' }}>LỆNH SẢN XUẤT & TÍNH GIÁ THÀNH</h2>
                            <i>Mã lệnh: <b>{printData.code}</b></i>
                        </div>

                        {/* INFO */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                            <div>
                                <p style={{margin: '4px 0'}}><b>Xưởng thực hiện:</b> {printData.warehouse}</p>
                                <p style={{margin: '4px 0'}}><b>Ngày bắt đầu:</b> {printData.start_date}</p>
                            </div>
                            <div>
                                <p style={{margin: '4px 0'}}><b>Sản phẩm:</b> <span style={{color: '#1677ff', fontWeight: 'bold'}}>{printData.product}</span></p>
                                <p style={{margin: '4px 0'}}><b>Hạn hoàn thành:</b> {printData.due_date}</p>
                            </div>
                        </div>

                        {/* IMAGE */}
                        {printData.images && printData.images.length > 0 && (
                            <div style={{ marginBottom: 20, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {printData.images.map((url, idx) => (
                                        <img key={idx} src={`${BASE_URL}${url}`} alt="Mẫu" style={{ maxHeight: 180, border: '1px solid #ddd', padding: 2, borderRadius: 4 }} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TABLE 1: SIZE (ĐÃ XÓA CỘT GHI CHÚ) */}
                        <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: 5, marginTop: 0 }}>1. CHI TIẾT SIZE & SỐ LƯỢNG</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #333' }}>
                            <thead style={{ background: '#f5f5f5' }}>
                                <tr>
                                    <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>Size</th>
                                    <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>Số lượng đặt</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.sizes.map((s, idx) => (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center', width: '50%' }}><b>{s.size}</b></td>
                                        <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center', width: '50%', fontWeight: 'bold' }}>{s.qty}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* TABLE 2: MATERIALS & COST */}
                        <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: 5 }}>2. ĐỊNH MỨC NGUYÊN LIỆU & CHI PHÍ</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #333' }}>
                            <thead style={{ background: '#f5f5f5' }}>
                                <tr>
                                    <th style={{ border: '1px solid #333', padding: '8px', width: '35%' }}>Tên Vật Tư</th>
                                    <th style={{ border: '1px solid #333', padding: '8px', width: '15%' }}>Tổng cấp</th>
                                    <th style={{ border: '1px solid #333', padding: '8px', width: '15%' }}>Đơn giá vốn</th>
                                    <th style={{ border: '1px solid #333', padding: '8px', width: '15%' }}>Thành tiền</th>
                                    <th style={{ border: '1px solid #333', padding: '8px' }}>Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.materials.map((m, idx) => (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid #333', padding: '8px' }}>{m.name} <small style={{color:'#666'}}>({m.sku})</small></td>
                                        <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{m.total_needed}</td>
                                        
                                        {/* HIỂN THỊ GIÁ */}
                                        <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}>
                                            {new Intl.NumberFormat('vi-VN').format(m.total_cost / (m.total_needed || 1))}
                                        </td>
                                        <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>
                                            {new Intl.NumberFormat('vi-VN').format(m.total_cost)}
                                        </td>
                                        
                                        <td style={{ border: '1px solid #333', padding: '8px' }}>{m.note || ''}</td>
                                    </tr>
                                ))}
                                {/* DÒNG TỔNG TIỀN NVL */}
                                <tr style={{background: '#fafafa'}}>
                                    <td colSpan={3} style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}><b>Tổng tiền NVL:</b></td>
                                    <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}><b>{new Intl.NumberFormat('vi-VN').format(printData.total_material_cost)} ₫</b></td>
                                    <td style={{ border: '1px solid #333' }}></td>
                                </tr>
                            </tbody>
                        </table>

                        {/* TABLE 3: SUMMARY COST (ĐÃ THÊM CÁC DÒNG PHÍ CÒN THIẾU) */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <table style={{ width: '50%', borderCollapse: 'collapse', border: '2px solid #000' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Phí Gia Công:</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(printData.labor_fee || 0)} ₫</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Phí In/Thêu:</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(printData.print_fee || 0)} ₫</td>
                                    </tr>
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Phí Vận Chuyển:</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(printData.shipping_fee || 0)} ₫</td>
                                    </tr>
                                    {/* THÊM DÒNG MARKETING */}
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Phí Marketing:</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(printData.marketing_fee || 0)} ₫</td>
                                    </tr>
                                    {/* THÊM DÒNG ĐÓNG GÓI */}
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Phí Đóng Gói:</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(printData.packaging_fee || 0)} ₫</td>
                                    </tr>
                                    
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '8px' }}>Phụ phí khác:</td>
                                        <td style={{ border: '1px solid #ccc', padding: '8px', textAlign: 'right' }}>{new Intl.NumberFormat('vi-VN').format(printData.other_fee || 0)} ₫</td>
                                    </tr>
                                    <tr style={{ background: '#e6f7ff' }}>
                                        <td style={{ border: '1px solid #000', padding: '10px' }}><b>TỔNG CHI PHÍ:</b></td>
                                        <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', color: '#d4380d', fontSize: '16px' }}>
                                            <b>
                                                {new Intl.NumberFormat('vi-VN').format(
                                                    printData.total_material_cost + 
                                                    (printData.labor_fee||0) + 
                                                    (printData.print_fee||0) + 
                                                    (printData.shipping_fee||0) + 
                                                    (printData.marketing_fee||0) + 
                                                    (printData.packaging_fee||0) + 
                                                    (printData.other_fee||0)
                                                )} ₫
                                            </b>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        
                        {/* GIÁ VỐN ĐƠN VỊ */}
                        <div style={{marginTop: 15, textAlign: 'right'}}>
                            <Tag color="blue" style={{fontSize: 16, padding: '8px 15px'}}>
                                GIÁ VỐN / 1 SP: <b>{new Intl.NumberFormat('vi-VN').format(
                                    printData.total_qty > 0 
                                    ? (printData.total_material_cost + (printData.labor_fee||0) + (printData.print_fee||0) + (printData.shipping_fee||0) + (printData.other_fee||0) + (printData.marketing_fee||0) + (printData.packaging_fee||0)) / printData.total_qty 
                                    : 0
                                )} ₫</b>
                            </Tag>
                        </div>

                        {/* SIGNATURE */}
                        <div style={{ marginTop: 50, display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ textAlign: 'center', width: '40%' }}>
                                <p><b>Người Lập Lệnh</b></p><br /><br /><br />
                            </div>
                            <div style={{ textAlign: 'center', width: '40%' }}>
                                <p><b>Xưởng Xác Nhận</b></p><br /><br /><br />
                            </div>
                        </div>

                    </div>
                )}
            </Modal>
       </div>
    );
};

export default ProductionPage;