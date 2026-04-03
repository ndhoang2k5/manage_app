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
import salesManagementApi from '../api/salesManagementApi';

const SalesManagementPage = () => {
    const [salesRange, setSalesRange] = useState([dayjs().startOf('month'), dayjs()]);
    const [salesData, setSalesData] = useState([]);
    const [salesTotal, setSalesTotal] = useState(0);
    const [salesLoading, setSalesLoading] = useState(false);
    const [syncStatus, setSyncStatus] = useState(null);
    const [priorityInput, setPriorityInput] = useState('');
    const [topN, setTopN] = useState(20);
    const [salesPagination, setSalesPagination] = useState({ current: 1, pageSize: 20 });
    const [salesFilters, setSalesFilters] = useState({
        keyword: '',
        min_qty: 0,
        min_revenue: 0,
        only_priority_codes: false,
    });
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
        try {
            const res = await salesManagementApi.getPriorityCodes();
            const codes = (res?.data?.data || []).map((item) => item.code);
            setPriorityInput(codes.join('\n'));
        } catch (error) {
            // Skip to avoid blocking UI.
        }
    };

    const fetchSalesReport = async ({
        page = salesPagination.current,
        pageSize = salesPagination.pageSize,
        filters = salesFilters,
    } = {}) => {
        try {
            const params = {
                time_start: salesRange?.[0]?.valueOf(),
                time_end: salesRange?.[1]?.valueOf(),
                page,
                page_size: pageSize,
                keyword: filters.keyword || undefined,
                min_qty: filters.min_qty || 0,
                min_revenue: filters.min_revenue || 0,
                only_priority_codes: filters.only_priority_codes || false,
            };
            const res = await salesManagementApi.getReport(params);
            const payload = res?.data?.data || {};
            const items = payload.items || [];
            const limitedItems = topN ? items.slice(0, topN) : items;
            setSalesData(limitedItems);
            setSalesTotal(payload.total || 0);
            setSalesPagination({ current: payload.page || page, pageSize: payload.page_size || pageSize });
        } catch (error) {
            message.error(error.response?.data?.detail || 'Lỗi tải báo cáo số bán');
        }
    };

    const fetchSyncStatus = async () => {
        try {
            const res = await salesManagementApi.getSyncStatus();
            setSyncStatus(res?.data?.data || null);
        } catch (error) {
            // Ignore status failure to avoid blocking.
        }
    };

    useEffect(() => {
        fetchPriorityCodes();
        fetchSyncStatus();
        fetchSalesReport({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRealtimeSyncNow = async () => {
        await runExclusive(async () => {
            const res = await salesManagementApi.syncNow();
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
                codes,
                mode: 'replace',
                note: 'Danh sách mã ưu tiên từ UI',
            });
            message.success('Đã lưu danh sách mã ưu tiên');
            await fetchPriorityCodes();
            await fetchSalesReport();
        });
    };

    const handleUploadPriorityFile = async (file) => {
        try {
            const text = await file.text();
            const codes = parseCodesFromText(text);
            setPriorityInput(codes.join('\n'));
            message.success(`Đã nạp ${codes.length} mã từ file`);
        } catch (error) {
            message.error('Không đọc được file');
        }
        return false;
    };

    const handleSalesTableChange = (pagination) => {
        runExclusive(async () => {
            setSalesPagination({ current: pagination.current, pageSize: pagination.pageSize });
            await fetchSalesReport({
                page: pagination.current,
                pageSize: pagination.pageSize,
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
                time_start: salesRange?.[0]?.valueOf(),
                time_end: salesRange?.[1]?.valueOf(),
                keyword: salesFilters.keyword || undefined,
                min_qty: salesFilters.min_qty || 0,
                min_revenue: salesFilters.min_revenue || 0,
                only_priority_codes: salesFilters.only_priority_codes || false,
                top_n: topN || 0,
            };
            const res = await salesManagementApi.exportReport(params);
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sales_report_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success('Đã xuất file Excel');
        });
    };

    const salesColumns = [
        {
            title: 'Mã SP',
            dataIndex: 'code',
            width: 150,
            render: (code, row) => (
                <div>
                    <b>{code}</b>
                    {row.is_priority ? <Tag color="green" style={{ marginLeft: 8 }}>Ưu tiên</Tag> : null}
                </div>
            ),
        },
        { title: 'Tên sản phẩm', dataIndex: 'name' },
        {
            title: 'SL bán',
            dataIndex: 'sold_qty',
            width: 120,
            align: 'right',
            render: (v) => Number(v || 0).toLocaleString('vi-VN'),
        },
        {
            title: 'Doanh số',
            dataIndex: 'sold_revenue',
            width: 160,
            align: 'right',
            render: (v) => Number(v || 0).toLocaleString('vi-VN'),
        },
        {
            title: 'Tồn kho SW',
            dataIndex: 'current_stock',
            width: 130,
            align: 'right',
            render: (v) => Number(v || 0).toLocaleString('vi-VN'),
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
        { title: 'Số shop', dataIndex: 'shops_count', width: 100, align: 'right' },
    ];

    return (
        <Card
            title="Quản lý số bán"
            extra={
                <div style={{ display: 'flex', gap: 8 }}>
                    <Button onClick={handleBackfillFrom2026} loading={salesLoading}>
                        Backfill từ 01/01/2026
                    </Button>
                    <Button type="primary" onClick={handleRealtimeSyncNow} loading={salesLoading}>
                        Đồng bộ realtime
                    </Button>
                </div>
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
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
                    <div style={{ marginBottom: 6, fontWeight: 600 }}>Top nhanh</div>
                    <Select value={topN} onChange={setTopN} style={{ width: '100%' }}>
                        <Select.Option value={10}>Top 10</Select.Option>
                        <Select.Option value={20}>Top 20</Select.Option>
                        <Select.Option value={50}>Top 50</Select.Option>
                        <Select.Option value={0}>Tất cả</Select.Option>
                    </Select>
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

            <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6, fontWeight: 600 }}>Danh sách mã ưu tiên (mỗi dòng 1 mã)</div>
                <Input.TextArea
                    rows={4}
                    placeholder={'PN05403\nQA13201\n...'}
                    value={priorityInput}
                    onChange={(e) => setPriorityInput(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Upload beforeUpload={handleUploadPriorityFile} showUploadList={false} accept=".txt,.csv">
                        <Button>Tải danh sách mã từ file</Button>
                    </Upload>
                    <Button type="primary" onClick={handleSavePriorityCodes}>Lưu mã ưu tiên</Button>
                </div>
            </div>

            <Table
                rowKey={(row) => row.code}
                columns={salesColumns}
                dataSource={salesData}
                loading={salesLoading}
                onChange={handleSalesTableChange}
                pagination={{
                    current: salesPagination.current,
                    pageSize: salesPagination.pageSize,
                    total: salesTotal,
                    showSizeChanger: true,
                }}
                onRow={(record) => (record.is_priority ? { style: { background: '#f6ffed' } } : {})}
            />
        </Card>
    );
};

export default SalesManagementPage;
