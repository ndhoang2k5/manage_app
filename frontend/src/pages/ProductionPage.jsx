import React, { useEffect, useState, useCallback } from 'react';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import dayjs from 'dayjs'; 
dayjs.extend(utc);
dayjs.extend(timezone);
import { 
    Table, Card, Button, Modal, Form, Select, Input, AutoComplete, Popconfirm,
    InputNumber, DatePicker, Tag, message, Divider, Space, 
    Checkbox, Statistic, Row, Col, Progress, Typography, Upload, Empty, Spin, List
} from 'antd';
import { 
    PlusOutlined, DeleteOutlined, PlayCircleOutlined, 
    DownloadOutlined, StopOutlined, PrinterOutlined, 
    CheckCircleOutlined, SearchOutlined, HistoryOutlined, 
    EditOutlined, SaveOutlined, CalendarOutlined
} from '@ant-design/icons';
import productionApi from '../api/productionApi';
import productApi from '../api/productApi';
import warehouseApi from '../api/warehouseApi';
import inventoryCheckApi from '../api/inventoryCheckApi';
import { getStoredUser, canManageModule, canViewMaterialCost, canViewMaterialCostForBrand } from '../utils/permissions';
import AccessModeBadge from '../components/AccessModeBadge';

const BASE_URL = window.location.origin; 

