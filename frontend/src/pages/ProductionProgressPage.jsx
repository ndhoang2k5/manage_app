import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Input, Progress, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import productionApi from '../api/productionApi';
import warehouseApi from '../api/warehouseApi';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const normalizeSteps = (row) => {
    const start = row?.start_date ? dayjs(row.start_date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    const due = row?.due_date ? dayjs(row.due_date).format('YYYY-MM-DD') : start;
    const defaults = [
        { name: 'Bước 1', done: false, deadline: start },
        { name: 'Bước 2', done: false, deadline: start },
        { name: 'Bước 3', done: false, deadline: due },
        { name: 'Bước 4', done: false, deadline: due },
    ];
    const incoming = Array.isArray(row?.progress) ? row.progress : [];
    return defaults.map((d, idx) => {
        const s = incoming[idx] || {};
        return {
            name: s.name || d.name,
            done: Boolean(s.done),
            deadline: s.deadline || d.deadline,
        };
    });
};

const isOverdueStep = (step) => {
    if (!step || step.done || !step.deadline) return false;
    const d = dayjs(step.deadline);
    if (!d.isValid()) return false;
    return d.endOf('day').isBefore(dayjs());
};

const rowProgressMeta = (row) => {
    const steps = normalizeSteps(row);
    const doneSteps = steps.filter((s) => s.done).length;
    const overdue = row.status !== 'completed' && steps.some((s) => isOverdueStep(s));
    const pendingDeadlines = steps
        .filter((s) => !s.done && s.deadline)
        .map((s) => dayjs(s.deadline))
        .filter((d) => d.isValid())
        .sort((a, b) => a.valueOf() - b.valueOf());
    const nextDeadline = pendingDeadlines.length ? pendingDeadlines[0] : null;
    const endDeadline = steps
        .map((s) => (s.deadline ? dayjs(s.deadline) : null))
        .filter((d) => d && d.isValid())
        .sort((a, b) => b.valueOf() - a.valueOf())[0] || null;
    const finished = Number(row.quantity_finished || 0);
    const planned = Number(row.quantity_planned || 0);
    const fulfillmentPercent = planned > 0 ? Math.min(100, Math.round((finished / planned) * 100)) : 0;
    return { steps, doneSteps, overdue, nextDeadline, endDeadline, fulfillmentPercent, finished, planned };
};

const ProductionProgressPage = () => {
    const [loading, setLoading] = useState(false);
    const [rows, setRows] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [search, setSearch] = useState('');
    const [includeCompleted, setIncludeCompleted] = useState(false);
    const [warehouseId, setWarehouseId] = useState(undefined);
    const [warehouses, setWarehouses] = useState([]);
    const [brandFilter, setBrandFilter] = useState(undefined);
    const [statusFilter, setStatusFilter] = useState('all');
    const [deadlineFilter, setDeadlineFilter] = useState('all');
    const [fulfillmentFilter, setFulfillmentFilter] = useState('all');
    const [startDateRange, setStartDateRange] = useState(null);

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const res = await warehouseApi.getAllWarehouses();
                setWarehouses(res?.data || []);
            } catch (e) {
                // ignore
            }
        };
        loadWarehouses();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await productionApi.getOrdersProgress({
                page: 1,
                limit: 2000,
                search: search || undefined,
                warehouse_id: warehouseId || undefined,
                include_completed: includeCompleted,
            });
            setRows(res?.data?.data || []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouseId, includeCompleted]);

    const workshopOptions = useMemo(
        () =>
            (warehouses || [])
                .filter((w) => w.type_name === 'Xưởng May')
                .map((w) => ({ value: w.id, label: w.name })),
        [warehouses]
    );

    const brandOptions = useMemo(() => {
        const uniq = new Map();
        (rows || []).forEach((r) => {
            const id = r?.brand_id;
            const name = r?.brand_name;
            if (id !== null && id !== undefined && name) {
                uniq.set(id, { value: id, label: name });
            }
        });
        return Array.from(uniq.values());
    }, [rows]);

    const filteredRows = useMemo(() => {
        const now = dayjs();
        const q = (search || '').trim().toLowerCase();
        return (rows || []).filter((row) => {
            const meta = rowProgressMeta(row);

            if (q) {
                const hay = [
                    row?.code,
                    row?.product_sku,
                    row?.product_name,
                    row?.brand_name,
                    row?.workshop_name,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!hay.includes(q)) return false;
            }

            if (brandFilter && Number(row?.brand_id) !== Number(brandFilter)) return false;

            if (statusFilter !== 'all' && row?.status !== statusFilter) return false;

            if (deadlineFilter !== 'all') {
                if (deadlineFilter === 'overdue' && !meta.overdue) return false;
                if (deadlineFilter === 'today') {
                    if (!meta.nextDeadline || !meta.nextDeadline.isSame(now, 'day')) return false;
                }
                if (deadlineFilter === 'next3') {
                    if (!meta.nextDeadline || meta.nextDeadline.endOf('day').isBefore(now) || meta.nextDeadline.isAfter(now.add(3, 'day').endOf('day'))) return false;
                }
                if (deadlineFilter === 'next7') {
                    if (!meta.nextDeadline || meta.nextDeadline.endOf('day').isBefore(now) || meta.nextDeadline.isAfter(now.add(7, 'day').endOf('day'))) return false;
                }
                if (deadlineFilter === 'no_deadline') {
                    const hasAnyDeadline = meta.steps.some((s) => s.deadline);
                    if (hasAnyDeadline) return false;
                }
            }

            if (fulfillmentFilter !== 'all') {
                const p = meta.fulfillmentPercent;
                if (fulfillmentFilter === 'not_started' && p !== 0) return false;
                if (fulfillmentFilter === 'in_progress' && !(p > 0 && p < 100)) return false;
                if (fulfillmentFilter === 'almost_done' && p < 80) return false;
                if (fulfillmentFilter === 'done' && p < 100) return false;
            }

            if (startDateRange && startDateRange.length === 2) {
                const startVal = row?.start_date ? dayjs(row.start_date) : null;
                if (!startVal || !startVal.isValid()) return false;
                const from = startDateRange[0]?.startOf('day');
                const to = startDateRange[1]?.endOf('day');
                if (from && startVal.isBefore(from)) return false;
                if (to && startVal.isAfter(to)) return false;
            }

            return true;
        });
    }, [rows, search, brandFilter, statusFilter, deadlineFilter, fulfillmentFilter, startDateRange]);

    const pagedRows = useMemo(() => {
        const start = (page - 1) * limit;
        return filteredRows.slice(start, start + limit);
    }, [filteredRows, page, limit]);

    const columns = [
        {
            title: 'STT',
            width: 70,
            align: 'center',
            render: (_, __, index) => (page - 1) * limit + index + 1,
        },
        {
            title: 'Nhãn hàng',
            dataIndex: 'brand_name',
            width: 140,
            render: (v) => v || <Text type="secondary">—</Text>,
        },
        { title: 'Xưởng', dataIndex: 'workshop_name', width: 140 },
        { title: 'Mã lệnh', dataIndex: 'code', width: 140, render: (v) => <Text strong>{v}</Text> },
        { title: 'Mã SKU', dataIndex: 'product_sku', width: 140 },
        { title: 'Tên sản phẩm', dataIndex: 'product_name', width: 220 },
        {
            title: 'Tiến độ trả',
            width: 190,
            render: (_, row) => {
                const { doneSteps: done, overdue } = rowProgressMeta(row);
                const color = row.status === 'completed' ? 'success' : overdue ? 'error' : done > 0 ? 'processing' : 'default';
                return (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Tag color={color}>{overdue ? `Trễ hạn ${done}/4` : `Bước ${done}/4`}</Tag>
                        <Progress
                            percent={Math.round((done / 4) * 100)}
                            size="small"
                            showInfo={false}
                            strokeColor={overdue ? '#ff4d4f' : '#52c41a'}
                        />
                    </Space>
                );
            },
        },
        {
            title: 'Tiến độ thực hiện',
            width: 180,
            render: (_, row) => {
                const { finished, planned, fulfillmentPercent: percent } = rowProgressMeta(row);
                return (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Text strong>{finished} / {planned}</Text>
                        <Progress percent={percent} size="small" showInfo={false} />
                    </Space>
                );
            },
        },
        {
            title: 'Thời gian bắt đầu',
            width: 130,
            render: (_, row) => row.start_date ? dayjs(row.start_date).format('YYYY-MM-DD') : '—',
        },
        {
            title: 'Thời gian kết thúc',
            width: 210,
            render: (_, row) => {
                const { steps, endDeadline } = rowProgressMeta(row);
                const deadlines = steps
                    .map((s, idx) => ({
                        label: `B${idx + 1}`,
                        value: s.deadline ? dayjs(s.deadline).format('YYYY-MM-DD') : '—',
                    }));
                const endDate = endDeadline ? endDeadline.format('YYYY-MM-DD') : (deadlines[deadlines.length - 1]?.value || '—');
                return (
                    <Space direction="vertical" size={0}>
                        <Text strong>{endDate}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {deadlines.map((d) => `${d.label}:${d.value}`).join(' | ')}
                        </Text>
                    </Space>
                );
            },
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Card title="Tiến trình sản xuất" size="small">
                <Space wrap>
                    <Input.Search
                        placeholder="Tìm nhãn/mã lệnh/SKU/tên sản phẩm"
                        allowClear
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onSearch={() => {
                            setPage(1);
                        }}
                        style={{ width: 360 }}
                    />
                    <Select
                        placeholder="Lọc theo xưởng"
                        allowClear
                        options={workshopOptions}
                        value={warehouseId}
                        onChange={(v) => {
                            setPage(1);
                            setWarehouseId(v);
                        }}
                        style={{ width: 220 }}
                    />
                    <RangePicker
                        value={startDateRange}
                        onChange={(v) => {
                            setPage(1);
                            setStartDateRange(v);
                        }}
                        placeholder={['Bắt đầu từ ngày', 'Bắt đầu đến ngày']}
                        style={{ width: 290 }}
                    />
                    <Select
                        placeholder="Lọc theo nhãn hàng"
                        allowClear
                        options={brandOptions}
                        value={brandFilter}
                        onChange={(v) => {
                            setPage(1);
                            setBrandFilter(v);
                        }}
                        style={{ width: 220 }}
                    />
                    <Select
                        value={statusFilter}
                        onChange={(v) => {
                            setPage(1);
                            setStatusFilter(v);
                        }}
                        style={{ width: 170 }}
                        options={[
                            { value: 'all', label: 'Trạng thái: Tất cả' },
                            { value: 'draft', label: 'Nháp' },
                            { value: 'in_progress', label: 'Đang làm' },
                            { value: 'completed', label: 'Hoàn thành' },
                        ]}
                    />
                    <Select
                        value={deadlineFilter}
                        onChange={(v) => {
                            setPage(1);
                            setDeadlineFilter(v);
                        }}
                        style={{ width: 190 }}
                        options={[
                            { value: 'all', label: 'Deadline: Tất cả' },
                            { value: 'overdue', label: 'Đang trễ hạn' },
                            { value: 'today', label: 'Tới hạn hôm nay' },
                            { value: 'next3', label: 'Tới hạn 3 ngày' },
                            { value: 'next7', label: 'Tới hạn 7 ngày' },
                            { value: 'no_deadline', label: 'Chưa đặt deadline' },
                        ]}
                    />
                    <Select
                        value={fulfillmentFilter}
                        onChange={(v) => {
                            setPage(1);
                            setFulfillmentFilter(v);
                        }}
                        style={{ width: 200 }}
                        options={[
                            { value: 'all', label: 'Tiến độ trả: Tất cả' },
                            { value: 'not_started', label: 'Chưa trả (0%)' },
                            { value: 'in_progress', label: 'Đang trả (1-99%)' },
                            { value: 'almost_done', label: 'Sắp xong (>=80%)' },
                            { value: 'done', label: 'Đã trả đủ (100%)' },
                        ]}
                    />
                    <Space>
                        <Switch
                            checked={includeCompleted}
                            onChange={(v) => {
                                setPage(1);
                                setIncludeCompleted(v);
                            }}
                        />
                        <Text>Hiển thị đơn hoàn thành</Text>
                    </Space>
                    <Button
                        onClick={() => {
                            setPage(1);
                            setSearch('');
                            setWarehouseId(undefined);
                            setBrandFilter(undefined);
                            setStatusFilter('all');
                            setDeadlineFilter('all');
                            setFulfillmentFilter('all');
                            setStartDateRange(null);
                            setIncludeCompleted(false);
                        }}
                    >
                        Xóa bộ lọc
                    </Button>
                </Space>
            </Card>

            <Card size="small" bodyStyle={{ padding: 0 }}>
                <Table
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={pagedRows}
                    size="small"
                    scroll={{ x: 1750 }}
                    pagination={{
                        current: page,
                        pageSize: limit,
                        total: filteredRows.length,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100'],
                        onChange: (p, ps) => {
                            setPage(p);
                            setLimit(ps);
                        },
                    }}
                />
            </Card>
        </Space>
    );
};

export default ProductionProgressPage;
