import React, { useEffect, useMemo, useState } from 'react';
import {
    Button,
    DatePicker,
    Input,
    InputNumber,
    Select,
    Table,
    Tag,
    Upload,
    message,
} from 'antd';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import salesManagementApi from '../api/salesManagementApi';

const formatNumber = (v) => Number(v || 0).toLocaleString('vi-VN');

const looksLikeHeader = (value) => {
    const s = String(value || '').trim().toLowerCase();
    if (!s) return false;
    return /^(mã|ma\b|code|sku|tên|ten|số\s*nhập|so\s*nhap|nhập|nhap)/i.test(s);
};

/** Parse Excel: cột A = mã SP, cột số nhập (ưu tiên cột có header, fallback cột B). */
const parseImportQtyFromExcel = (arrayBuffer) => {
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        blankrows: false,
    });
    if (!rows.length) return [];

    let start = 0;
    let qtyCol = 1;
    const header = rows[0] || [];
    if (looksLikeHeader(header[0]) || looksLikeHeader(header[1])) {
        start = 1;
        const idx = header.findIndex((cell) => /nhập|nhap|import|qty|sl/i.test(String(cell || '')));
        if (idx >= 0) qtyCol = idx;
    }

    const items = [];
    for (const row of rows.slice(start)) {
        if (!Array.isArray(row)) continue;
        const code = String(row[0] ?? '').trim().toUpperCase();
        if (!code) continue;
        const qtyRaw = row[qtyCol];
        const qty = Number(String(qtyRaw ?? '').replace(/,/g, '').trim());
        if (!Number.isFinite(qty)) continue;
        items.push({ code, import_qty: qty });
    }
    return items;
};