const ProductionPage = () => {
    const user = getStoredUser();
    const canManageProduction = canManageModule(user, 'production');
    const canExportProductionExcel = canManageModule(user, 'sales-management');
    // 1. Data States
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]); 
    const [warehouses, setWarehouses] = useState([]);
    const [warehouseMaterials, setWarehouseMaterials] = useState([]);

    // 2. Pagination & Search
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
    const [searchText, setSearchText] = useState('');
    const [filterWarehouse, setFilterWarehouse] = useState(null);
    const [statusFilter, setStatusFilter] = useState(null);
    const [completedTotal, setCompletedTotal] = useState(0);
    const [exportStartDateFrom, setExportStartDateFrom] = useState(null);

    // 3. UI States
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
    const [receiveSku, setReceiveSku] = useState('');
    const [receiveLineLabel, setReceiveLineLabel] = useState('Size');
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false); 
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    // todolist model
    const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
    const [currentTodos, setCurrentTodos] = useState([]); // List các bước của đơn đang chọn
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [estimatedCost, setEstimatedCost] = useState(0); 
    
    // 4. Detail States
    const [currentOrder, setCurrentOrder] = useState(null);
    const [isEditNewOrder, setIsEditNewOrder] = useState(false);
    const [editExistingMaterials, setEditExistingMaterials] = useState([]);
    const [editSizeRows, setEditSizeRows] = useState([]);
    const [orderSizes, setOrderSizes] = useState([]); 
    const [printData, setPrintData] = useState(null);
    const [historyData, setHistoryData] = useState([]);
    const [fileList, setFileList] = useState([]);

    const [orderForm] = Form.useForm();
    const [editForm] = Form.useForm();
    const selectedOwnerCentralId = Form.useWatch('owner_central_id', orderForm);

    const sizeStandards = ["0-3m", "3-6m", "6-9m", "9-12m", "12-18m", "18-24m", "2-3y", "3-4y", "4-5y", "X", "S", "M", "L", "XL", "XXL", "XXXL"];
    const sizeStandardOptions = sizeStandards.map((s) => ({ value: s, label: s }));
    const centralOptions = warehouses.filter(w => w.type_name === 'Kho Tổng');
    const selectedOwnerCentral = centralOptions.find((w) => Number(w.id) === Number(selectedOwnerCentralId));
    const canViewCreateCost = selectedOwnerCentral
        ? canViewMaterialCostForBrand(user, selectedOwnerCentral.brand_id)
        : canViewMaterialCost(user);

    // --- HÀM LOAD DỮ LIỆU ---
    const fetchData = async (page = 1, pageSize = 10, search = null, warehouse = null, status = null) => {
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
                warehouse: warehouse || undefined,
                status: status || undefined,
            };
            const res = await productionApi.getOrders(params);

            // Lấy tổng số đơn completed để hiển thị ô lọc nhanh "Đơn đã hoàn thành"
            const completedRes = await productionApi.getOrders({
                page: 1,
                limit: 1,
                search: search || undefined,
                warehouse: warehouse || undefined,
                status: 'completed',
            });
            const completedCount = completedRes?.data?.total || 0;
            setCompletedTotal(completedCount);
            
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

    const handleExportOrdersExcel = async () => {
        try {
            const startDateParam = exportStartDateFrom
                ? dayjs(exportStartDateFrom).format('YYYY-MM-DD')
                : undefined;
            const res = await productionApi.exportOrdersExcel({
                start_date_from: startDateParam,
            });
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'xuat-lenh-san-xuat.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            message.error('Lỗi xuất Excel: ' + (error.response?.data?.detail || error.message));
        }
    };

    useEffect(() => {
        fetchData(1, 10);
    }, []);

    const normalizeSkuSp = (value) => String(value || '').trim();
    const SKU_SP_NAME_SEPARATOR = '||TEN:';
    const NPL_META_PREFIX = '__NPLMETA__:';

    const buildSkuSizeLabel = (sku, name) => {
        const normalizedSku = normalizeSkuSp(sku);
        const normalizedName = String(name || '').trim();
        if (!normalizedSku) return '';
        return normalizedName
            ? `SKU:${normalizedSku}${SKU_SP_NAME_SEPARATOR}${normalizedName}`
            : `SKU:${normalizedSku}`;
    };

    const parseSkuSizeLabel = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return { sku_sp: '', sku_sp_name: '' };
        const withoutPrefix = raw.replace(/^SKU:/i, '');
        const sepIdx = withoutPrefix.indexOf(SKU_SP_NAME_SEPARATOR);
        if (sepIdx >= 0) {
            return {
                sku_sp: withoutPrefix.slice(0, sepIdx).trim(),
                sku_sp_name: withoutPrefix.slice(sepIdx + SKU_SP_NAME_SEPARATOR.length).trim(),
            };
        }
        return { sku_sp: withoutPrefix.trim(), sku_sp_name: '' };
    };

    const parseNplNoteMeta = (rawNote) => {
        const raw = String(rawNote || '');
        const markerIdx = raw.indexOf(NPL_META_PREFIX);
        if (markerIdx < 0) {
            return { note: raw.trim(), consumptionRate: null, productQuantity: null, rowIndex: null };
        }
        const cleanNote = raw.slice(0, markerIdx).trim();
        const encoded = raw.slice(markerIdx + NPL_META_PREFIX.length).trim();
        try {
            const parsed = JSON.parse(encoded || '{}');
            return {
                note: cleanNote,
                consumptionRate: Number.isFinite(Number(parsed?.consumptionRate)) ? Number(parsed.consumptionRate) : null,
                productQuantity: Number.isFinite(Number(parsed?.productQuantity)) ? Number(parsed.productQuantity) : null,
                rowIndex: Number.isInteger(Number(parsed?.rowIndex)) ? Number(parsed.rowIndex) : null,
            };
        } catch (e) {
            return { note: cleanNote, consumptionRate: null, productQuantity: null, rowIndex: null };
        }
    };

    const buildNplNoteWithMeta = ({ note, consumptionRate, productQuantity, includeMeta, rowIndex }) => {
        const cleanNote = String(note || '').trim();
        const metaObj = { rowIndex: Number(rowIndex ?? -1) };
        if (includeMeta) {
            metaObj.consumptionRate = Number(consumptionRate || 0);
            metaObj.productQuantity = Number(productQuantity || 0);
        }
        const meta = JSON.stringify(metaObj);
        return `${cleanNote}${cleanNote ? ' ' : ''}${NPL_META_PREFIX}${meta}`;
    };

    const buildSkuSpPlan = (materials = []) => {
        if (!Array.isArray(materials)) {
            return { lines: [], totalQty: 0, hasSkuRows: false, fallbackQty: 0, finalQty: 0, inconsistentSkus: [] };
        }
        const lines = materials
            .map((item, idx) => ({
                line_no: idx,
                sku_sp: normalizeSkuSp(item?.sku_sp),
                sku_sp_name: String(item?.sku_sp_name || '').trim(),
                sku_sp_note: String(item?.sku_sp_note || '').trim(),
                quantity: Number(item?.product_quantity || 0),
            }))
            .filter((line) => line.sku_sp);
        const totalQty = lines.reduce((sum, line) => sum + (Number(line.quantity || 0) > 0 ? Number(line.quantity || 0) : 0), 0);
        const fallbackQty = (materials || []).reduce((sum, row) => sum + Number(row?.product_quantity || 0), 0);
        const hasSkuRows = lines.length > 0;
        const finalQty = hasSkuRows ? totalQty : fallbackQty;
        return { lines, totalQty, hasSkuRows, fallbackQty, finalQty, inconsistentSkus: [] };
    };

    const getOrderQuantityFromMaterials = (materials = []) => {
        const plan = buildSkuSpPlan(materials);
        return Number(plan.finalQty || 0);
    };

    const calculateRequiredQuantity = (consumptionRate, productQuantity) => {
        const rate = Number(consumptionRate || 0);
        const qty = Number(productQuantity || 0);
        return Number((rate * qty).toFixed(4));
    };

    const getMaterialById = (materialId) => {
        const id = Number(materialId);
        if (!id) return null;
        return warehouseMaterials.find((p) => Number(p.id) === id) || products.find((p) => Number(p.id) === id) || null;
    };

    // --- LOGIC KHO & NVL ---
    const loadMaterialsByCentral = useCallback(async (centralId) => {
        if (!centralId) {
            setWarehouseMaterials([]);
            return;
        }
        orderForm.setFieldsValue({ materials: [] });
        setEstimatedCost(0);
        try {
            const res = await productApi.getByWarehouse(centralId);
            setWarehouseMaterials(res.data || []);
            message.success(`Đã cập nhật danh sách NVL theo kho tổng!`);
        } catch (error) {
            message.error("Lỗi tải NVL theo kho tổng");
        }
    }, [orderForm]);

    useEffect(() => {
        if (!isOrderModalOpen) return;
        loadMaterialsByCentral(selectedOwnerCentralId);
    }, [selectedOwnerCentralId, isOrderModalOpen, loadMaterialsByCentral]);

    // --- TÍNH GIÁ VỐN ---
    const calculateCost = () => {
        const values = orderForm.getFieldsValue();
        const materials = values.materials || [];
        const totalQty = getOrderQuantityFromMaterials(materials);

        let totalMatCost = 0;
        if (Array.isArray(materials)) {
            materials.forEach(item => {
                if (item && item.material_variant_id) {
                    const requiredQty = calculateRequiredQuantity(item.consumption_rate, item.product_quantity);
                    if (!requiredQty) return;
                    const mat = getMaterialById(item.material_variant_id);
                    const price = mat ? (mat.cost_price || 0) : 0;
                    totalMatCost += requiredQty * Number(price || 0);
                }
            });
        }

        const totalFees =
            Number(values.shipping_fee || 0) +
            Number(values.labor_fee || 0) +
            Number(values.packaging_fee || 0) +
            Number(values.print_fee || 0) +
            Number(values.marketing_fee || 0) +
            Number(values.other_fee || 0);

        if (totalQty > 0) {
            setEstimatedCost((totalMatCost + totalFees) / totalQty);
        } else {
            setEstimatedCost(0);
        }
    };
    const onFormValuesChange = () => calculateCost();

    // --- CÁC HÀM XỬ LÝ ---
    const handleSearch = () => { fetchData(1, pagination.pageSize, searchText, filterWarehouse, statusFilter); };
    const handleFilterWarehouse = (val) => { setFilterWarehouse(val); fetchData(1, pagination.pageSize, searchText, val, statusFilter); };
    const handleTableChange = (newPagination) => { fetchData(newPagination.current, newPagination.pageSize, searchText, filterWarehouse, statusFilter); };
    const handleToggleCompletedFilter = () => {
        const nextStatus = statusFilter === 'completed' ? null : 'completed';
        setStatusFilter(nextStatus);
        fetchData(1, pagination.pageSize, searchText, filterWarehouse, nextStatus);
    };

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
            const materialRows = values.materials || [];
            const skuPlan = buildSkuSpPlan(materialRows);
            if (!skuPlan.hasSkuRows) {
                message.warning("Nhập SKU SP và số lượng sản phẩm > 0 trong bảng định mức.");
                setLoading(false);
                return;
            }
            const totalPlannedQty = Number(skuPlan.finalQty || 0);

            const normalizedMaterials = (values.materials || [])
                .map((row, idx) => {
                    const materialId = Number(row?.material_variant_id || 0);
                    const lineQty = Number(row?.product_quantity || 0);
                    const requiredQty = calculateRequiredQuantity(row?.consumption_rate, lineQty);
                    const hasSku = normalizeSkuSp(row?.sku_sp).length > 0;
                    return {
                        material_variant_id: materialId,
                        quantity_needed: Number(requiredQty || 0),
                        note: buildNplNoteWithMeta({
                            note: row?.npl_note || '',
                            consumptionRate: row?.consumption_rate,
                            productQuantity: row?.product_quantity,
                            includeMeta: !hasSku,
                            rowIndex: idx,
                        }),
                    };
                })
                .filter((m) => m.material_variant_id);

            if (!normalizedMaterials.length) {
                message.warning("Cần có ít nhất 1 dòng nguyên phụ liệu hợp lệ.");
                setLoading(false);
                return;
            }

            const imageUrls = fileList.filter(f => f.status === 'done' && f.originFileObj.url).map(f => f.originFileObj.url);
            const payload = {
                new_product_name: values.new_product_name,
                new_product_sku: values.new_product_sku,
                order_code: values.code,
                warehouse_id: values.warehouse_id,
                owner_central_id: values.owner_central_id || null,
                start_date: values.start_date.format('YYYY-MM-DD'),
                due_date: values.due_date.format('YYYY-MM-DD'),
                materials: normalizedMaterials,
                size_breakdown: skuPlan.lines.map((line) => ({
                    size: buildSkuSizeLabel(line.sku_sp, line.sku_sp_name),
                    quantity: Number(line.quantity || 0),
                    note: line.sku_sp_note || '',
                })),
                image_urls: imageUrls, 
                auto_start: values.auto_start,
                shipping_fee: Number(values.shipping_fee || 0),
                labor_fee: Number(values.labor_fee || 0),
                packaging_fee: Number(values.packaging_fee || 0),
                print_fee: Number(values.print_fee || 0),
                other_fee: Number(values.other_fee || 0),
                marketing_fee: Number(values.marketing_fee || 0),
                note: values.note || ""
            };

            await productionApi.createQuickOrder(payload);
            message.success("Thành công!");
            setIsOrderModalOpen(false);
            orderForm.resetFields();
            setFileList([]); setEstimatedCost(0);
            fetchData(1, pagination.pageSize, searchText, filterWarehouse, statusFilter);
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Lỗi tạo lệnh"));
        }
        setLoading(false);
    };

    const openEditModal = async (record) => {
        setCurrentOrder(record);

        // 1. Lấy danh sách NVL của kho để nạp vào Dropdown
        if (record.warehouse_id) {
            try {
                const res = await productApi.getByWarehouse(record.warehouse_id);
                setWarehouseMaterials(Array.isArray(res.data) ? res.data : []);
            } catch (error) {
                console.error("Lỗi tải NVL tại kho:", error);
                setWarehouseMaterials([]);
            }
        }

        try {
            // 2. Gọi các API dữ liệu song song (Promise.all) cho nhanh
            const [printRes, matRes, sizeRes] = await Promise.all([
                productionApi.getPrintData(record.id), // Lấy chi phí, ảnh, sku
                productionApi.getReservations ? productionApi.getReservations(record.id) : Promise.resolve({ data: [] }), // Lấy NVL
                productionApi.getOrderDetails(record.id) // Lấy danh sách Size
            ]);

            const data = printRes.data;
            const materials = matRes.data || [];
            const sizes = sizeRes.data || []; // Dữ liệu size trả về từ API
            const isNewOrderMode = !!(data?.use_sku_sp_mode || data?.is_new_sku_order);
            setIsEditNewOrder(isNewOrderMode);
            setEditExistingMaterials((materials || []).map((m) => ({
                id: m.id,
                material_variant_id: m.material_variant_id,
                rowIndex: parseNplNoteMeta(m.note || '').rowIndex,
            })));

            const normalizedSizes = (sizes || []).map(s => {
                const parsed = parseSkuSizeLabel(s.size);
                return {
                    id: s.id,
                    sku_sp: parsed.sku_sp,
                    sku_sp_name: String(s.sku_sp_name || parsed.sku_sp_name || '').trim(),
                    quantity: Number(s.planned || 0),
                    note: s.note || "",
                };
            });
            setEditSizeRows(normalizedSizes);
            // 3. Xử lý ảnh cũ
            const existingImages = (data.images || []).map((url, index) => ({
                uid: index,
                name: 'image.png',
                status: 'done',
                url: BASE_URL + url,
                response: { url: url }
            }));
            setFileList(existingImages);

            // 4. Đổ dữ liệu vào Form
            editForm.setFieldsValue({
                code: data.code,
                new_sku: data.sku,
                new_product_name: data.product, 
                start_date: dayjs(data.start_date),
                due_date: dayjs(data.due_date),
                shipping_fee: data.shipping_fee,
                other_fee: data.other_fee || 0,
                labor_fee: data.labor_fee || 0,
                marketing_fee: data.marketing_fee || 0,
                packaging_fee: data.packaging_fee || 0,
                print_fee: data.print_fee || 0,
                note: data.note || "",
                
                sizes: (sizes || []).map(s => ({
                    id: s.id,
                    size: s.size,
                    quantity: s.planned, // <--- LƯU Ý: API trả về 'planned', Form dùng 'quantity'
                    note: s.note
                })),
                edit_material_rows: isNewOrderMode
                    ? (() => {
                        const materialRowsWithContent = (materials || []).filter((m) => {
                            const parsed = parseNplNoteMeta(m.note || '');
                            const qty = Number(m?.quantity || 0);
                            const cleanNote = String(parsed?.note || '').trim();
                            const hasMaterialSelected = Number(m?.material_variant_id || 0) > 0;
                            const hasMetaValue = (
                                parsed?.consumptionRate !== undefined
                                || parsed?.productQuantity !== undefined
                                || parsed?.rowIndex !== undefined
                            );
                            return hasMaterialSelected || qty > 0 || !!cleanNote || hasMetaValue;
                        }).length;
                        const rowCount = Math.max(normalizedSizes.length, materialRowsWithContent, 1);
                        const alignedMaterials = Array.from({ length: rowCount }, () => null);
                        const fallbackMaterials = [];
                        (materials || []).forEach((m) => {
                            const parsed = parseNplNoteMeta(m.note || '');
                            const parsedRowIndex = parsed?.rowIndex;
                            const hasIndexedRow = Number.isInteger(parsedRowIndex) && parsedRowIndex >= 0;
                            const idx = hasIndexedRow ? parsedRowIndex : -1;
                            const currentPacked = { row: m, parsed };
                            const qty = Number(m?.quantity || 0);
                            const cleanNote = String(parsed?.note || '').trim();
                            const hasMaterialSelected = Number(m?.material_variant_id || 0) > 0;
                            const hasFallbackContent = (
                                hasMaterialSelected
                                || qty > 0
                                || !!cleanNote
                                || parsed?.consumptionRate !== undefined
                                || parsed?.productQuantity !== undefined
                                || parsed?.rowIndex !== undefined
                            );

                            if (hasIndexedRow && idx < rowCount) {
                                const prev = alignedMaterials[idx];
                                if (!prev) {
                                    alignedMaterials[idx] = currentPacked;
                                    return;
                                }
                                const prevQty = Number(prev?.row?.quantity || 0);
                                const prevNote = String(prev?.parsed?.note || '').trim();
                                // Nếu trùng rowIndex, ưu tiên bản ghi có dữ liệu thực (qty/note) để tránh bám nhầm dòng rỗng cũ.
                                if ((prevQty <= 0 && qty > 0) || (!prevNote && cleanNote)) {
                                    alignedMaterials[idx] = currentPacked;
                                }
                            } else {
                                // Chỉ dùng fallback cho dòng thực sự có dữ liệu; bỏ qua dòng rỗng cũ để tránh "nhảy" khi reopen.
                                if (hasFallbackContent) {
                                    fallbackMaterials.push(currentPacked);
                                }
                            }
                        });
                        for (let i = 0; i < rowCount; i += 1) {
                            if (alignedMaterials[i]) continue;
                            alignedMaterials[i] = fallbackMaterials.shift() || null;
                        }
                        return Array.from({ length: rowCount }, (_, idx) => {
                            const packed = alignedMaterials[idx] || {};
                            const m = packed.row || {};
                            const parsedNpl = packed.parsed || parseNplNoteMeta(m.note || '');
                            const sizeByIndex = normalizedSizes[idx] || { sku_sp: '', sku_sp_name: '', quantity: 0, note: '' };
                            const totalNeeded = Number(m.quantity || 0);
                            const fallbackQty = Number(sizeByIndex.quantity || 0);
                            const baseQty = sizeByIndex.sku_sp
                                ? fallbackQty
                                : Number(parsedNpl.productQuantity ?? fallbackQty);
                            const consumption = sizeByIndex.sku_sp
                                ? (baseQty > 0 ? Number((totalNeeded / baseQty).toFixed(4)) : 0)
                                : Number(parsedNpl.consumptionRate ?? (baseQty > 0 ? Number((totalNeeded / baseQty).toFixed(4)) : 0));
                            return {
                                id: m.id || null,
                                material_variant_id: m.material_variant_id || null,
                                sku_sp: sizeByIndex.sku_sp || '',
                                sku_sp_name: sizeByIndex.sku_sp_name || '',
                                sku_sp_note: sizeByIndex.note || '',
                                npl_note: parsedNpl.note || '',
                                consumption_rate: Number(consumption || 0),
                                product_quantity: Number(baseQty || 0),
                            };
                        });
                    })()
                    : [],
                
                // Đổ dữ liệu NVL
                materials: (materials || []).map(m => {
                    const cleanQty = parseFloat(Number(m.quantity).toFixed(4));
                    return {
                        id: m.id,
                        material_variant_id: m.material_variant_id,
                        sku: m.sku, 
                        name: m.name, 
                        
                        // Gán giá trị đã làm sạch vào Form
                        quantity: cleanQty, 
                        
                        note: m.note
                    }
                })
            });
            
            setIsEditModalOpen(true);
        } catch (err) {
            console.error(err);
            message.error("Lỗi tải thông tin chi tiết: " + (err.message || "Lỗi mạng"));
        }
    };

