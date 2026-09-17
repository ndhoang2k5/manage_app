import React, { useEffect, useRef, useState } from 'react';
import {
    Card,
    Button,
    DatePicker,
    Input,
    InputNumber,
    Select,
    Switch,
    Table,
    Tag,
    Upload,
    message,
} from 'antd';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import salesManagementApi from '../api/salesManagementApi';
import { getStoredUser, canManageModule } from '../utils/permissions';
import AccessModeBadge from '../components/AccessModeBadge';
import HouseholdSalesPanel from '../components/HouseholdSalesPanel';

const SALES_BRANDS = [
    { key: 'unbee', label: 'Unbee', color: '#1677ff' },
    { key: 'himomi', label: 'Himomi', color: '#eb2f96' },
    { key: 'ranbee', label: 'Ranbee', color: '#722ed1' },
];

const HOUSEHOLD_MODE_KEY = 'household';
const SALES_PAGE_SIZE_OPTIONS = ['20', '50', '100', '200'];
const DEFAULT_SALES_SORT = { sort_by: 'sold_qty', sort_dir: 'desc' };
const SORTABLE_FIELDS = new Set(['code', 'sold_qty', 'sold_revenue', 'current_stock', 'shops_count']);

const HOUSEHOLDS = [
    { key: 'le_doan_bac', label: 'Hộ kinh doanh Lê Doãn Bắc', color: '#08979c' },
    { key: 'unbeekid', label: 'Hộ kinh doanh UnbeeKid', color: '#d48806' },
];

