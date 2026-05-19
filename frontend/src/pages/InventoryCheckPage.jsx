import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Col, Input, Modal, Row, Select, Space, Switch, Table, Tag, Typography, Upload, message } from 'antd';
import inventoryCheckApi from '../api/inventoryCheckApi';

const { Text } = Typography;

export default function InventoryCheckPage() {
  const [loading, setLoading] = useState(false); // chỉ dùng cho load lần đầu / thao tác user
  const [silentRefreshing, setSilentRefreshing] = useState(false); // poll ngầm
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [includeZero, setIncludeZero] = useState(true);
  const [polling, setPolling] = useState(true);
  const [salesRealtime, setSalesRealtime] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [periodMonth, setPeriodMonth] = useState('');
  const [periodOptions, setPeriodOptions] = useState([]);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [accountingVersion, setAccountingVersion] = useState(0); // trigger rerender nhẹ khi refs đổi

  // kế toán snapshot lần đầu (tạm thời)
  const accountingMapRef = useRef(new Map());
  const initializedRef = useRef(false);
  const accountingAggRef = useRef(new Map()); // code -> {inc, dec}
  const accountingOpeningsRef = useRef(new Map()); // code -> opening_qty

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCode, setDetailCode] = useState('');
  const [detailItems, setDetailItems] = useState([]);

  const fetchSalework = async ({ isInit = false, silent = false } = {}) => {
    if (silent) setSilentRefreshing(true);
    else setLoading(true);
    try {
      const res = await inventoryCheckApi.getSaleworkProducts({
        page,
        limit,
        include_zero: includeZero,
        search: search || undefined,
      });
      const list = res.data?.items || [];
      setTotal(res.data?.total || 0);

      // init: copy sw tồn sang kế toán 1 lần duy nhất
      if (!initializedRef.current && (isInit || list.length > 0)) {
        const m = new Map();
        list.forEach((x) => m.set(x.code, x.total_stock));
        accountingMapRef.current = m;
        initializedRef.current = true;
      }

      setItems(list);
    } catch (e) {
      if (!silent) {
        message.error(`Lỗi kéo tồn Salework: ${e?.response?.data?.detail || e.message || 'unknown'}`);
      }
    } finally {
      if (silent) setSilentRefreshing(false);
      else setLoading(false);
    }
  };

  const fetchAccountingAggForPage = async (codes) => {
    if (!codes || codes.length === 0) return;
    try {
      const res = await inventoryCheckApi.getAccountingSummary({ codes: codes.join(','), period_month: periodMonth || undefined });
      const obj = res.data?.items || {};
      const m = new Map();
      Object.keys(obj).forEach((k) => m.set(k, obj[k]));
      accountingAggRef.current = m;
      setAccountingVersion((v) => v + 1);
    } catch (e) {
      // ignore
    }
  };

  const fetchAccountingOpeningsForPage = async (codes) => {
    if (!codes || codes.length === 0) return;
    try {
      const res = await inventoryCheckApi.getAccountingOpenings({ codes: codes.join(','), period_month: periodMonth || undefined });
      const obj = res.data?.items || {};
      const m = new Map();
      Object.keys(obj).forEach((k) => m.set(k, obj[k]));
      accountingOpeningsRef.current = m;
      setAccountingVersion((v) => v + 1);
    } catch (e) {
      // ignore
    }
  };

  const syncSalesRealtime = async ({ silent = true } = {}) => {
    try {
      await inventoryCheckApi.syncSalesRealtime();
      const codes = items.map((x) => x.code).filter(Boolean);
      await fetchAccountingAggForPage(codes);
    } catch (e) {
      if (!silent) {
        message.error(`Sync số bán lỗi: ${e?.response?.data?.detail || e.message || 'unknown'}`);
      }
    }
  };

  const initOpeningsFromSalework = async () => {
    try {
      setLoading(true);
      const res = await inventoryCheckApi.initOpeningsFromSalework();
      if (res.data?.initialized) {
        message.success(`Đã đồng bộ tồn đầu KT từ Salework (${res.data?.inserted || 0} mã)`);
        setBootstrapDone(true);
      } else {
        message.info(res.data?.message || 'Kỳ này đã được khởi tạo trước đó');
        if (res.data?.already_initialized) setBootstrapDone(true);
      }
      const codes = items.map((x) => x.code).filter(Boolean);
      await fetchAccountingOpeningsForPage(codes);
      await fetchAccountingAggForPage(codes);
    } catch (e) {
      message.error(`Đồng bộ tồn đầu lỗi: ${e?.response?.data?.detail || e.message || 'unknown'}`);
    } finally {
      setLoading(false);
    }
  };

  // init load
  useEffect(() => {
    fetchSalework({ isInit: true, silent: false });
    (async () => {
      try {
        const st = await inventoryCheckApi.getBootstrapState();
        if (st.data?.initialized) setBootstrapDone(true);
      } catch (e) {
        // ignore
      }
    })();
    (async () => {
      try {
        const res = await inventoryCheckApi.getPeriods();
        const active = res.data?.active_period_month || '';
        const opts = (res.data?.items || []).map((x) => x.period_month);
        setPeriodMonth(active || '');
        setPeriodOptions(opts.length ? opts : (active ? [active] : []));
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refetch when filters change
  useEffect(() => {
    fetchSalework({ isInit: false, silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeZero, page, limit]);

  // polling realtime
  useEffect(() => {
    if (!polling) return undefined;
    const id = setInterval(() => {
      fetchSalework({ isInit: false, silent: true });
    }, 60000); // 60s
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, includeZero, search]);

  // sales realtime sync (ngầm)
  useEffect(() => {
    if (!salesRealtime) return undefined;
    // sync ngay 1 lần
    syncSalesRealtime({ silent: true });
    const id = setInterval(() => {
      syncSalesRealtime({ silent: true });
    }, 120000); // 2 phút
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesRealtime]);

  const dataSource = useMemo(() => {
    const acc = accountingMapRef.current;
    const agg = accountingAggRef.current;
    const openings = accountingOpeningsRef.current;
    return items.map((x) => {
      const ktTon = openings.has(x.code)
        ? openings.get(x.code)
        : (acc.has(x.code) ? acc.get(x.code) : x.total_stock);
      const a = agg.get(x.code) || { inc: 0, dec: 0 };
      return {
        ...x,
        kt_ton: ktTon,
        kt_inc: a.inc || 0,
        kt_dec: a.dec || 0,
      };
    });
  }, [items, accountingVersion]);

  useEffect(() => {
    const codes = items.map((x) => x.code).filter(Boolean);
    fetchAccountingAggForPage(codes);
    fetchAccountingOpeningsForPage(codes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const openDetail = async (code) => {
    setDetailCode(code);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await inventoryCheckApi.getAccountingMovements({ product_code: code, page: 1, limit: 200 });
      setDetailItems(res.data?.items || []);
    } catch (e) {
      message.error(`Không tải được chi tiết: ${e?.response?.data?.detail || e.message || 'unknown'}`);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns = useMemo(() => {
    return [
      {
        title: 'Mã',
        dataIndex: 'code',
        key: 'code',
        fixed: 'left',
        width: 140,
        render: (v) => <Tag color="geekblue">{v}</Tag>,
      },
      {
        title: 'Tên sản phẩm',
        dataIndex: 'name',
        key: 'name',
        fixed: 'left',
        width: 260,
        render: (v) => <Text strong>{v}</Text>,
      },
      {
        title: <span style={{ color: '#0B4E9B' }}>Tồn SW</span>,
        dataIndex: 'total_stock',
        key: 'sw_ton',
        className: 'sw-col',
        width: 120,
        align: 'right',
        render: (v) => <Text strong>{v}</Text>,
      },
      {
        title: <span style={{ color: '#6B1B1B' }}>Kế toán</span>,
        key: 'kt_group',
        className: 'kt-group',
        children: [
          {
            title: 'Tồn',
            dataIndex: 'kt_ton',
            key: 'kt_ton',
            className: 'kt-col',
            width: 110,
            align: 'right',
            render: (v) => <Text strong>{v}</Text>,
          },
          {
            title: 'Tăng',
            dataIndex: 'kt_inc',
            key: 'kt_tang',
            className: 'kt-col',
            width: 90,
            align: 'right',
            render: (v) => <Text strong>{v || 0}</Text>,
          },
          {
            title: 'Giảm',
            dataIndex: 'kt_dec',
            key: 'kt_giam',
            className: 'kt-col',
            width: 90,
            align: 'right',
            render: (v) => <Text strong>{v || 0}</Text>,
          },
          {
            title: 'Tồn cuối',
            key: 'kt_ton_cuoi',
            className: 'kt-col',
            width: 110,
            align: 'right',
            render: (_, r) => <Text strong>{(Number(r.kt_ton || 0) + Number(r.kt_inc || 0) - Number(r.kt_dec || 0))}</Text>,
          },
        ],
      },
      {
        title: 'Chênh lệch',
        key: 'delta',
        width: 120,
        align: 'right',
        render: (_, r) => {
          const ktClosing = Number(r.kt_ton || 0) + Number(r.kt_inc || 0) - Number(r.kt_dec || 0);
          const sw = Number(r.total_stock || 0);
          const delta = ktClosing - sw;
          const color = delta === 0 ? 'default' : delta > 0 ? 'green' : 'red';
          const text = delta > 0 ? `+${delta}` : String(delta);
          return <Tag color={color}>{text}</Tag>;
        },
      },
      {
        title: '',
        key: 'actions',
        fixed: 'right',
        width: 90,
        align: 'center',
        render: (_, r) => (
          <Button size="small" type="link" onClick={() => openDetail(r.code)} style={{ padding: 0, height: 20 }}>
            Chi tiết
          </Button>
        ),
      },
    ];
  }, []);

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 220px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>
        {`
          /* Tô màu THẲNG theo cột (không dùng selector chéo theo vị trí) */
          .ant-table-thead > tr > th.sw-col { background: #EAF3FF !important; }
          .ant-table-thead > tr > th.kt-col { background: #F5F5F5 !important; }
          .ant-table-tbody > tr > td.sw-col { background: #F2F8FF !important; }
          .ant-table-tbody > tr > td.kt-col { background: #FAFAFA !important; }

          /* Header group (hàng 1) chỉ làm nhạt nhẹ để đồng bộ */
          .ant-table-thead > tr > th.kt-group { background: #F5F5F5 !important; }

          /* Hover vẫn giữ nhận diện màu */
          .ant-table-tbody > tr:hover > td.sw-col { background: #E1EFFF !important; }
          .ant-table-tbody > tr:hover > td.kt-col { background: #F0F0F0 !important; }
        `}
      </style>

      <Card title="Kiểm tồn (Salework vs Kế toán)" size="small" style={{ flex: '0 0 auto' }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={10}>
            <Input.Search
              placeholder="Tìm theo mã / tên sản phẩm"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={() => {
                setPage(1);
                fetchSalework({ isInit: false, silent: false });
              }}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="Kỳ (YYYY-MM)"
              value={periodMonth || undefined}
              options={(periodOptions || []).map((p) => ({ value: p, label: p }))}
              onChange={(v) => setPeriodMonth(v)}
            />
          </Col>
          <Col xs={24} md={4}>
            <Upload
              accept=".xlsx"
              showUploadList={false}
              beforeUpload={async (file) => {
                try {
                  setLoading(true);
                  const res = await inventoryCheckApi.importAccountingMovements(file);
                  message.success(`Đã import: ${res.data?.inserted || 0} dòng (bỏ qua: ${res.data?.skipped || 0})`);
                  // refresh agg for current page
                  const codes = items.map((x) => x.code).filter(Boolean);
                  await fetchAccountingAggForPage(codes);
                } catch (e) {
                  message.error(`Import lỗi: ${e?.response?.data?.detail || e.message || 'unknown'}`);
                } finally {
                  setLoading(false);
                }
                return false;
              }}
            >
              <Button>Nhập Excel (Kế toán)</Button>
            </Upload>
          </Col>
          <Col xs={24} md={4}>
            <Button
              danger
              onClick={() => {
                Modal.confirm({
                  title: 'Chốt số',
                  content: 'Bạn chắc chắn muốn chốt số? Tồn cuối sẽ được gán thành tồn đầu và tăng/giảm sẽ về 0.',
                  okText: 'Chốt số',
                  cancelText: 'Hủy',
                  onOk: async () => {
                    try {
                      setLoading(true);
                      const res = await inventoryCheckApi.closeAccounting();
                      message.success(`Đã chốt kỳ ${res.data?.current_period_month} → ${res.data?.next_period_month} (${res.data?.updated || 0} mã)`);
                      // reload periods
                      try {
                        const pRes = await inventoryCheckApi.getPeriods();
                        const active = pRes.data?.active_period_month || '';
                        const opts = (pRes.data?.items || []).map((x) => x.period_month);
                        setPeriodMonth(active || '');
                        setPeriodOptions(opts.length ? opts : (active ? [active] : []));
                      } catch (e) {}
                      // refresh openings + agg
                      const codes = items.map((x) => x.code).filter(Boolean);
                      await fetchAccountingOpeningsForPage(codes);
                      await fetchAccountingAggForPage(codes);
                    } catch (e) {
                      message.error(`Chốt số lỗi: ${e?.response?.data?.detail || e.message || 'unknown'}`);
                    } finally {
                      setLoading(false);
                    }
                  },
                });
              }}
            >
              Chốt số
            </Button>
          </Col>
          <Col xs={24} md={5}>
            <Button
              type="primary"
              disabled={bootstrapDone}
              onClick={() => {
                Modal.confirm({
                  title: 'Đồng bộ tồn đầu Kế toán',
                  content: 'Nút này chỉ dùng 1 lần duy nhất. Bạn chắc chắn muốn gán tồn Salework hiện tại vào tồn đầu Kế toán?',
                  okText: 'Đồng bộ',
                  cancelText: 'Hủy',
                  onOk: initOpeningsFromSalework,
                });
              }}
            >
              Đồng bộ tồn đầu KT
            </Button>
          </Col>
          <Col xs={24} md={5}>
            <Space>
              <Switch checked={salesRealtime} onChange={(v) => setSalesRealtime(v)} />
              <Text>Số bán realtime</Text>
            </Space>
          </Col>
          <Col xs={24} md={5}>
            <Space>
              <Switch checked={includeZero} onChange={(v) => setIncludeZero(v)} />
              <Text>Hiện tồn = 0</Text>
            </Space>
          </Col>
          <Col xs={24} md={5}>
            <Space>
              <Switch checked={polling} onChange={(v) => setPolling(v)} />
              <Text>Realtime (60s)</Text>
            </Space>
          </Col>
          <Col xs={24} md={4}>
            <Text type="secondary">
              {silentRefreshing ? 'Đang cập nhật ngầm…' : (initializedRef.current ? 'Đã khởi tạo KT' : 'Chưa khởi tạo')}
            </Text>
            <div>
              <Text type="secondary">Tổng mã: {total.toLocaleString('vi-VN')}</Text>
            </div>
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        bodyStyle={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
        style={{ flex: '1 1 auto' }}
      >
        <Table
          rowKey="code"
          loading={loading}
          columns={columns}
          dataSource={dataSource}
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
          sticky
          scroll={{ x: 1400, y: 'calc(100vh - 480px)' }}
          size="small"
          style={{ flex: 1 }}
        />
      </Card>

      <Modal
        title={`Chi tiết biến động - ${detailCode}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={900}
      >
        <Table
          rowKey="id"
          loading={detailLoading}
          dataSource={detailItems}
          pagination={{ pageSize: 20 }}
          size="small"
          columns={[
            { title: 'Ngày', dataIndex: 'date', width: 110 },
            { title: 'Loại', dataIndex: 'type', width: 140 },
            { title: 'Tăng/Giảm', dataIndex: 'direction', width: 90, render: (v) => (v === 'inc' ? <Tag color="green">Tăng</Tag> : <Tag color="red">Giảm</Tag>) },
            { title: 'Số lượng', dataIndex: 'quantity', width: 100, align: 'right' },
            { title: 'Lý do', dataIndex: 'reason' },
            { title: 'Chứng từ', dataIndex: 'document_ref', width: 120 },
          ]}
        />
      </Modal>
    </div>
  );
}