// Cập nhật đơn (ĐÃ FIX LỖI SỐ 0)
    const handleUpdateOrder = async (values) => {
        try {
            // Helper function để ép kiểu số an toàn
            const parseNum = (val) => {
                if (val === null || val === undefined || val === '') return 0;
                // Nếu là string có dấu phẩy (1,000), bỏ dấu phẩy đi rồi parse
                if (typeof val === 'string') {
                    val = val.replace(/,/g, ''); 
                }
                return parseFloat(val) || 0;
            };

            let cleanMaterials = [];
            let cleanSizes = [];

            if (isEditNewOrder) {
                const planRows = values.edit_material_rows || [];
                const skuPlan = buildSkuSpPlan(planRows);
                if (!skuPlan.hasSkuRows) {
                    message.warning("Cần nhập SKU SP và số lượng sản phẩm > 0.");
                    return;
                }
                cleanSizes = skuPlan.lines.map((line) => {
                    const srcIdx = Number(line.line_no ?? 0);
                    const formSizeRow = values?.sizes?.[srcIdx];
                    const cachedSizeRow = editSizeRows?.[srcIdx];
                    return {
                        id: formSizeRow?.id
                            ? parseInt(formSizeRow.id)
                            : (cachedSizeRow?.id ? parseInt(cachedSizeRow.id) : null),
                        size: buildSkuSizeLabel(line.sku_sp, line.sku_sp_name),
                        quantity: parseInt(Number(line.quantity || 0)),
                        note: line.sku_sp_note || "",
                    };
                });

                const usedResolvedIds = new Set();
                const legacyPoolsByMaterial = new Map();
                (editExistingMaterials || []).forEach((x) => {
                    const mid = Number(x?.material_variant_id || 0);
                    const rid = Number(x?.id || 0);
                    const rIdx = Number(x?.rowIndex);
                    if (!mid || !rid) return;
                    if (Number.isInteger(rIdx) && rIdx >= 0) return;
                    if (!legacyPoolsByMaterial.has(mid)) legacyPoolsByMaterial.set(mid, []);
                    legacyPoolsByMaterial.get(mid).push(rid);
                });

                cleanMaterials = planRows
                    .map((row, idx) => {
                        const materialId = Number(row?.material_variant_id || 0);
                        if (!materialId) return null;
                        const lineQty = Number(row?.product_quantity || 0);
                        const requiredQty = calculateRequiredQuantity(row?.consumption_rate, lineQty);
                        const hasSku = normalizeSkuSp(row?.sku_sp).length > 0;
                        const rowId = row?.id ? parseInt(row.id) : null;
                        const original = rowId
                            ? (editExistingMaterials || []).find((x) => Number(x.id) === Number(rowId))
                            : null;
                        const matchedByRowIndex = (editExistingMaterials || []).find(
                            (x) => Number(x.rowIndex) === idx && Number(x.material_variant_id) === materialId
                        );
                        // Nếu user đổi SKU vải trên dòng cũ thì không giữ id cũ,
                        // để backend tạo dòng mới đúng vật liệu và không check nhầm tồn theo vật liệu cũ.
                        const materialChanged = !!(original && Number(original.material_variant_id) !== materialId);
                        const hasAnyContent = hasSku
                            || Number(row?.consumption_rate || 0) > 0
                            || Number(row?.product_quantity || 0) > 0
                            || String(row?.npl_note || '').trim()
                            || String(row?.sku_sp_name || '').trim()
                            || String(row?.sku_sp_note || '').trim();
                        if (!hasAnyContent && !rowId && !matchedByRowIndex?.id) return null;
                        let resolvedId = null;
                        if (!materialChanged) {
                            resolvedId = rowId || (matchedByRowIndex?.id ? parseInt(matchedByRowIndex.id) : null);
                            if (!resolvedId) {
                                const pool = legacyPoolsByMaterial.get(materialId) || [];
                                while (pool.length > 0 && !resolvedId) {
                                    const candidate = Number(pool.shift());
                                    if (candidate > 0 && !usedResolvedIds.has(candidate)) {
                                        resolvedId = candidate;
                                    }
                                }
                            }
                        }
                        if (resolvedId) {
                            usedResolvedIds.add(Number(resolvedId));
                        }
                        return {
                            id: resolvedId,
                            material_variant_id: materialId,
                            quantity: parseNum(requiredQty),
                            note: buildNplNoteWithMeta({
                                note: row?.npl_note || '',
                                consumptionRate: row?.consumption_rate,
                                productQuantity: row?.product_quantity,
                                includeMeta: !hasSku,
                                rowIndex: idx,
                            }),
                        };
                    })
                    .filter(Boolean);

                // Các dòng cũ không còn xuất hiện trong lần submit này:
                // gửi quantity=0 để backend hoàn kho/clear dữ liệu đúng theo lần chỉnh sửa.
                const submittedIds = new Set(
                    cleanMaterials
                        .map((m) => Number(m.id))
                        .filter((id) => Number.isFinite(id) && id > 0)
                );
                (editExistingMaterials || []).forEach((oldRow) => {
                    const oldId = Number(oldRow?.id || 0);
                    if (!oldId || submittedIds.has(oldId)) return;
                    cleanMaterials.push({
                        id: oldId,
                        material_variant_id: Number(oldRow.material_variant_id || 0),
                        quantity: 0,
                        note: buildNplNoteWithMeta({
                            note: '',
                            includeMeta: false,
                            rowIndex: Number(oldRow?.rowIndex ?? -1),
                        }),
                    });
                });
            } else {
                // 1. Chuẩn bị dữ liệu NVL (đơn cũ)
                cleanMaterials = (values.materials || []).map(m => ({
                    id: m.id ? parseInt(m.id) : null,
                    material_variant_id: m.material_variant_id,
                    quantity: parseNum(m.quantity), // Ép kiểu an toàn
                    note: m.note || ""
                }));

                // 2. Chuẩn bị dữ liệu Size (đơn cũ)
                cleanSizes = (values.sizes || []).map(s => {
                    // Xử lý trường size: Nếu là mảng -> Lấy phần tử đầu tiên
                    let sizeVal = s.size;
                    if (Array.isArray(sizeVal)) {
                        sizeVal = sizeVal[0] || ""; // Lấy cái đầu tiên
                    }
                    return {
                        id: s.id ? parseInt(s.id) : null,
                        size: String(sizeVal), // Đảm bảo là chuỗi
                        quantity: parseInt(Number(s.quantity || 0)), 
                        note: s.note || ""
                    };
                });
            }
            // 3. Chuẩn bị Ảnh
            const imageUrls = fileList.map(f => {
                if (f.response && f.response.url) return f.response.url;
                if (f.url) return f.url.replace(BASE_URL, ''); 
                return null;
            }).filter(url => url !== null);

            // 4. Tạo Payload
            const payload = {
                start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
                due_date: values.due_date ? values.due_date.format('YYYY-MM-DD') : null,
                new_sku: values.new_sku,
                new_product_name: values.new_product_name,
                shipping_fee: parseNum(values.shipping_fee),
                other_fee: parseNum(values.other_fee),
                labor_fee: parseNum(values.labor_fee),
                marketing_fee: parseNum(values.marketing_fee),
                packaging_fee: parseNum(values.packaging_fee),
                print_fee: parseNum(values.print_fee),
                note: values.note || "",
                image_urls: imageUrls,
                materials: cleanMaterials,
                sizes: cleanSizes
            };
            
            console.log("Payload gửi đi:", payload); // Kiểm tra F12 xem số có đúng không

            await productionApi.updateOrder(currentOrder.id, payload);
            message.success("Cập nhật thành công!");
            setIsEditModalOpen(false);
            
            fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse, statusFilter);
        } catch (error) {
            console.error(error);
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể lưu"));
        }
    };
    const handleDeleteOrder = async (id) => { if(window.confirm("CẢNH BÁO: Xóa đơn hàng sẽ HOÀN TRẢ nguyên liệu!")) { try { if (productionApi.deleteOrder) { await productionApi.deleteOrder(id); message.success("Đã xóa!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse, statusFilter); } else { message.error("Chưa cấu hình API xóa!"); } } catch (error) { message.error("Lỗi xóa: " + error.response?.data?.detail); } } }
    const handleStart = async (id) => { try { await productionApi.startOrder(id); message.success("Bắt đầu SX!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse, statusFilter); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } };
    const handleForceFinish = async (id) => { if(window.confirm("Kết thúc đơn?")) { try { await productionApi.forceFinish(id); message.success("Đã chốt!"); fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse, statusFilter); } catch (error) { message.error("Lỗi: " + error.response?.data?.detail); } } };
    const openReceiveModal = async (order) => {
        setCurrentOrder(order);
        try {
            const [res, printRes] = await Promise.all([
                productionApi.getOrderDetails(order.id),
                productionApi.getPrintData(order.id),
            ]);
            const data = res.data.map(item => ({...item, receiving: 0, inventory_code: ''}));
            setOrderSizes(data);
            setReceiveSku(printRes?.data?.sku || '');
            setReceiveLineLabel((printRes?.data?.use_sku_sp_mode || printRes?.data?.is_new_sku_order) ? 'SKU SP' : 'Size');
            setIsReceiveModalOpen(true);
        } catch (error) {
            message.error("Lỗi tải chi tiết");
        }
    };
    const handleReceiveGoods = async () => {
        try {
            const itemsToReceive = orderSizes
                .filter(s => Number(s.receiving || 0) > 0)
                .map(s => ({
                    id: s.id,
                    size: s.size,
                    quantity: Number(s.receiving),
                    inventory_code: (s.inventory_code || '').trim() || null,
                }));
            if (itemsToReceive.length === 0) return message.warning("Chưa nhập số lượng trả hàng!");

            const filledCodes = [...new Set(itemsToReceive.map(x => (x.inventory_code || '').trim()).filter(Boolean))];
            const hasBlank = itemsToReceive.some(x => !x.inventory_code);
            if (hasBlank) {
                message.warning("Có dòng đang để trống mã (vẫn cho nhập, nhưng sẽ không cộng tăng kiểm tồn cho dòng đó).");
            }

            // Nếu có nhập mã, bắt buộc mã đó phải tồn tại bên kiểm tồn (Salework product list)
            for (const code of filledCodes) {
                const res = await inventoryCheckApi.getSaleworkProducts({ page: 1, limit: 5, include_zero: true, search: code });
                const list = res.data?.items || [];
                const ok = list.some((p) => String(p.code || '').trim() === String(code).trim());
                if (!ok) {
                    message.warning(`Mã "${code}" không tồn tại bên kiểm tồn. Không thể hoàn tất nhập.`);
                    return;
                }
            }

            await productionApi.receiveGoods(currentOrder.id, { items: itemsToReceive });
            message.success("Đã nhập kho!");
            setIsReceiveModalOpen(false);
            fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse, statusFilter);
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || error.message || 'unknown'));
        }
    };
    const handleViewHistory = async (id) => { try { const res = await productionApi.getReceiveHistory(id); setHistoryData(res.data); setIsHistoryModalOpen(true); } catch (error) { message.error("Lỗi tải lịch sử"); } };
    const handlePrintOrder = async (record) => {
        try {
            const res = await productionApi.getPrintData(record.id);
            setPrintData(res.data);
            setIsPrintModalOpen(true);
        } catch (error) {
            message.error("Lỗi tải dữ liệu in");
        }
    };

    const buildDefaultProgressSteps = (record = {}) => {
        const start = record?.start_date || dayjs().format('YYYY-MM-DD');
        const due = record?.due_date || dayjs().format('YYYY-MM-DD');
        return [
            { name: "Bước 1: Chuẩn bị NVL & Rập", done: false, deadline: start },
            { name: "Bước 2: Cắt bán thành phẩm", done: false, deadline: start },
            { name: "Bước 3: May gia công", done: false, deadline: due },
            { name: "Bước 4: KCS & Đóng gói", done: false, deadline: due },
        ];
    };

    const normalizeProgressSteps = (record = {}) => {
        const defaults = buildDefaultProgressSteps(record);
        const incoming = Array.isArray(record?.progress) ? record.progress : [];
        if (!incoming.length) return defaults;
        return defaults.map((d, idx) => {
            const row = incoming[idx] || {};
            return {
                name: row.name || d.name,
                done: Boolean(row.done),
                deadline: row.deadline || d.deadline,
            };
        });
    };

    const isStepOverdue = (step) => {
        if (!step || step.done || !step.deadline) return false;
        const deadline = dayjs(step.deadline);
        if (!deadline.isValid()) return false;
        return deadline.endOf('day').isBefore(dayjs());
    };

    const isOrderProgressOverdue = (order) => {
        const steps = normalizeProgressSteps(order);
        return steps.some((s) => isStepOverdue(s));
    };


    const openTodoModal = (record) => {
        setCurrentOrder(record);
        const steps = normalizeProgressSteps(record);
        setCurrentTodos(steps);
        setIsTodoModalOpen(true);
    };

    const handleToggleStep = (index) => {
        const newTodos = [...currentTodos];
        newTodos[index].done = !newTodos[index].done;
        setCurrentTodos(newTodos);
    };

    const handleDeadlineChange = (index, value) => {
        const newTodos = [...currentTodos];
        newTodos[index].deadline = value ? dayjs(value).format('YYYY-MM-DD') : null;
        setCurrentTodos(newTodos);
    };

    const handleSaveProgress = async () => {
        try {
            await productionApi.updateProgress(currentOrder.id, { steps: currentTodos });
            message.success("Đã cập nhật tiến độ!");
            setIsTodoModalOpen(false);
            fetchData(pagination.current, pagination.pageSize, searchText, filterWarehouse, statusFilter); // Reload để cập nhật màu nút
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



    // --- HÀM IN: in trực tiếp từ trình duyệt ---
    const printContent = async () => {
        if (!printData) return;

        const printableArea = document.getElementById('printable-area');
        if (!printableArea) {
            message.error('Không tìm thấy nội dung để in');
            return;
        }

        setIsExportingPdf(true);
        try {
            const printWindow = window.open('', '_blank', 'width=1200,height=900');
            if (!printWindow) {
                throw new Error('Trình duyệt đang chặn cửa sổ in');
            }

            const html = `
                <html>
                <head>
                    <title>In lệnh sản xuất - ${printData.code || ''}</title>
                    <style>
                        @page { size: A4; margin: 10mm; }
                        html, body { margin: 0; padding: 0; background: #fff; }
                        body { font-family: "Times New Roman", serif; color: #000; }
                        .print-root { width: 100%; box-sizing: border-box; }
                        .print-root * { box-sizing: border-box; }
                        .print-root img { max-width: 100%; height: auto; }
                        .print-root table { width: 100% !important; border-collapse: collapse; table-layout: fixed; }
                        .print-root th, .print-root td { word-break: break-word; }
                        .print-root .ant-tag {
                            display: inline-block !important;
                            white-space: normal !important;
                            max-width: 100% !important;
                        }
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    <div class="print-root">${printableArea.innerHTML}</div>
                </body>
                </html>
            `;

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

            await new Promise((resolve) => {
                const tryPrint = () => {
                    const imgs = Array.from(printWindow.document.images || []);
                    if (!imgs.length) {
                        setTimeout(resolve, 200);
                        return;
                    }
                    let done = 0;
                    const finish = () => {
                        done += 1;
                        if (done >= imgs.length) {
                            setTimeout(resolve, 200);
                        }
                    };
                    imgs.forEach((img) => {
                        if (img.complete) finish();
                        else {
                            img.onload = finish;
                            img.onerror = finish;
                        }
                    });
                };
                if (printWindow.document.readyState === 'complete') tryPrint();
                else printWindow.onload = tryPrint;
            });

            printWindow.focus();
            printWindow.print();
            setTimeout(() => {
                if (!printWindow.closed) {
                    printWindow.close();
                }
            }, 1000);
        } catch (error) {
            console.error(error);
            message.error('In thất bại: ' + (error.message || 'Lỗi không xác định'));
        } finally {
            setIsExportingPdf(false);
        }
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
                const steps = normalizeProgressSteps(r);
                const doneCount = steps.filter(s => s.done).length;
                const totalCount = steps.length || 4; // Mặc định 4 bước
                const isOverdue = isOrderProgressOverdue(r);
                
                // Màu sắc dựa trên tiến độ
                let color = 'default';
                if (isOverdue && r.status !== 'completed') color = 'error';
                else if (doneCount > 0) color = 'processing';
                if (doneCount === totalCount) color = 'success';
                if (r.status === 'completed') color = 'green';
                const strokeColor = color === 'error'
                    ? '#ff4d4f'
                    : (color === 'success' ? '#52c41a' : '#1890ff');

                return (
                    <div
                        style={{cursor: canManageProduction ? 'pointer' : 'default'}}
                        onClick={() => openTodoModal(r)}
                    >
                        <Tag color={color} style={{fontSize: 13, padding: '4px 10px'}}>
                            {r.status === 'completed'
                                ? 'HOÀN THÀNH'
                                : (isOverdue ? `Trễ hạn ${doneCount}/${totalCount}` : `Bước ${doneCount}/${totalCount}`)}
                        </Tag>
                        <Progress percent={Math.round((doneCount/totalCount)*100)} size="small" showInfo={false} strokeColor={strokeColor} />
                    </div>
                );
            }
        },
        // ----------------------------------

        {
            title: 'Hành động', key: 'action', align: 'center', width: 220,
            render: (_, record) => (
                <Space>
                    <Button
                        icon={<PrinterOutlined />}
                        size="small"
                        onClick={() => handlePrintOrder(record)}
                        title="In"
                    />
                    <Button icon={<HistoryOutlined />} size="small" onClick={() => handleViewHistory(record.id)} />
                    {canManageProduction && (
                        <>
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
                        </>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div>
            <Card title={<span>Quản Lý Sản Xuất <AccessModeBadge canManage={canManageProduction} label="Sản xuất" /></span>} bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}}
                extra={canManageProduction ? <Button type="primary" onClick={handleOpenCreateModal} size="large" icon={<PlusOutlined />}>Lên Kế Hoạch / Mẫu Mới</Button> : null}
            >
                <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Input.Search placeholder="Tìm theo Mã/Tên..." style={{ width: 300 }} value={searchText} onChange={e => setSearchText(e.target.value)} onSearch={handleSearch} enterButton allowClear />
                    <Select placeholder="Lọc theo Xưởng" style={{ width: 200 }} allowClear onChange={handleFilterWarehouse} value={filterWarehouse}>
                        {warehouses.filter(w => !w.is_central).map(w => <Select.Option key={w.id} value={w.name}>{w.name}</Select.Option>)}
                    </Select>
                    {canExportProductionExcel && (
                        <>
                            <DatePicker
                                placeholder="Từ ngày (bắt đầu)"
                                value={exportStartDateFrom}
                                onChange={(v) => setExportStartDateFrom(v)}
                                style={{ width: 180 }}
                            />
                            <Button icon={<DownloadOutlined />} onClick={handleExportOrdersExcel}>
                                Xuất Excel
                            </Button>
                        </>
                    )}
                    <Tag color="blue">Tổng: {pagination.total} đơn</Tag>
                    <Tag
                        color={statusFilter === 'completed' ? 'green' : 'default'}
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={handleToggleCompletedFilter}
                    >
                        Đơn đã hoàn thành: {completedTotal}
                    </Tag>
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
                onOk={canManageProduction ? handleSaveProgress : () => setIsTodoModalOpen(false)}
                okText={canManageProduction ? "Lưu Tiến Độ" : "Đóng"}
                okButtonProps={{ style: canManageProduction ? {} : { display: 'none' } }}
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
                                    color: item.done ? '#999' : (isStepOverdue(item) ? '#cf1322' : '#000'),
                                    fontWeight: 500
                                }}>
                                    {item.name}
                                </span>
                            </Checkbox>
                            {/* Hiển thị Deadline */}
                            <DatePicker
                                value={item.deadline ? dayjs(item.deadline) : null}
                                onChange={(value) => handleDeadlineChange(index, value)}
                                disabled={currentOrder?.status === 'completed'}
                                format="YYYY-MM-DD"
                                allowClear={false}
                                style={{
                                    width: 140,
                                    borderColor: isStepOverdue(item) ? '#ff4d4f' : undefined,
                                    background: isStepOverdue(item) ? '#fff1f0' : undefined,
                                }}
                                suffixIcon={<CalendarOutlined />}
                            />
                        </List.Item>
                    )}
                />
                {currentOrder?.status === 'completed' && <div style={{color: 'green', marginTop: 10, textAlign: 'center'}}>✔ Đơn hàng đã hoàn tất!</div>}
            </Modal>
            

            {/* MODAL 1: TẠO LỆNH (CẬP NHẬT: GHI CHÚ NVL) */}
            <Modal title="Lên Mẫu Mới & Sản Xuất" open={isOrderModalOpen} onCancel={() => setIsOrderModalOpen(false)} footer={null} width={1680} style={{ top: 16 }}>
                <Form layout="vertical" form={orderForm} onFinish={handleCreateQuickOrder} onValuesChange={onFormValuesChange}>
                    <Row gutter={[24, 16]}>
                        <Col xs={24} lg={5}>
                            <Card size="small" title="1. Thông tin Chung" bordered={false} style={{background: '#f9f9f9', marginBottom: 16}}>
                                <Form.Item label="Mã Lệnh" name="code" rules={[{ required: true }]}><Input placeholder="LSX-001" maxLength={70} /></Form.Item>
                                <Form.Item label="Nhãn/Kho tổng quản lý" name="owner_central_id" rules={[{ required: true, message: 'Chọn kho tổng quản lý' }]}>
                                    <Select placeholder="Chọn kho tổng">
                                        {centralOptions.map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                                <Form.Item label="Xưởng May" name="warehouse_id" rules={[{ required: true }]}>
                                    <Select placeholder="Chọn xưởng">
                                        {warehouses
                                            .filter(w => w.type_name !== 'Kho Tổng')
                                            .map(w => <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>)}
                                    </Select>
                                </Form.Item>
                                <Form.Item label="Tên SP" name="new_product_name" rules={[{ required: true }]}><Input /></Form.Item>
                                <Form.Item label="Mã SKU" name="new_product_sku" rules={[{ required: true }]}><Input /></Form.Item>
                                <Row gutter={10}><Col span={12}><Form.Item label="Bắt đầu" name="start_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item label="Hạn xong" name="due_date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col></Row>
                            </Card>
                            <Card size="small" title="Hình ảnh Mẫu" bordered={false} style={{background: '#fff7e6', border: '1px solid #ffd591'}}><Upload customRequest={handleUpload} listType="picture-card" fileList={fileList} onChange={handleFileChange}>{fileList.length >= 5 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}</Upload></Card>
                        </Col>
                        <Col xs={24} lg={19}>
                            <Card size="small" title="2. Bảng định mức NVL" bordered={false} style={{background: '#f9f9f9', height: '100%'}}>
                                <Form.List name="materials">
                                    {(fields, { add, remove }) => (
                                        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1400 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 430 }}>SKU nguyên vật liệu</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 170 }}>SKU SP</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 150 }}>Tên</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 170 }}>Ghi chú SKU SP</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 200 }}>Ghi chú NPL</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 120 }}>Đơn vị tính</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 160 }}>Định mức tiêu hao</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 160 }}>Số lượng SP</th>
                                                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 180 }}>Tổng NPL cần dùng</th>
                                                        <th style={{ width: 40, borderBottom: '1px solid #f0f0f0' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fields.map(({ key, name, ...restField }) => (
                                                        <tr key={key}>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'material_variant_id']}
                                                                    rules={[{ required: true, message: 'Chọn NVL' }]}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <Select
                                                                        placeholder="Chọn NVL..."
                                                                        showSearch
                                                                        filterOption={(input, option) =>
                                                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                                                        }
                                                                        dropdownMatchSelectWidth={false}
                                                                        size="middle"
                                                                    >
                                                                        {warehouseMaterials.map(p => (
                                                                            <Select.Option
                                                                                key={p.id}
                                                                                value={p.id}
                                                                                label={`${p.sku} ${p.variant_name}`}
                                                                            >
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '500px' }}>
                                                                                    <span>
                                                                                        <b style={{ color: '#1677ff' }}>[{p.sku}]</b> {p.variant_name}
                                                                                        {p.color && <Tag color="magenta" style={{ marginLeft: 5 }}>{p.color}</Tag>}
                                                                                        {p.note && <span style={{ color: '#888', fontSize: 12 }}> ({p.note})</span>}
                                                                                    </span>
                                                                                    <span style={{ color: p.quantity_on_hand > 0 ? 'green' : 'red', fontWeight: 'bold' }}>
                                                                                        Tồn: {p.quantity_on_hand}
                                                                                    </span>
                                                                                </div>
                                                                            </Select.Option>
                                                                        ))}
                                                                    </Select>
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'sku_sp']}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <Input placeholder="VD: HD26ub27-9-12m" />
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'sku_sp_name']}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <Input placeholder="Tên SKU SP (không bắt buộc)" />
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'sku_sp_note']}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <Input placeholder="Ghi chú SKU SP" />
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'npl_note']}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <Input placeholder="Ghi chú NPL" />
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item shouldUpdate noStyle>
                                                                    {({ getFieldValue }) => {
                                                                        const materialId = getFieldValue(['materials', name, 'material_variant_id']);
                                                                        const mat = getMaterialById(materialId);
                                                                        return <Input value={mat?.unit || '-'} disabled />;
                                                                    }}
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'consumption_rate']}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <InputNumber min={0} step={0.0001} style={{ width: '100%' }} placeholder="VD: 1.2" />
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item
                                                                    {...restField}
                                                                    name={[name, 'product_quantity']}
                                                                    style={{ marginBottom: 0 }}
                                                                >
                                                                    <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="VD: 500" />
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ padding: '8px 8px' }}>
                                                                <Form.Item shouldUpdate noStyle>
                                                                    {({ getFieldValue }) => {
                                                                        const consumptionRate = getFieldValue(['materials', name, 'consumption_rate']);
                                                                        const productQuantity = getFieldValue(['materials', name, 'product_quantity']);
                                                                        const requiredQty = calculateRequiredQuantity(consumptionRate, productQuantity);
                                                                        return <InputNumber value={requiredQty} disabled style={{ width: '100%' }} />;
                                                                    }}
                                                                </Form.Item>
                                                            </td>
                                                            <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                                                                <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red', cursor: 'pointer' }} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>
                                                Thêm dòng định mức
                                            </Button>
                                        </div>
                                    )}
                                </Form.List>
                                <Divider style={{margin: '12px 0'}} />
                                
                                <Row gutter={8}>
                                    <Col span={8}><Form.Item label="Gia công" name="labor_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col>
                                    <Col span={8}><Form.Item label="In ấn" name="print_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col>
                                    <Col span={8}><Form.Item label="Vận chuyển" name="shipping_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col>
                                    <Col span={8}><Form.Item label="Đóng gói" name="packaging_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col>
                                    <Col span={8}><Form.Item label="Marketing" name="marketing_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col>
                                    <Col span={8}><Form.Item label="Phụ phí khác" name="other_fee" initialValue={0}><Input type="number" suffix="₫" /></Form.Item></Col>
                                </Row>
                                
                                <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #d9d9d9', textAlign: 'center' }}>
                                    {canViewCreateCost ? (
                                        <Statistic title="Giá vốn ƯỚC TÍNH (1 SP)" value={estimatedCost} precision={0} valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} suffix="₫" />
                                    ) : (
                                        <Statistic title="Giá vốn ƯỚC TÍNH (1 SP)" value="***" valueStyle={{ color: '#999' }} />
                                    )}
                                </div>
                                <div style={{marginTop: 20}}><Form.Item name="auto_start" valuePropName="checked"><Checkbox>Xuất kho vải & Chạy ngay?</Checkbox></Form.Item></div>
                            </Card>
                        </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading} style={{marginTop: 16}}>Xác nhận</Button>
                </Form>
            </Modal>

            {/* Modal Sửa (Edit) */}
            <Modal title="Cập nhật Thông tin, Chi phí & NVL" open={isEditModalOpen} onCancel={() => setIsEditModalOpen(false)} width={isEditNewOrder ? 1680 : 1000} footer={null} style={{top: 20}}>
                <Form layout="vertical" form={editForm} onFinish={handleUpdateOrder}>
                    
                    {/* --- 1. THÔNG TIN CHUNG --- */}
                    <Row gutter={16}>
                        <Col span={8}><Form.Item label="Mã Lệnh" name="code"><Input disabled /></Form.Item></Col>
                        <Col span={8}><Form.Item label="Mã SKU Sản phẩm" name="new_sku" rules={[{ required: true }]}><Input /></Form.Item></Col>
                        <Col span={6}><Form.Item label="Tên Sản Phẩm" name="new_product_name" rules={[{ required: true }]}><Input /></Form.Item></Col>
                        <Col span={8}>
                             <Row gutter={8}>
                                <Col span={12}><Form.Item label="Bắt đầu" name="start_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col>
                                <Col span={12}><Form.Item label="Hạn xong" name="due_date"><DatePicker style={{width:'100%'}}/></Form.Item></Col>
                             </Row>
                        </Col>
                    </Row>
                    
                    {/* --- 2. HÌNH ẢNH --- */}
                    <Divider orientation="left">Hình ảnh mẫu</Divider>
                    <Upload
                        customRequest={handleUpload}
                        listType="picture-card"
                        fileList={fileList}
                        onChange={handleFileChange}
                        onRemove={(file) => {
                            const newFileList = fileList.filter(item => item.uid !== file.uid);
                            setFileList(newFileList);
                        }}
                    >
                        {fileList.length >= 5 ? null : (
                            <div>
                                <PlusOutlined />
                                <div style={{ marginTop: 8 }}>Tải ảnh</div>
                            </div>
                        )}
                    </Upload>

                    {isEditNewOrder ? (
                        <>
                            <Divider orientation="left">Bảng định mức NVL (Sửa nhanh theo SKU SP)</Divider>
                            <Form.List name="edit_material_rows">
                                {(fields, { add, remove }) => (
                                    <div style={{ maxHeight: 380, overflowY: 'auto', overflowX: 'auto', marginBottom: 20 }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1450 }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 280 }}>SKU nguyên vật liệu</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 170 }}>SKU SP</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 150 }}>Tên</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 170 }}>Ghi chú SKU SP</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 200 }}>Ghi chú NPL</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 120 }}>Đơn vị tính</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 160 }}>Định mức tiêu hao</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 160 }}>Số lượng SP</th>
                                                    <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', width: 180 }}>Tổng NVL cần</th>
                                                    <th style={{ width: 40, borderBottom: '1px solid #f0f0f0' }}></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fields.map(({ key, name, ...restField }) => (
                                                    <tr key={key}>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'id']} hidden>
                                                                <Input />
                                                            </Form.Item>
                                                            <Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true, message: 'Chọn NVL' }]} style={{ marginBottom: 0 }}>
                                                                <Select placeholder="Chọn NVL..." showSearch filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}>
                                                                    {warehouseMaterials.map(p => (
                                                                        <Select.Option key={p.id} value={p.id} label={`${p.sku} ${p.variant_name}`}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '500px' }}>
                                                                                <span><b style={{ color: '#1677ff' }}>[{p.sku}]</b> {p.variant_name}</span>
                                                                                <span style={{ color: p.quantity_on_hand > 0 ? 'green' : 'red', fontWeight: 'bold' }}>Tồn: {p.quantity_on_hand}</span>
                                                                            </div>
                                                                        </Select.Option>
                                                                    ))}
                                                                </Select>
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'sku_sp']} style={{ marginBottom: 0 }}>
                                                                <Input placeholder="VD: HD26ub27-9-12m" />
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'sku_sp_name']} style={{ marginBottom: 0 }}>
                                                                <Input placeholder="Tên SKU SP" />
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'sku_sp_note']} style={{ marginBottom: 0 }}>
                                                                <Input placeholder="Ghi chú SKU SP" />
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'npl_note']} style={{ marginBottom: 0 }}>
                                                                <Input placeholder="Ghi chú NPL" />
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item shouldUpdate noStyle>
                                                                {({ getFieldValue }) => {
                                                                    const materialId = getFieldValue(['edit_material_rows', name, 'material_variant_id']);
                                                                    const mat = getMaterialById(materialId);
                                                                    return <Input value={mat?.unit || '-'} disabled />;
                                                                }}
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'consumption_rate']} style={{ marginBottom: 0 }}>
                                                                <InputNumber min={0} step={0.0001} style={{ width: '100%' }} placeholder="VD: 1.2" />
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item {...restField} name={[name, 'product_quantity']} style={{ marginBottom: 0 }}>
                                                                <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="VD: 500" />
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ padding: '8px 8px' }}>
                                                            <Form.Item shouldUpdate noStyle>
                                                                {({ getFieldValue }) => {
                                                                    const consumptionRate = getFieldValue(['edit_material_rows', name, 'consumption_rate']);
                                                                    const productQuantity = getFieldValue(['edit_material_rows', name, 'product_quantity']);
                                                                    const requiredQty = calculateRequiredQuantity(consumptionRate, productQuantity);
                                                                    return <InputNumber value={requiredQty} disabled style={{ width: '100%' }} />;
                                                                }}
                                                            </Form.Item>
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                                                            <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red', cursor: 'pointer' }} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>
                                            Thêm dòng định mức
                                        </Button>
                                    </div>
                                )}
                            </Form.List>
                        </>
                    ) : (
                        <>
                            {/* --- 3. BẢNG SỬA SIZE & SỐ LƯỢNG (ĐƠN CŨ) --- */}
                            <Divider orientation="left">Chi tiết Size & Số lượng</Divider>
                            <Form.List name="sizes">
                                {(fields, { add, remove }) => (
                                    <div style={{marginBottom: 20}}>
                                        <Row gutter={[12, 12]}>
                                            {fields.map(({ key, name, ...restField }) => (
                                                <Col span={12} key={key}>
                                                    <Card size="small" style={{background: '#f9f9f9', border: '1px solid #d9d9d9'}} extra={<DeleteOutlined onClick={() => remove(name)} style={{color: 'red', cursor: 'pointer'}} title="Xóa size này" />}>
                                                        <Space direction="vertical" style={{width: '100%'}} size="small">
                                                            <Form.Item name={[name, 'id']} hidden><Input /></Form.Item>
                                                            <div style={{display: 'flex', gap: 10}}>
                                                                <Form.Item {...restField} name={[name, 'size']} label="Size" style={{marginBottom: 0, flex: 1}} rules={[{required: true, message: 'Thiếu size'}]}>
                                                                    <AutoComplete options={sizeStandardOptions} placeholder="Chọn size có sẵn hoặc gõ tay (hoạ tiết, mã riêng...)" style={{ width: '100%' }} filterOption={(inputValue, option) => (option?.value ?? '').toLowerCase().includes(String(inputValue).toLowerCase())} allowClear />
                                                                </Form.Item>
                                                                <Form.Item {...restField} name={[name, 'quantity']} label="SL" style={{marginBottom: 0, width: 100}} rules={[{required: true}]}>
                                                                    <InputNumber style={{width: '100%'}} min="0" step="0.0001" stringMode formatter={value => { if (!value) return ''; const strValue = `${value}`; const parts = strValue.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return parts.join('.'); }} parser={value => value.replace(/\$\s?|(,*)/g, '')} />
                                                                </Form.Item>
                                                            </div>
                                                            <Form.Item {...restField} name={[name, 'note']} label="Ghi chú" style={{marginBottom: 0}}>
                                                                <Input placeholder="Note cho size này" />
                                                            </Form.Item>
                                                        </Space>
                                                    </Card>
                                                </Col>
                                            ))}
                                            <Col span={12}>
                                                <Button type="dashed" onClick={() => add()} style={{width: '100%', height: '100%', minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}} icon={<PlusOutlined style={{fontSize: 24}} />}>
                                                    Thêm Size Mới
                                                </Button>
                                            </Col>
                                        </Row>
                                    </div>
                                )}
                            </Form.List>

                            {/* --- 4. BẢNG SỬA NVL (ĐƠN CŨ) --- */}
                            <Divider orientation="left">Điều chỉnh Nguyên Phụ Liệu (Tự động trừ/cộng kho)</Divider>
                            <Form.List name="materials">
                        {(fields, { add, remove }) => (
                            <div style={{background: '#fafafa', padding: 10, borderRadius: 8, marginBottom: 20, border: '1px solid #f0f0f0', maxHeight: 300, overflowY: 'auto'}}>
                                <table style={{width: '100%'}}>
                                    <thead>
                                        <tr>
                                            <th>Tên Vật Tư</th>
                                            <th width="120">Số lượng</th>
                                            <th>Ghi chú</th>
                                            <th width="30"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Form.Item
                                                key={key}
                                                shouldUpdate={(prev, curr) =>
                                                    prev.materials?.[name]?.deleted !== curr.materials?.[name]?.deleted
                                                }
                                                noStyle
                                            >
                                                {({ getFieldValue }) => {
                                                    const isDeleted = !!getFieldValue(['materials', name, 'deleted']);
                                                    if (isDeleted) return null;

                                                    return (
                                                        <tr>
                                                {/* CỘT TÊN NVL */}
                                                <td style={{padding: 5}}>
                                                    <Form.Item name={[name, 'id']} hidden><Input /></Form.Item>
                                                    <Form.Item name={[name, 'deleted']} hidden><Input /></Form.Item>
                                                    
                                                    <Form.Item shouldUpdate={(prev, curr) => prev.materials?.[name]?.id !== curr.materials?.[name]?.id} noStyle>
                                                        {({ getFieldValue }) => {
                                                            const itemId = getFieldValue(['materials', name, 'id']);
                                                            return itemId ? (
                                                                <span>
                                                                    <Tag>{getFieldValue(['materials', name, 'sku'])}</Tag> 
                                                                    <b>{getFieldValue(['materials', name, 'name'])}</b>
                                                                </span>
                                                            ) : (
                                                                <Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true, message: 'Chọn NVL' }]} style={{marginBottom: 0}}>
                                                                    <Select placeholder="Chọn thêm NVL..." showSearch optionFilterProp="children" style={{width: '100%'}}>
                                                                        {warehouseMaterials.map(m => (
                                                                            <Select.Option key={m.id} value={m.id}>
                                                                                {m.sku} - {m.variant_name} (Tồn: {m.quantity_on_hand})
                                                                            </Select.Option>
                                                                        ))}
                                                                    </Select>
                                                                </Form.Item>
                                                            );
                                                        }}
                                                    </Form.Item>
                                                </td>

                                                {/* CỘT SỐ LƯỢNG (HIỂN THỊ SỐ ĐẸP & TRÁNH NHẢY SỐ) */}
                                                <td style={{padding: 5}}>
                                                    <Form.Item 
                                                        {...restField} 
                                                        name={[name, 'quantity']} 
                                                        style={{marginBottom: 0}} 
                                                        rules={[{ required: true, message: 'Nhập SL' }]}
                                                    >
                                                        <InputNumber 
                                                            style={{width: '100%'}} 
                                                            min="0"
                                                            step="0.0001" 
                                                            stringMode 
                                                            
                                                            // --- SỬA ĐOẠN FORMATTER NÀY ---
                                                            formatter={value => {
                                                                if (!value) return '';
                                                                const strValue = `${value}`;
                                                                const parts = strValue.split('.'); // Tách phần nguyên và phần thập phân
                                                                
                                                                // Chỉ thêm dấu phẩy hàng nghìn cho phần nguyên (parts[0])
                                                                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                                                
                                                                // Gộp lại (Nếu có phần thập phân thì nối vào)
                                                                return parts.join('.');
                                                            }}
                                                            // -----------------------------

                                                            parser={value => value.replace(/\$\s?|(,*)/g, '')} // Xóa dấu phẩy khi lưu giá trị
                                                        />
                                                    </Form.Item>
                                                </td>

                                                {/* CỘT GHI CHÚ */}
                                                <td style={{padding: 5}}>
                                                    <Form.Item {...restField} name={[name, 'note']} style={{marginBottom: 0}}>
                                                        <Input placeholder="Note" />
                                                    </Form.Item>
                                                </td>

                                                {/* CỘT XÓA (Chỉ hiện cho dòng mới) */}
                                                <td style={{textAlign: 'center'}}>
                                                    <Form.Item shouldUpdate={(prev, curr) => prev.materials?.[name]?.id !== curr.materials?.[name]?.id} noStyle>
                                                        {({ getFieldValue, setFieldValue }) => {
                                                            const existingId = getFieldValue(['materials', name, 'id']);
                                                            if (!existingId) {
                                                                return (
                                                                    <DeleteOutlined
                                                                        onClick={() => remove(name)}
                                                                        style={{ color: 'red', cursor: 'pointer' }}
                                                                        title="Xóa dòng NVL này"
                                                                    />
                                                                );
                                                            }

                                                            return (
                                                                <Popconfirm
                                                                    title="Xóa nguyên phụ liệu?"
                                                                    description="Hệ thống sẽ hoàn nguyên NVL về kho sau khi bạn bấm Lưu."
                                                                    okText="Xóa"
                                                                    cancelText="Hủy"
                                                                    onConfirm={() => {
                                                                        // Không remove dòng khỏi form để backend nhận được `id` và hoàn kho.
                                                                        setFieldValue(['materials', name, 'quantity'], 0);
                                                                        setFieldValue(['materials', name, 'deleted'], true);
                                                                        message.info("Đã đánh dấu xóa NVL. Bấm 'Lưu Thay Đổi' để hoàn kho.");
                                                                    }}
                                                                >
                                                                    <DeleteOutlined
                                                                        style={{ color: 'red', cursor: 'pointer' }}
                                                                        title="Xóa & hoàn kho"
                                                                    />
                                                                </Popconfirm>
                                                            );
                                                        }}
                                                    </Form.Item>
                                                </td>
                                                        </tr>
                                                    );
                                                }}
                                            </Form.Item>
                                        ))}
                                        <tr>
                                            <td colSpan={4} style={{textAlign: 'center', paddingTop: 10}}>
                                                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />}>Thêm NVL bổ sung</Button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                            </Form.List>
                        </>
                    )}

                    {/* --- 5. CHI PHÍ --- */}
                    <Divider orientation="left">Cập nhật Chi phí</Divider>
                    <Row gutter={16}>
                        <Col span={8}><Form.Item label="Gia công" name="labor_fee"><Input type="number" suffix="₫" /></Form.Item></Col>
                        <Col span={8}><Form.Item label="In/Thêu" name="print_fee"><Input type="number" suffix="₫" /></Form.Item></Col>
                        <Col span={8}><Form.Item label="Vận Chuyển" name="shipping_fee"><Input type="number" suffix="₫" /></Form.Item></Col>
                        <Col span={8}><Form.Item label="Marketing" name="marketing_fee"><Input type="number" suffix="₫" /></Form.Item></Col>
                        <Col span={8}><Form.Item label="Đóng Gói" name="packaging_fee"><Input type="number" suffix="₫" /></Form.Item></Col>
                        <Col span={8}><Form.Item label="Phụ phí" name="other_fee"><Input type="number" suffix="₫" /></Form.Item></Col>
                    </Row>
                    <Row>
                        <Col span={24}>
                            <Form.Item label="Ghi chú chung (Phụ phí/Đơn hàng)" name="note">
                                <Input.TextArea rows={2} placeholder="Nhập ghi chú cho đơn hàng này..." />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Button type="primary" htmlType="submit" block size="large">Lưu Thay Đổi</Button>
                </Form>
            </Modal>

            <Modal
                title={`📦 Nhập Kho Thành Phẩm (Trả hàng) - ${currentOrder?.code}`}
                open={isReceiveModalOpen}
                onCancel={() => setIsReceiveModalOpen(false)}
                onOk={handleReceiveGoods}
                width={920}
            >
                <Table
                    dataSource={orderSizes}
                    pagination={false}
                    rowKey="id"
                    size="small"
                    bordered
                    scroll={{ x: 860 }}
                    columns={[
                        { title: receiveLineLabel, dataIndex: 'size', align: 'center', width: 120 },
                        {
                            title: 'Ghi chú',
                            dataIndex: 'note',
                            width: 200,
                            ellipsis: true,
                            render: (t) => <span style={{ color: '#888', fontSize: 12 }}>{t}</span>,
                        },
                        { title: 'Kế hoạch', dataIndex: 'planned', align: 'center', width: 80 },
                        { title: 'Đã trả', dataIndex: 'finished', align: 'center', width: 80, render: t => <span style={{color: 'blue'}}>{t}</span> },
                        {
                            title: 'Nhập Đợt Này',
                            width: 180,
                            render: (_, r, idx) => (
                                <Input
                                    type="number"
                                    min={0}
                                    size="large"
                                    style={{ width: 140 }}
                                    value={r.receiving}
                                    onChange={(val) => {
                                        const n = [...orderSizes];
                                        n[idx].receiving = Number(val.target.value);
                                        setOrderSizes(n);
                                    }}
                                />
                            )
                        },
                        {
                            title: 'Mã',
                            dataIndex: 'inventory_code',
                            width: 220,
                            align: 'center',
                            render: (_, r, idx) => (
                                <Input
                                    placeholder="Nhập mã kiểm tồn"
                                    size="large"
                                    value={r.inventory_code}
                                    onChange={(e) => {
                                        const n = [...orderSizes];
                                        n[idx].inventory_code = e.target.value;
                                        setOrderSizes(n);
                                    }}
                                />
                            )
                        },
                    ]}
                />
            </Modal>
            <Modal title="📜 Lịch Sử Nhập Hàng" open={isHistoryModalOpen} onCancel={() => setIsHistoryModalOpen(false)} footer={null}><Table dataSource={historyData} pagination={{ pageSize: 5 }} rowKey={(r, i) => i} size="small" columns={[{ title: 'Thời gian', dataIndex: 'date', width: 140 }, { title: 'Size', dataIndex: 'size', width: 80, align: 'center', render: t => <b>{t}</b> }, { title: 'Ghi chú', dataIndex: 'note', render: t => <span style={{fontSize: 12, color: '#888'}}>{t}</span> }, { title: 'Số lượng trả', dataIndex: 'quantity', align: 'center', render: q => <Tag color="green">+{q}</Tag> }, {title: 'Còn thiếu', dataIndex: 'remaining', align: 'center', render: r => <b style={{color: r > 0 ? 'red' : 'gray'}}>{r}</b> }]} /></Modal>
{/* --- MODAL XEM TRƯỚC IN ẤN (3 BẢNG RIÊNG BIỆT) --- */}
            <Modal
                open={isPrintModalOpen}
                onCancel={() => setIsPrintModalOpen(false)}
                footer={[
                    <Button key="close" onClick={() => setIsPrintModalOpen(false)}>Đóng</Button>,
                    <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printContent} loading={isExportingPdf}>
                        In Ngay
                    </Button>
                ]}
                width={950}
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

                        {/* ẢNH MẪU */}
                        {printData.images && printData.images.length > 0 && (
                            <div style={{ marginBottom: 20, textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {printData.images.map((url, idx) => (
                                        <img key={idx} src={`${BASE_URL}${url}`} alt="Mẫu" style={{ maxHeight: 180, border: '1px solid #ddd', padding: 2, borderRadius: 4 }} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* BẢNG 1: SIZE & SỐ LƯỢNG (GIỮ CŨ) / TỔNG SẢN LƯỢNG (ĐƠN MỚI) */}
                        {(printData.is_compact_order && !printData.use_sku_sp_mode) ? (
                            <>
                                <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: 5, marginTop: 0 }}>1. TỔNG SỐ LƯỢNG SẢN XUẤT</h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #333' }}>
                                    <thead style={{ background: '#f5f5f5' }}>
                                        <tr>
                                            <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>Chỉ tiêu</th>
                                            <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>Số lượng</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}><b>Tổng sản lượng</b></td>
                                            <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{printData.total_qty}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </>
                        ) : (
                            <>
                                <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: 5, marginTop: 0 }}>
                                    1. CHI TIẾT {printData.use_sku_sp_mode ? 'SKU SP' : 'SIZE'} & SỐ LƯỢNG
                                </h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #333' }}>
                                    <thead style={{ background: '#f5f5f5' }}>
                                        <tr>
                                            <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>{printData.use_sku_sp_mode ? 'SKU SP' : 'Size'}</th>
                                            {printData.use_sku_sp_mode && (
                                                <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>Tên</th>
                                            )}
                                            <th style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>Số lượng đặt</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {printData.sizes.map((s, idx) => (
                                            <tr key={idx}>
                                                <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}><b>{s.size}</b></td>
                                                {printData.use_sku_sp_mode && (
                                                    <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center' }}>{s.sku_sp_name || ''}</td>
                                                )}
                                                <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{s.qty}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}

                        {/* BẢNG 2: ĐỊNH MỨC NVL (SẢN XUẤT - CHỈ HIỆN SỐ LƯỢNG) */}
                        <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: 5 }}>2. BẢNG CẤP NGUYÊN VẬT LIỆU (SẢN XUẤT)</h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #333' }}>
                            <thead style={{ background: '#f5f5f5' }}>
                                <tr>
                                    <th style={{ border: '1px solid #333', padding: '8px' }}>Tên Vật Tư</th>
                                    <th style={{ border: '1px solid #333', padding: '8px', width: '20%', textAlign: 'center' }}>Tổng cấp</th>
                                    <th style={{ border: '1px solid #333', padding: '8px', width: '30%' }}>Ghi chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.materials.map((m, idx) => (
                                    <tr key={idx}>
                                        <td style={{ border: '1px solid #333', padding: '8px' }}>{m.name} <span style={{fontSize: 12, color: '#666'}}>({m.sku})</span></td>
                                        <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '15px' }}>
                                            {new Intl.NumberFormat('vi-VN').format(m.total_needed)}
                                        </td>
                                        <td style={{ border: '1px solid #333', padding: '8px' }}>{m.note || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* BẢNG 3: TÀI CHÍNH (KẾ TOÁN - PHỤ THUỘC QUYỀN XEM GIÁ) */}
                        {(printData?.can_view_cost ?? canViewMaterialCostForBrand(user, printData?.owner_brand_id)) ? (
                            <>
                                <h4 style={{ borderBottom: '1px solid #ccc', paddingBottom: 5 }}>3. BẢNG TÍNH CHI PHÍ & GIÁ VỐN (KẾ TOÁN)</h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, border: '1px solid #333' }}>
                                    <thead style={{ background: '#f5f5f5' }}>
                                        <tr>
                                            <th style={{ border: '1px solid #333', padding: '8px' }}>Khoản mục chi phí</th>
                                            <th style={{ border: '1px solid #333', padding: '8px', width: '20%', textAlign: 'right' }}>Đơn giá vốn</th>
                                            <th style={{ border: '1px solid #333', padding: '8px', width: '20%', textAlign: 'right' }}>Thành tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* List NVL có giá */}
                                        {printData.materials.map((m, idx) => (
                                            <tr key={idx}>
                                                <td style={{ border: '1px solid #333', padding: '8px' }}>{m.name}</td>
                                                <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}>
                                                    {new Intl.NumberFormat('vi-VN').format(m.unit_cost)}
                                                </td>
                                                <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}>
                                                    {new Intl.NumberFormat('vi-VN').format(m.total_cost)}
                                                </td>
                                            </tr>
                                        ))}
                                        
                                        <tr style={{background: '#fafafa', fontWeight: 'bold'}}>
                                            <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}>Tổng tiền NVL:</td>
                                            <td style={{ border: '1px solid #333' }}></td>
                                            <td style={{ border: '1px solid #333', padding: '8px', textAlign: 'right' }}>
                                                {new Intl.NumberFormat('vi-VN').format(printData.total_material_cost)}
                                            </td>
                                        </tr>

                                        {/* Các chi phí khác */}
                                        <tr><td style={{border: '1px solid #333', padding: '8px'}}>Phí Gia Công</td><td style={{border: '1px solid #333'}}></td><td style={{border: '1px solid #333', textAlign: 'right', padding: '8px'}}>{new Intl.NumberFormat('vi-VN').format(printData.labor_fee)}</td></tr>
                                        <tr><td style={{border: '1px solid #333', padding: '8px'}}>Phí In/Thêu</td><td style={{border: '1px solid #333'}}></td><td style={{border: '1px solid #333', textAlign: 'right', padding: '8px'}}>{new Intl.NumberFormat('vi-VN').format(printData.print_fee)}</td></tr>
                                        <tr><td style={{border: '1px solid #333', padding: '8px'}}>Phí Vận Chuyển</td><td style={{border: '1px solid #333'}}></td><td style={{border: '1px solid #333', textAlign: 'right', padding: '8px'}}>{new Intl.NumberFormat('vi-VN').format(printData.shipping_fee)}</td></tr>
                                        <tr><td style={{border: '1px solid #333', padding: '8px'}}>Phí Marketing</td><td style={{border: '1px solid #333'}}></td><td style={{border: '1px solid #333', textAlign: 'right', padding: '8px'}}>{new Intl.NumberFormat('vi-VN').format(printData.marketing_fee)}</td></tr>
                                        <tr><td style={{border: '1px solid #333', padding: '8px'}}>Phí Đóng Gói</td><td style={{border: '1px solid #333'}}></td><td style={{border: '1px solid #333', textAlign: 'right', padding: '8px'}}>{new Intl.NumberFormat('vi-VN').format(printData.packaging_fee)}</td></tr>
                                        <tr><td style={{border: '1px solid #333', padding: '8px'}}>Phụ phí khác</td><td style={{border: '1px solid #333'}}></td><td style={{border: '1px solid #333', textAlign: 'right', padding: '8px'}}>{new Intl.NumberFormat('vi-VN').format(printData.other_fee)}</td></tr>

                                        {/* TỔNG KẾT */}
                                        <tr style={{ background: '#e6f7ff', fontSize: 16 }}>
                                            <td style={{ border: '1px solid #333', padding: '10px' }}><b>TỔNG CHI PHÍ:</b></td>
                                            <td style={{ border: '1px solid #333' }}></td>
                                            <td style={{ border: '1px solid #333', padding: '10px', textAlign: 'right', color: '#d4380d' }}>
                                                <b>
                                                    {new Intl.NumberFormat('vi-VN').format(
                                                        printData.total_material_cost + 
                                                        (printData.labor_fee||0) +
                                                        (printData.print_fee||0) +
                                                        (printData.shipping_fee||0) +
                                                        (printData.packaging_fee||0) +
                                                        (printData.marketing_fee||0) +
                                                        (printData.other_fee||0)
                                                    )}
                                                </b>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                
                                {/* GIÁ VỐN ĐƠN VỊ */}
                                <div style={{ marginTop: 15, textAlign: 'right' }}>
                                    <div
                                        style={{
                                            display: 'inline-block',
                                            border: '1px solid #91caff',
                                            background: '#e6f4ff',
                                            color: '#0958d9',
                                            borderRadius: 6,
                                            fontSize: 16,
                                            padding: '8px 15px',
                                            maxWidth: '100%',
                                            whiteSpace: 'normal',
                                        }}
                                    >
                                        GIÁ VỐN / 1 SP: <b>{new Intl.NumberFormat('vi-VN').format(
                                            printData.total_qty > 0
                                                ? (
                                                    printData.total_material_cost +
                                                    (printData.labor_fee || 0) +
                                                    (printData.print_fee || 0) +
                                                    (printData.shipping_fee || 0) +
                                                    (printData.packaging_fee || 0) +
                                                    (printData.marketing_fee || 0) +
                                                    (printData.other_fee || 0)
                                                ) / printData.total_qty
                                                : 0
                                        )} ₫</b>
                                    </div>
                                </div>
                            </>
                        ) : null}

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