const SalesManagementPage = () => {
    const user = getStoredUser();
    const canManageSales = canManageModule(user, 'sales-management');
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [salesRange, setSalesRange] = useState([dayjs().subtract(29, 'day').startOf('day'), dayjs()]);
    const [salesData, setSalesData] = useState([]);
    const [salesTotal, setSalesTotal] = useState(0);
    const [salesLoading, setSalesLoading] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [priorityInput, setPriorityInput] = useState('');
    const [topN, setTopN] = useState(0);
    const [salesPagination, setSalesPagination] = useState({ current: 1, pageSize: 50 });
    const [salesSort, setSalesSort] = useState(DEFAULT_SALES_SORT);
    const [salesFilters, setSalesFilters] = useState({
        keyword: '',
        min_qty: 0,
        min_revenue: 0,
        only_priority_codes: false,
        shop_id: null,
    });
    const [shopOptions, setShopOptions] = useState([]);
    const actionLockRef = useRef(false);

    const runExclusive = async (fn) => {
        if (actionLockRef.current) return;
        actionLockRef.current = true;
        setSalesLoading(true);
        try {
            await fn();
        } finally {
            setSalesLoading(false);
            actionLockRef.current = false;
        }
    };

    const parseCodesFromText = (raw) =>
        Array.from(new Set(
            String(raw || '')
                .split(/[\n,;\t ]+/)
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean)
        ));

    const fetchPriorityCodes = async () => {
        if (!selectedBrand) return;
        try {
            const res = await salesManagementApi.getPriorityCodes({ brand_key: selectedBrand });
            const codes = (res?.data?.data || []).map((item) => item.code);
            setPriorityInput(codes.join('\n'));
        } catch (error) {
            // Skip to avoid blocking UI.
        }
    };

    const fetchShopOptions = async () => {
        if (!selectedBrand) return;
        try {
            const res = await salesManagementApi.getShops({ brand_key: selectedBrand });
            setShopOptions(res?.data?.data || []);
        } catch (error) {
            setShopOptions([]);
        }
    };

    const fetchSalesReport = async ({
        page = salesPagination.current,
        pageSize = salesPagination.pageSize,
        filters = salesFilters,
        sort = salesSort,
    } = {}) => {
        if (!selectedBrand) return;
        try {
            const params = {
                brand_key: selectedBrand,
                time_start: salesRange?.[0]?.valueOf(),
                time_end: salesRange?.[1]?.valueOf(),
                page,
                page_size: pageSize,
                keyword: filters.keyword || undefined,
                min_qty: filters.min_qty || 0,
                min_revenue: filters.min_revenue || 0,
                only_priority_codes: filters.only_priority_codes || false,
                top_n: topN || 0,
                shop_id: filters.shop_id || undefined,
                sort_by: sort.sort_by,
                sort_dir: sort.sort_dir,
            };
            const res = await salesManagementApi.getReport(params);
            const payload = res?.data?.data || {};
            const items = payload.items || [];
            setSalesData(items);
            setSalesTotal(payload.total || 0);
            setSalesPagination({ current: payload.page || page, pageSize: payload.page_size || pageSize });
        } catch (error) {
            message.error(error.response?.data?.detail || 'Lỗi tải báo cáo số bán');
        }
    };

    const fetchSyncStatus = async () => {
        if (!selectedBrand) return;
        try {
            const res = await salesManagementApi.getSyncStatus({ brand_key: selectedBrand });
            setSyncStatus(res?.data?.data || null);
        } catch (error) {
            // Ignore status failure to avoid blocking.
        }
    };

    useEffect(() => {
        if (!selectedBrand || selectedBrand === HOUSEHOLD_MODE_KEY) return;
        setSalesFilters((s) => ({ ...s, shop_id: null }));
        setSalesSort(DEFAULT_SALES_SORT);
        fetchShopOptions();
        fetchPriorityCodes();
        fetchSyncStatus();
        fetchSalesReport({ page: 1, filters: { ...salesFilters, shop_id: null }, sort: DEFAULT_SALES_SORT });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBrand]);

    const handleRealtimeSyncNow = async () => {
        await runExclusive(async () => {
            const res = await salesManagementApi.syncNow({ brand_key: selectedBrand });
            const data = res?.data?.data || {};
            const salesSynced = data?.sales?.synced;
            const stockCount = data?.stock?.synced_count || 0;
            if (!salesSynced && !stockCount) {
                message.info('Chưa có dữ liệu mới để đồng bộ');
            } else if (!salesSynced && stockCount > 0) {
                message.success(`Đã đồng bộ tồn kho (${stockCount} sản phẩm), số bán chưa có khoảng mới`);
            } else {
                message.success(`Đã đồng bộ realtime: số bán + tồn kho (${stockCount} sản phẩm)`);
            }
            await fetchSyncStatus();
            await fetchSalesReport({ page: 1, pageSize: salesPagination.pageSize });
        });
    };

    const handleBackfillFrom2026 = async () => {
        await runExclusive(async () => {
            const res = await salesManagementApi.backfill({
                brand_key: selectedBrand,
                time_start: dayjs('2026-01-01 00:00:00').valueOf(),
                chunk_hours: 24,
                max_chunks: 500,
            });
            const data = res?.data?.data || {};
            message.success(
                `Backfill xong: ${data.chunks_done || 0} chunk (mới: ${data.fetched_count || 0}, đã có: ${data.reused_count || 0})`
            );
            await fetchSyncStatus();
            await fetchSalesReport({ page: 1 });
        });
    };

    const handleSavePriorityCodes = async () => {
        await runExclusive(async () => {
            const codes = parseCodesFromText(priorityInput);
            await salesManagementApi.savePriorityCodes({
                brand_key: selectedBrand,
                codes,
                mode: 'replace',
                note: 'Danh sách mã ưu tiên từ UI',
            });
            message.success('Đã lưu danh sách mã ưu tiên');
            await fetchPriorityCodes();
            await fetchSalesReport();
        });
    };

    const looksLikeColumnHeader = (value) => {
        const s = String(value || '').trim().toLowerCase();
        if (!s) return false;
        return /^(mã|ma\b|code|sku|mã\s*sp|mã\s*sản\s*phẩm|product|stt|#)/i.test(s);
    };

    const parseCodesFromExcelFirstColumn = (arrayBuffer) => {
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            return [];
        }
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
        let start = 0;
        if (rows.length && looksLikeColumnHeader(rows[0]?.[0])) {
            start = 1;
        }
        const cells = rows
            .slice(start)
            .map((row) => (Array.isArray(row) ? row[0] : undefined))
            .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
        return parseCodesFromText(cells.join('\n'));
    };

    const handleUploadPriorityFile = async (file) => {
        try {
            const buf = await file.arrayBuffer();
            const codes = parseCodesFromExcelFirstColumn(buf);
            if (!codes.length) {
                message.warning('Không tìm thấy mã ở cột đầu tiên (cột A) của sheet đầu tiên');
                return false;
            }
            setPriorityInput(codes.join('\n'));
            message.success(`Đã nạp ${codes.length} mã từ cột đầu tiên (Excel)`);
        } catch (error) {
            message.error('Không đọc được file Excel (.xlsx)');
        }
        return false;
    };

    const handleSalesTableChange = (pagination, _filters, sorter) => {
        runExclusive(async () => {
            const single = Array.isArray(sorter) ? sorter[0] : sorter;
            let nextSort = DEFAULT_SALES_SORT;
            if (single?.order && SORTABLE_FIELDS.has(single.field)) {
                nextSort = { sort_by: single.field, sort_dir: single.order === 'ascend' ? 'asc' : 'desc' };
            }
            const sortChanged = nextSort.sort_by !== salesSort.sort_by || nextSort.sort_dir !== salesSort.sort_dir;
            const page = sortChanged ? 1 : pagination.current;
            setSalesSort(nextSort);
            setSalesPagination({ current: page, pageSize: pagination.pageSize });
            await fetchSalesReport({
                page,
                pageSize: pagination.pageSize,
                sort: nextSort,
            });
        });
    };

    const handleApplyFilters = async () => {
        await runExclusive(async () => {
            await fetchSalesReport({ page: 1 });
        });
    };

    const handleExportExcel = async () => {
        await runExclusive(async () => {
            const params = {
                brand_key: selectedBrand,
                time_start: salesRange?.[0]?.valueOf(),
                time_end: salesRange?.[1]?.valueOf(),
                keyword: salesFilters.keyword || undefined,
                min_qty: salesFilters.min_qty || 0,
                min_revenue: salesFilters.min_revenue || 0,
                only_priority_codes: salesFilters.only_priority_codes || false,
                top_n: topN || 0,
                shop_id: salesFilters.shop_id || undefined,
                sort_by: salesSort.sort_by,
                sort_dir: salesSort.sort_dir,
            };
            const res = await salesManagementApi.exportReport(params);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const shopSuffix = salesFilters.shop_id ? `_shop_${salesFilters.shop_id}` : '';
            a.download = `sales_report_${selectedBrand}${shopSuffix}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success('Đã xuất file Excel');
        });
    };

    const sortOrderFor = (field) => (
        salesSort.sort_by === field ? (salesSort.sort_dir === 'asc' ? 'ascend' : 'descend') : null
    );

    const salesColumns = [
        {
            title: 'Mã SP',
            dataIndex: 'code',
            width: 170,
            sorter: true,
            sortOrder: sortOrderFor('code'),
            render: (code, row) => (
                <div>
                    <b>{code}</b>
                    {row.is_priority ? <Tag color="green" style={{ marginLeft: 8 }}>Ưu tiên</Tag> : null}
                </div>
            ),
        },
        { title: 'Tên sản phẩm', dataIndex: 'name', ellipsis: true },
        {
            title: 'SL bán',
            dataIndex: 'sold_qty',
            width: 120,
            align: 'right',
            sorter: true,
            sortOrder: sortOrderFor('sold_qty'),
            render: (v) => {
                const n = Number(v || 0);
                return <span style={n > 0 ? undefined : { color: '#bfbfbf' }}>{n.toLocaleString('vi-VN')}</span>;
            },
        },
        {
            title: 'Doanh số',
            dataIndex: 'sold_revenue',
            width: 160,
            align: 'right',
            sorter: true,
            sortOrder: sortOrderFor('sold_revenue'),
            render: (v) => {
                const n = Number(v || 0);
                return <span style={n > 0 ? undefined : { color: '#bfbfbf' }}>{n.toLocaleString('vi-VN')}</span>;
            },
        },
        {
            title: 'Tồn kho SW',
            dataIndex: 'current_stock',
            width: 130,
            align: 'right',
            sorter: true,
            sortOrder: sortOrderFor('current_stock'),
            render: (v) => {
                const n = Number(v || 0);
                return <span style={n > 0 ? undefined : { color: '#cf1322' }}>{n.toLocaleString('vi-VN')}</span>;
            },
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 150,
            render: (_, row) => {
                const sold = Number(row.sold_qty || 0) > 0;
                const inStock = Number(row.current_stock || 0) > 0;
                return (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {!sold ? <Tag color="default">Chưa bán trong kỳ</Tag> : null}
                        {!inStock ? <Tag color="volcano">Hết tồn</Tag> : null}
                    </div>
                );
            },
        },
        {
            title: 'Kênh',
            dataIndex: 'channels',
            render: (channels) => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(channels || []).map((c) => (
                        <Tag key={c}>{c}</Tag>
                    ))}
                </div>
            ),
        },
        {
            title: 'Số shop',
            dataIndex: 'shops_count',
            width: 100,
            align: 'right',
            sorter: true,
            sortOrder: sortOrderFor('shops_count'),
        },
    ];

    const currentBrand = SALES_BRANDS.find((brand) => brand.key === selectedBrand);
    const isHouseholdMode = selectedBrand === HOUSEHOLD_MODE_KEY;

    if (!selectedBrand) {
        return (
            <Card title={<span>Quản lý số bán <AccessModeBadge canManage={canManageSales} label="Số bán" /></span>}>
                <div style={{ marginBottom: 16, fontWeight: 600 }}>Chọn nhãn / hộ kinh doanh cần quản lý</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    {SALES_BRANDS.map((brand) => (
                        <Card
                            key={brand.key}
                            hoverable
                            onClick={() => setSelectedBrand(brand.key)}
                            style={{ borderTop: `4px solid ${brand.color}` }}
                        >
                            <div style={{ fontSize: 22, fontWeight: 700, color: brand.color }}>{brand.label}</div>
                            <div style={{ color: '#666', marginTop: 8 }}>Bấm để vào quản lý số bán {brand.label}</div>
                        </Card>
                    ))}
                    <Card
                        hoverable
                        onClick={() => setSelectedBrand(HOUSEHOLD_MODE_KEY)}
                        style={{ borderTop: '4px solid #13c2c2' }}
                    >
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#08979c' }}>Hộ kinh doanh</div>
                        <div style={{ color: '#666', marginTop: 8 }}>
                            Lê Doãn Bắc &amp; UnbeeKid — số bán + số nhập
                        </div>
                    </Card>
                </div>
            </Card>
        );
    }

    if (isHouseholdMode) {
        return (
            <Card
                title={(
                    <span>
                        Quản lý số bán — Hộ kinh doanh
                        <AccessModeBadge canManage={canManageSales} label="Số bán" />
                    </span>
                )}
                extra={(
                    <Button onClick={() => {
                        setSelectedBrand(null);
                        setSalesData([]);
                        setSyncStatus(null);
                        setPriorityInput('');
                    }}>
                        Đổi nhãn
                    </Button>
                )}
            >
                <div style={{ marginBottom: 12, color: '#666' }}>
                    Dữ liệu được lọc theo mapping shop ID của từng hộ kinh doanh và có thể gom từ nhiều tài khoản Salework.
                    Nhãn <b>cần xác nhận</b> là shop Salework không trả tên nên đang dùng mapping tạm để đối soát.
                </div>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                        gap: 16,
                        alignItems: 'stretch',
                    }}
                >
                    {HOUSEHOLDS.map((hh) => (
                        <HouseholdSalesPanel
                            key={hh.key}
                            householdKey={hh.key}
                            title={hh.label}
                            accentColor={hh.color}
                            canManage={canManageSales}
                        />
                    ))}
                </div>
            </Card>
        );
    }

    return (
        <Card
            title={(
                <span>
                    Quản lý số bán - {currentBrand?.label}
                    <AccessModeBadge canManage={canManageSales} label="Số bán" />
                </span>
            )}
            extra={
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={() => {
                        setSelectedBrand(null);
                        setSalesData([]);
                        setSyncStatus(null);
                        setPriorityInput('');
                    }}>
                        Đổi nhãn
                    </Button>
                {canManageSales ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button onClick={handleBackfillFrom2026} loading={salesLoading}>
                            Backfill từ 01/01/2026
                        </Button>
                        <Button type="primary" onClick={handleRealtimeSyncNow} loading={salesLoading}>
                            Đồng bộ realtime
                        </Button>
                    </div>
                ) : null
                }
                </div>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 0.8fr 0.9fr 1.4fr', gap: 12, marginBottom: 12 }}>
                <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Khoảng thời gian</div>
                    <DatePicker.RangePicker
                        style={{ width: '100%' }}
                        value={salesRange}
                        onChange={setSalesRange}
                        showTime
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Tìm mã / tên</div>
                    <Input
                        value={salesFilters.keyword}
                        onChange={(e) => setSalesFilters((s) => ({ ...s, keyword: e.target.value }))}
                        placeholder="VD: PN05403"
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>SL bán tối thiểu</div>
                    <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        value={salesFilters.min_qty}
                        onChange={(value) => setSalesFilters((s) => ({ ...s, min_qty: value || 0 }))}
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Doanh số tối thiểu</div>
                    <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        value={salesFilters.min_revenue}
                        onChange={(value) => setSalesFilters((s) => ({ ...s, min_revenue: value || 0 }))}
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Giới hạn Top N</div>
                    <Select
                        value={topN}
                        onChange={(value) => {
                            setTopN(value);
                            setSalesPagination((p) => ({ ...p, current: 1 }));
                        }}
                        style={{ width: '100%' }}
                    >
                        <Select.Option value={0}>Tất cả (phân trang)</Select.Option>
                        <Select.Option value={10}>Top 10</Select.Option>
                        <Select.Option value={20}>Top 20</Select.Option>
                        <Select.Option value={50}>Top 50</Select.Option>
                    </Select>
                </div>
                <div>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Lọc shop</div>
                    <Select
                        allowClear
                        showSearch
                        placeholder="Tất cả shop"
                        value={salesFilters.shop_id || undefined}
                        onChange={(value) => setSalesFilters((s) => ({ ...s, shop_id: value || null }))}
                        style={{ width: '100%' }}
                        optionFilterProp="label"
                        options={shopOptions.map((shop) => ({
                            value: shop.shop_id,
                            label: shop.label,
                        }))}
                        notFoundContent="Nhãn này chưa cấu hình shop"
                    />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Button onClick={handleApplyFilters} loading={salesLoading}>
                    Lọc dữ liệu
                </Button>
                <Button onClick={handleExportExcel} loading={salesLoading}>
                    Xuất Excel
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Switch
                        checked={salesFilters.only_priority_codes}
                        onChange={(checked) => setSalesFilters((s) => ({ ...s, only_priority_codes: checked }))}
                    />
                    <span>Chỉ hiện mã ưu tiên</span>
                </div>
                {salesFilters.shop_id ? (
                    <Tag color="gold">
                        Shop: {shopOptions.find((s) => s.shop_id === salesFilters.shop_id)?.label || salesFilters.shop_id}
                    </Tag>
                ) : null}
                {syncStatus?.latest_run_id ? (
                    <Tag color="blue">
                        Latest run: #{syncStatus.latest_run_id}
                    </Tag>
                ) : null}
                {syncStatus?.latest_time_end ? (
                    <Tag color="purple">
                        Sync đến: {dayjs(syncStatus.latest_time_end).format('DD/MM/YYYY HH:mm:ss')}
                    </Tag>
                ) : null}
                {syncStatus?.latest_stock_synced_at_ms ? (
                    <Tag color="cyan">
                        Tồn kho sync: {dayjs(syncStatus.latest_stock_synced_at_ms).format('DD/MM/YYYY HH:mm:ss')}
                    </Tag>
                ) : null}
            </div>

            {canManageSales && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>
                        Danh sách mã ưu tiên (mỗi dòng 1 mã; tải Excel: lấy cột A của sheet đầu tiên)
                    </div>
                    <Input.TextArea
                        rows={4}
                        placeholder={'PN05403\nQA13201\n...'}
                        value={priorityInput}
                        onChange={(e) => setPriorityInput(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Upload beforeUpload={handleUploadPriorityFile} showUploadList={false} accept=".xlsx,.xls">
                            <Button>Tải danh sách mã từ Excel</Button>
                        </Upload>
                        <Button type="primary" onClick={handleSavePriorityCodes}>Lưu mã ưu tiên</Button>
                    </div>
                </div>
            )}

            <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
                Hiển thị tất cả mã của nhãn (kể cả chưa bán trong kỳ hoặc đã hết tồn Salework).
                Mã không có số bán luôn được xếp cuối khi sắp xếp theo SL bán / doanh số.
            </div>
            <Table
                rowKey={(row) => row.code}
                size="small"
                columns={salesColumns}
                dataSource={salesData}
                loading={salesLoading}
                onChange={handleSalesTableChange}
                scroll={{ x: 1100 }}
                pagination={{
                    current: salesPagination.current,
                    pageSize: salesPagination.pageSize,
                    total: salesTotal,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    pageSizeOptions: SALES_PAGE_SIZE_OPTIONS,
                    showTotal: (total, range) => (
                        `${range[0]}-${range[1]} / ${Number(total || 0).toLocaleString('vi-VN')} sản phẩm`
                    ),
                }}
                onRow={(record) => (record.is_priority ? { style: { background: '#f6ffed' } } : {})}
            />
        </Card>
    );
};

export default SalesManagementPage;