const HouseholdSalesPanel = ({
    householdKey,
    title,
    accentColor,
    canManage,
}) => {
    const [range, setRange] = useState([dayjs().subtract(29, 'day').startOf('day'), dayjs()]);
    const [keyword, setKeyword] = useState('');
    const [minQty, setMinQty] = useState(0);
    const [minRevenue, setMinRevenue] = useState(0);
    const [topN, setTopN] = useState(0);
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [reportMeta, setReportMeta] = useState(null);
    const [importMap, setImportMap] = useState({});
    const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

    const columns = useMemo(
        () => [
            {
                title: 'Mã SP',
                dataIndex: 'code',
                width: 120,
                fixed: 'left',
                render: (code) => <b>{code}</b>,
            },
            {
                title: 'Tên SP',
                dataIndex: 'name',
                ellipsis: true,
            },
            {
                title: 'Số lượng bán',
                dataIndex: 'sold_qty',
                width: 110,
                align: 'right',
                render: formatNumber,
            },
            {
                title: 'Doanh số',
                dataIndex: 'sold_revenue',
                width: 120,
                align: 'right',
                render: formatNumber,
            },
            {
                title: 'Tồn mã SP',
                dataIndex: 'current_stock',
                width: 120,
                align: 'right',
                render: formatNumber,
            },
            {
                title: 'Số nhập',
                dataIndex: 'import_qty',
                width: 100,
                align: 'right',
                render: (v) => (
                    <span style={{ fontWeight: 600, color: accentColor }}>
                        {formatNumber(v)}
                    </span>
                ),
            },
        ],
        [accentColor]
    );

    const displayRows = useMemo(() => {
        const merged = rows.map((row) => ({
            ...row,
            import_qty: importMap[row.code] ?? row.import_qty ?? 0,
        }));
        // UI-only placeholder rows so layout is visible before API exists.
        if (!merged.length && Object.keys(importMap).length) {
            return Object.entries(importMap).map(([code, import_qty]) => ({
                code,
                name: '(Chưa có tên — chờ API)',
                sold_qty: 0,
                sold_revenue: 0,
                current_stock: 0,
                import_qty,
            }));
        }
        return merged;
    }, [rows, importMap]);

    const fetchReport = async ({ page = 1, pageSize = pagination.pageSize } = {}) => {
        if (!range?.[0] || !range?.[1]) {
            message.warning('Vui lòng chọn khoảng thời gian');
            return;
        }
        setLoading(true);
        try {
            const res = await salesManagementApi.getHouseholdReport({
                household_key: householdKey,
                time_start: range[0].valueOf(),
                time_end: range[1].valueOf(),
                keyword: keyword || undefined,
                min_qty: minQty || 0,
                min_revenue: minRevenue || 0,
                top_n: topN || 0,
                page,
                page_size: pageSize,
            });
            const data = res?.data?.data || {};
            setRows(data.items || []);
            setTotal(data.total || 0);
            setReportMeta(data);
            setPagination({ current: data.page || page, pageSize: data.page_size || pageSize });
        } catch (error) {
            message.error(error.response?.data?.detail || `[${title}] Không tải được dữ liệu số bán`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport({ page: 1, pageSize: pagination.pageSize });
        // Mỗi panel tự tải đúng mapping HKD khi được mở.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [householdKey]);

    const handleFilter = async () => {
        await fetchReport({ page: 1, pageSize: pagination.pageSize });
    };

    const handleExport = async () => {
        if (!range?.[0] || !range?.[1]) return;
        setLoading(true);
        try {
            const res = await salesManagementApi.exportHouseholdReport({
                household_key: householdKey,
                time_start: range[0].valueOf(),
                time_end: range[1].valueOf(),
                keyword: keyword || undefined,
                min_qty: minQty || 0,
                min_revenue: minRevenue || 0,
                top_n: topN || 0,
            });
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sales_household_${householdKey}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success(`[${title}] Đã xuất Excel`);
        } catch (error) {
            message.error(error.response?.data?.detail || 'Không xuất được báo cáo HKD');
        } finally {
            setLoading(false);
        }
    };

    const handleImportExcel = async (file) => {
        try {
            const buf = await file.arrayBuffer();
            const parsed = parseImportQtyFromExcel(buf);
            if (!parsed.length) {
                message.warning('Không đọc được mã SP / số nhập từ Excel (cột A = mã, cột số nhập)');
                return false;
            }
            setImportMap((prev) => {
                const next = { ...prev };
                parsed.forEach((item) => {
                    next[item.code] = item.import_qty;
                });
                return next;
            });
            // Giữ bảng có dòng tương ứng mã vừa nhập (preview UI, chưa lưu server).
            setRows((prev) => {
                const byCode = new Map(prev.map((r) => [r.code, r]));
                parsed.forEach((item) => {
                    if (!byCode.has(item.code)) {
                        byCode.set(item.code, {
                            code: item.code,
                            name: '(Chưa có tên — chờ API)',
                            sold_qty: 0,
                            sold_revenue: 0,
                            current_stock: 0,
                            import_qty: item.import_qty,
                        });
                    }
                });
                return Array.from(byCode.values());
            });
            message.success(`[${title}] Đã nạp ${parsed.length} dòng số nhập từ Excel (chưa lưu server)`);
        } catch (error) {
            message.error('Không đọc được file Excel (.xlsx/.xls)');
        }
        return false;
    };

    return (
        <div
            style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                borderTop: `4px solid ${accentColor}`,
                background: '#fff',
                padding: 12,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                height: '100%',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: accentColor }}>{title}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>
                        {reportMeta
                            ? `${reportMeta.matched_shop_count || 0}/${(reportMeta.configured_shops || []).length} shop có số bán trong kỳ`
                            : `Key: ${householdKey}`}
                    </div>
                    <div style={{ color: '#888', fontSize: 11 }}>
                        Tồn Salework theo mã SP = tổng nguồn Unbee + Ranbee, dùng chung cho 2 HKD (không tách shop)
                        {reportMeta?.oldest_stock_synced_at_ms
                            ? ` · Nguồn cũ nhất đồng bộ: ${dayjs(reportMeta.oldest_stock_synced_at_ms).format('DD/MM/YYYY HH:mm:ss')}`
                            : ''}
                    </div>
                </div>
                <Tag color={accentColor}>Hộ KD</Tag>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                    <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Khoảng thời gian</div>
                    <DatePicker.RangePicker
                        style={{ width: '100%' }}
                        value={range}
                        onChange={setRange}
                        showTime
                        size="small"
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Tìm mã / tên</div>
                    <Input
                        size="small"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        placeholder="VD: PN05403"
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>SL bán tối thiểu</div>
                    <InputNumber
                        size="small"
                        style={{ width: '100%' }}
                        min={0}
                        value={minQty}
                        onChange={(v) => setMinQty(v || 0)}
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Doanh số tối thiểu</div>
                    <InputNumber
                        size="small"
                        style={{ width: '100%' }}
                        min={0}
                        value={minRevenue}
                        onChange={(v) => setMinRevenue(v || 0)}
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 4, fontWeight: 600, fontSize: 12 }}>Giới hạn Top N</div>
                    <Select
                        size="small"
                        style={{ width: '100%' }}
                        value={topN}
                        onChange={(v) => {
                            setTopN(v);
                            setPagination((p) => ({ ...p, current: 1 }));
                        }}
                    >
                        <Select.Option value={0}>Tất cả (phân trang)</Select.Option>
                        <Select.Option value={10}>Top 10</Select.Option>
                        <Select.Option value={20}>Top 20</Select.Option>
                        <Select.Option value={50}>Top 50</Select.Option>
                    </Select>
                </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Button size="small" onClick={handleFilter} loading={loading}>
                    Lọc dữ liệu
                </Button>
                <Button size="small" onClick={handleExport} loading={loading}>
                    Xuất Excel
                </Button>
                {canManage ? (
                    <Upload
                        beforeUpload={handleImportExcel}
                        showUploadList={false}
                        accept=".xlsx,.xls"
                    >
                        <Button size="small" type="primary">
                            Nhập Excel số nhập
                        </Button>
                    </Upload>
                ) : null}
            </div>

            {reportMeta?.configured_shops?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {reportMeta.configured_shops.map((shop) => {
                        const unmatched = (reportMeta.unmatched_configured_shops || []).some(
                            (item) => item.brand_key === shop.brand_key
                                && item.channel === shop.channel
                                && String(item.shop_id) === String(shop.shop_id)
                        );
                        return (
                            <Tag
                                key={`${shop.brand_key}-${shop.channel}-${shop.shop_id}`}
                                color={shop.provisional ? 'orange' : (unmatched ? 'default' : 'green')}
                                title={`${shop.brand_key} / ${shop.channel} / ${shop.shop_id}`}
                            >
                                {shop.shop_name}{shop.provisional ? ' · cần xác nhận' : ''}{unmatched ? ' · không phát sinh' : ''}
                            </Tag>
                        );
                    })}
                </div>
            ) : null}

            <Table
                size="small"
                rowKey={(row) => row.code}
                columns={columns}
                dataSource={displayRows}
                loading={loading}
                scroll={{ x: 700 }}
                locale={{
                    emptyText: 'Không có số bán khớp trong khoảng thời gian',
                }}
                pagination={{
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                    total,
                    showSizeChanger: true,
                    size: 'small',
                    showTotal: (total) => `Tổng ${formatNumber(total)} SP`,
                    onChange: (page, pageSize) => fetchReport({ page, pageSize }),
                }}
            />
        </div>
    );
};

export default HouseholdSalesPanel;
