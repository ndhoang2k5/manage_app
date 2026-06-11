import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, DatePicker, Input, Row, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import productionApi from '../api/productionApi';
import warehouseApi from '../api/warehouseApi';

const { RangePicker } = DatePicker;
const { Text } = Typography;

function fmtDate(d) {
  if (!d) return '';
  // backend trả date (YYYY-MM-DD) hoặc Date object tùy driver; cứ stringify an toàn
  return typeof d === 'string' ? d : String(d);
}

function fmtMoney(n) {
  if (n === null || n === undefined) return '';
  const x = Number(n);
  if (Number.isNaN(x)) return '';
  return x.toLocaleString('vi-VN');
}

function sumFees(fees) {
  if (!fees) return 0;
  return (
    Number(fees.labor_fee || 0) +
    Number(fees.print_fee || 0) +
    Number(fees.shipping_fee || 0) +
    Number(fees.marketing_fee || 0) +
    Number(fees.packaging_fee || 0) +
    Number(fees.other_fee || 0)
  );
}

function sumMaterialValue(materials) {
  if (!materials || !materials.length) return 0;
  return materials.reduce((acc, m) => acc + Number(m.total_cost || 0), 0);
}

export default function OrderManagementPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const [warehouses, setWarehouses] = useState([]);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  const [search, setSearch] = useState('');
  const [warehouseId, setWarehouseId] = useState(undefined);
  const [centralId, setCentralId] = useState(undefined);
  const [startRange, setStartRange] = useState(null);
  const [dueRange, setDueRange] = useState(null);
  const [includeCompleted, setIncludeCompleted] = useState(false);

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await warehouseApi.getAllWarehouses();
        setWarehouses(res.data || []);
      } catch (e) {
        // ignore
      }
    };
    loadWarehouses();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        search: search || undefined,
        warehouse_id: warehouseId || undefined,
        owner_central_id: centralId || undefined,
        include_completed: includeCompleted,
      };

      if (startRange && startRange.length === 2) {
        params.start_date_from = startRange[0]?.format('YYYY-MM-DD');
        params.start_date_to = startRange[1]?.format('YYYY-MM-DD');
      }
      if (dueRange && dueRange.length === 2) {
        params.due_date_from = dueRange[0]?.format('YYYY-MM-DD');
        params.due_date_to = dueRange[1]?.format('YYYY-MM-DD');
      }

      const res = await productionApi.getOrdersManagement(params);
      setRows(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, warehouseId, centralId, includeCompleted]);

  const columns = useMemo(() => {
    return [
      {
        title: 'STT',
        key: 'stt',
        fixed: 'left',
        width: 70,
        align: 'center',
        render: (_, __, index) => (page - 1) * limit + index + 1,
      },
      {
        title: 'Nhãn hàng',
        dataIndex: 'brand_name',
        key: 'brand_name',
        fixed: 'left',
        width: 140,
        render: (v) => v || <Text type="secondary">—</Text>,
      },
      {
        title: 'Xưởng',
        dataIndex: 'workshop_name',
        key: 'workshop_name',
        fixed: 'left',
        width: 180,
      },
      {
        title: 'Mã lệnh',
        dataIndex: 'code',
        key: 'code',
        fixed: 'left',
        width: 140,
        render: (v, r) => (
          <Space direction="vertical" size={0}>
            <Text strong>{v}</Text>
            <Tag color={r.status === 'draft' ? 'default' : r.status === 'in_progress' ? 'blue' : 'green'}>
              {r.status}
            </Tag>
          </Space>
        ),
      },
      {
        title: 'Mã SKU',
        dataIndex: 'product_sku',
        key: 'product_sku',
        width: 140,
      },
      {
        title: 'Tên sản phẩm',
        dataIndex: 'product_name',
        key: 'product_name',
        width: 220,
      },
      {
        title: 'Số lượng đã trả',
        dataIndex: 'quantity_finished',
        key: 'quantity_finished',
        width: 140,
        render: (v) => <Text strong>{v}</Text>,
      },
      {
        title: 'Thời gian',
        key: 'time_group',
        children: [
          {
            title: 'Bắt đầu',
            key: 'start_date',
            width: 120,
            render: (_, r) => fmtDate(r.start_date) || '—',
          },
          {
            title: 'kết thúc',
            key: 'due_date',
            width: 120,
            render: (_, r) => fmtDate(r.due_date) || '—',
          },
        ],
      },
      {
        title: 'Sản phẩm',
        key: 'product_group',
        children: [
          {
            title: 'Size',
            key: 'sizes_size',
            width: 140,
            render: (_, r) => {
              const sizes = r.sizes || [];
              if (!sizes.length) return <Text type="secondary">—</Text>;
              return (
                <div style={{ whiteSpace: 'normal' }}>
                  {sizes.map((s, idx) => (
                    <div key={`${s.size}-${idx}`}>{s.size}</div>
                  ))}
                </div>
              );
            },
          },
          {
            title: 'Số lượng',
            key: 'sizes_qty',
            width: 120,
            render: (_, r) => {
              const sizes = r.sizes || [];
              if (!sizes.length) return <Text type="secondary">—</Text>;
              return (
                <div style={{ whiteSpace: 'normal' }}>
                  {sizes.map((s, idx) => (
                    <div key={`${s.size}-${idx}`}>{s.quantity}</div>
                  ))}
                </div>
              );
            },
          },
        ],
      },
      {
        title: 'Nguyên phụ liệu',
        key: 'materials_group',
        children: [
          {
            title: 'Tên',
            key: 'mat_name',
            width: 260,
            render: (_, r) => {
              const mats = r.materials || [];
              if (!mats.length) return <Text type="secondary">—</Text>;
              return (
                <div style={{ whiteSpace: 'normal' }}>
                  {mats.map((m, idx) => (
                    <div key={`${m.sku}-${idx}`}>
                      {m.name} <Text type="secondary">({m.sku})</Text>
                    </div>
                  ))}
                </div>
              );
            },
          },
          {
            title: 'Số lượng',
            key: 'mat_qty',
            width: 120,
            render: (_, r) => {
              const mats = r.materials || [];
              if (!mats.length) return <Text type="secondary">—</Text>;
              return (
                <div style={{ whiteSpace: 'normal' }}>
                  {mats.map((m, idx) => (
                    <div key={`${m.sku}-${idx}`}>{m.quantity}</div>
                  ))}
                </div>
              );
            },
          },
          {
            title: 'Giá trị',
            key: 'mat_value',
            width: 140,
            render: (_, r) => {
              if (!r.can_view_cost) return <Text type="secondary">—</Text>;
              const mats = r.materials || [];
              if (!mats.length) return <Text type="secondary">—</Text>;
              return (
                <div style={{ whiteSpace: 'normal' }}>
                  {mats.map((m, idx) => (
                    <div key={`${m.sku}-${idx}`}>{fmtMoney(m.total_cost)}</div>
                  ))}
                </div>
              );
            },
          },
        ],
      },
      {
        title: 'Chi phí',
        key: 'fees_group',
        children: [
          {
            title: 'Gia công',
            key: 'labor_fee',
            width: 120,
            render: (_, r) => (r.can_view_cost ? fmtMoney(r.fees?.labor_fee) : '—'),
          },
          {
            title: 'In/ Thêu',
            key: 'print_fee',
            width: 120,
            render: (_, r) => (r.can_view_cost ? fmtMoney(r.fees?.print_fee) : '—'),
          },
          {
            title: 'Vận chuyển',
            key: 'shipping_fee',
            width: 120,
            render: (_, r) => (r.can_view_cost ? fmtMoney(r.fees?.shipping_fee) : '—'),
          },
          {
            title: 'Marketing',
            key: 'marketing_fee',
            width: 120,
            render: (_, r) => (r.can_view_cost ? fmtMoney(r.fees?.marketing_fee) : '—'),
          },
          {
            title: 'Đóng gói',
            key: 'packaging_fee',
            width: 120,
            render: (_, r) => (r.can_view_cost ? fmtMoney(r.fees?.packaging_fee) : '—'),
          },
          {
            title: 'Phụ phí',
            key: 'other_fee',
            width: 120,
            render: (_, r) => (r.can_view_cost ? fmtMoney(r.fees?.other_fee) : '—'),
          },
        ],
      },
      {
        title: 'Chi phí chung',
        key: 'grand_total',
        width: 140,
        render: (_, r) => {
          if (!r.can_view_cost) return <Text type="secondary">—</Text>;
          const grand = sumFees(r.fees) + sumMaterialValue(r.materials);
          return <Text strong>{fmtMoney(grand)}</Text>;
        },
      },
    ];
  }, [limit, page]);

  const workshopOptions = useMemo(() => {
    return (warehouses || [])
      .filter((w) => w.type_name === 'Xưởng May')
      .map((w) => ({ value: w.id, label: w.name }));
  }, [warehouses]);

  const centralOptions = useMemo(() => {
    return (warehouses || [])
      .filter((w) => w.type_name === 'Kho Tổng')
      .map((w) => ({ value: w.id, label: w.name }));
  }, [warehouses]);

  const tableScrollY = Math.max(320, viewportHeight - 340);

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card
        title="Quản lý đơn (Sản xuất)"
        size="small"
        style={{ position: 'sticky', top: 0, zIndex: 20, flexShrink: 0 }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={8}>
            <Input.Search
              placeholder="Tìm mã lệnh / SKU / tên sản phẩm"
              allowClear
              onSearch={() => {
                setPage(1);
                fetchData();
              }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>

          <Col xs={24} md={6}>
            <Select
              placeholder="Lọc theo xưởng"
              allowClear
              style={{ width: '100%' }}
              options={workshopOptions}
              value={warehouseId}
              onChange={(v) => {
                setPage(1);
                setWarehouseId(v);
              }}
            />
          </Col>

          <Col xs={24} md={6}>
            <Select
              placeholder="Lọc theo kho tổng"
              allowClear
              style={{ width: '100%' }}
              options={centralOptions}
              value={centralId}
              onChange={(v) => {
                setPage(1);
                setCentralId(v);
              }}
            />
          </Col>

          <Col xs={24} md={5}>
            <RangePicker
              style={{ width: '100%' }}
              placeholder={['Start từ', 'Start đến']}
              value={startRange}
              onChange={(v) => setStartRange(v)}
              onCalendarChange={() => {}}
              onOk={() => {}}
            />
          </Col>

          <Col xs={24} md={4}>
            <RangePicker
              style={{ width: '100%' }}
              placeholder={['Kết thúc từ', 'Kết thúc đến']}
              value={dueRange}
              onChange={(v) => setDueRange(v)}
              onCalendarChange={() => {}}
              onOk={() => {}}
            />
          </Col>

          <Col xs={24}>
            <Space>
              <Switch checked={includeCompleted} onChange={(v) => { setPage(1); setIncludeCompleted(v); }} />
              <Text>Hiển thị cả đơn đã hoàn thành</Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small" bodyStyle={{ padding: 0, height: '100%' }} style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize: limit,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setLimit(ps);
            },
          }}
          scroll={{ x: 2100, y: tableScrollY }}
          sticky
          size="small"
        />
      </Card>
    </div>
  );
}

