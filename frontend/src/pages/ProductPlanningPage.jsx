import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import salesManagementApi from '../api/salesManagementApi';
import warehouseApi from '../api/warehouseApi';
import productApi from '../api/productApi';
import productionApi from '../api/productionApi';

const { Text, Title } = Typography;

const ProductPlanningPage = () => {
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [codeOptions, setCodeOptions] = useState([]);
  const [weeksMeta, setWeeksMeta] = useState([]);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [anchorDate, setAnchorDate] = useState(dayjs());
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);

  const [centralWarehouses, setCentralWarehouses] = useState([]);
  const [selectedCentralWarehouse, setSelectedCentralWarehouse] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [conversionRows, setConversionRows] = useState([]);

  const [baseOutstandingByCode, setBaseOutstandingByCode] = useState({});
  const [outstandingByCode, setOutstandingByCode] = useState({});
  const [manualOutstandingTouched, setManualOutstandingTouched] = useState({});

  const fetchCodeOptions = async (keyword = '') => {
    setLoadingOptions(true);
    try {
      const res = await salesManagementApi.searchProductCodesForPlanning({ keyword, limit: 50 });
      const data = res?.data?.data || [];
      const options = data.map((item) => ({
        label: `${item.code} - ${item.name || 'Chưa có tên'} (Tồn: ${Number(item.current_stock || 0).toLocaleString('vi-VN')})`,
        value: item.code,
      }));
      setCodeOptions(options);
    } catch (error) {
      message.error(error?.response?.data?.detail || 'Lỗi tải danh sách mã sản phẩm');
    } finally {
      setLoadingOptions(false);
    }
  };

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await warehouseApi.getAllWarehouses();
        const all = res?.data || [];
        const centrals = all.filter(
          (w) => Number(w?.is_central || 0) === 1 || String(w?.type_name || '').toLowerCase() === 'kho tổng'.toLowerCase()
        );
        setCentralWarehouses(centrals);
      } catch (error) {
        message.error('Lỗi tải danh sách kho tổng');
      }
    };
    loadWarehouses();
  }, []);

  const loadMaterialsByCentral = async (warehouseId) => {
    if (!warehouseId) {
      setMaterials([]);
      return;
    }
    setLoadingMaterials(true);
    try {
      const res = await productApi.getByWarehouse(warehouseId);
      setMaterials(Array.isArray(res?.data) ? res.data : []);
    } catch (error) {
      message.error('Lỗi tải danh sách vải trong kho tổng');
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleChangeCentralWarehouse = async (warehouseId) => {
    setSelectedCentralWarehouse(warehouseId);
    setConversionRows([]);
    await loadMaterialsByCentral(warehouseId);
  };

  const fetchOutstandingBySku = async (codes) => {
    const normalized = Array.from(
      new Set(
        (codes || [])
          .map((c) => String(c || '').trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (!normalized.length) return {};

    const codeSet = new Set(normalized);
    const result = {};
    let page = 1;
    const limit = 200;
    let total = 0;

    do {
      const res = await productionApi.getOrdersManagement({
        page,
        limit,
        include_completed: false,
      });
      const payload = res?.data || {};
      const data = payload?.data || [];
      total = Number(payload?.total || 0);

      data.forEach((order) => {
        // Ưu tiên tính theo từng dòng SKU SP trong bảng sizes.
        const sizes = Array.isArray(order?.sizes) ? order.sizes : [];
        sizes.forEach((line) => {
          const rawSku = String(line?.size || '').trim();
          if (!rawSku) return;
          const normalizedSku = rawSku.toUpperCase().startsWith('SKU:')
            ? rawSku.slice(4).trim().toUpperCase()
            : rawSku.toUpperCase();
          if (!codeSet.has(normalizedSku)) return;

          const planned = Number(line?.quantity || 0);
          const finished = Number(line?.finished || 0);
          const outstanding = Math.max(planned - finished, 0);
          result[normalizedSku] = Number(result[normalizedSku] || 0) + outstanding;
        });
      });

      page += 1;
    } while ((page - 1) * limit < total && page <= 30);

    return result;
  };

  const refreshOutstandingForSelected = async ({ resetManual = false } = {}) => {
    const normalized = Array.from(new Set((selectedCodes || []).map((c) => String(c || '').trim()).filter(Boolean)));
    if (!normalized.length) {
      setBaseOutstandingByCode({});
      if (resetManual) {
        setManualOutstandingTouched({});
        setOutstandingByCode({});
      }
      return;
    }

    const map = await fetchOutstandingBySku(normalized);
    setBaseOutstandingByCode(map || {});
    setOutstandingByCode((prev) => {
      const next = {};
      normalized.forEach((code) => {
        const isManual = !resetManual && manualOutstandingTouched?.[code];
        next[code] = isManual ? Number(prev?.[code] || 0) : Number(map?.[code] || 0);
      });
      return next;
    });
    if (resetManual) {
      setManualOutstandingTouched({});
    }
  };

  const handleAnalyze = async () => {
    if (!selectedCodes.length) {
      message.warning('Vui lòng chọn ít nhất 1 mã sản phẩm');
      return;
    }

    setLoadingPlan(true);
    try {
      const [salesRes, outstandingMap] = await Promise.all([
        salesManagementApi.getProductPlanning4w({
          codes: selectedCodes,
          anchor_time_ms: anchorDate ? anchorDate.valueOf() : undefined,
          weeks: 4,
        }),
        fetchOutstandingBySku(selectedCodes),
      ]);
      const data = salesRes?.data?.data || {};
      setWeeksMeta(data.weeks || []);
      setRows(data.items || []);
      setSummary(data.summary || null);
      setBaseOutstandingByCode(outstandingMap || {});
      setOutstandingByCode(outstandingMap || {});
      setManualOutstandingTouched({});
    } catch (error) {
      message.error(error?.response?.data?.detail || 'Lỗi tính kế hoạch sản phẩm');
    } finally {
      setLoadingPlan(false);
    }
  };

  const materialMap = useMemo(() => {
    const map = new Map();
    (materials || []).forEach((m) => {
      map.set(Number(m.id), m);
    });
    return map;
  }, [materials]);

  const productCodeOptionsForConvert = useMemo(() => {
    const seen = new Set();
    const opts = [];
    (rows || []).forEach((r) => {
      const code = String(r.code || '').trim();
      if (!code || seen.has(code)) return;
      seen.add(code);
      opts.push({ value: code, label: `${code} - ${r.name || 'Chưa có tên'}` });
    });
    (selectedCodes || []).forEach((code) => {
      const c = String(code || '').trim();
      if (!c || seen.has(c)) return;
      seen.add(c);
      opts.push({ value: c, label: c });
    });
    return opts;
  }, [rows, selectedCodes]);

  const addConversionRow = () => {
    setConversionRows((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        product_code: productCodeOptionsForConvert?.[0]?.value || '',
        material_id: undefined,
        fabric_qty: 0,
        consumption_norm: 1,
      },
    ]);
  };

  const updateConversionRow = (rowId, patch) => {
    setConversionRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const next = { ...r, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, 'material_id')) {
          const mat = materialMap.get(Number(patch.material_id));
          if (mat) {
            next.fabric_qty = Number(mat.quantity_on_hand || 0);
          }
        }
        return next;
      })
    );
  };

  const removeConversionRow = (rowId) => {
    setConversionRows((prev) => prev.filter((r) => r.id !== rowId));
  };

  // Với mỗi SKU, lấy tồn bán thành phẩm theo loại vải thấp nhất (bottleneck).
  const conversionByCode = useMemo(() => {
    const grouped = {};
    (conversionRows || []).forEach((r) => {
      const code = String(r.product_code || '').trim();
      const qty = Number(r.fabric_qty || 0);
      const norm = Number(r.consumption_norm || 0);
      if (!code || qty <= 0 || norm <= 0) return;
      const converted = qty / norm;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(converted);
    });

    const output = {};
    Object.keys(grouped).forEach((code) => {
      output[code] = grouped[code].length ? Math.min(...grouped[code]) : 0;
    });
    return output;
  }, [conversionRows]);

  useEffect(() => {
    setOutstandingByCode((prev) => {
      const next = {};
      (selectedCodes || []).forEach((code) => {
        const sku = String(code || '').trim();
        if (!sku) return;
        if (Object.prototype.hasOwnProperty.call(prev || {}, sku)) {
          next[sku] = Number(prev?.[sku] || 0);
        } else {
          next[sku] = Number(baseOutstandingByCode?.[sku] || 0);
        }
      });
      return next;
    });
  }, [selectedCodes, baseOutstandingByCode]);

  useEffect(() => {
    if (!selectedCodes.length) return;
    // Khi đổi danh sách mã, luôn đồng bộ lại theo logic hệ thống.
    refreshOutstandingForSelected({ resetManual: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCodes]);

  useEffect(() => {
    if (!selectedCodes.length) return undefined;
    // Auto refresh định kỳ để số "SP chưa trả" nhảy theo thực tế khi có nhập trả hàng.
    const timer = setInterval(() => {
      refreshOutstandingForSelected({ resetManual: false });
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCodes, manualOutstandingTouched]);

  const totalOutstanding = useMemo(
    () => (selectedCodes || []).reduce((acc, code) => acc + Number(outstandingByCode?.[code] || 0), 0),
    [outstandingByCode, selectedCodes]
  );

  const totalConvertedStock = useMemo(
    () => Object.values(conversionByCode || {}).reduce((acc, val) => acc + Number(val || 0), 0),
    [conversionByCode]
  );

  const totalMaintainableStock = useMemo(
    () => Number(summary?.total_stock || 0) + Number(totalConvertedStock || 0) + Number(totalOutstanding || 0),
    [summary, totalConvertedStock, totalOutstanding]
  );

  const weekColumns = useMemo(() => {
    return (weeksMeta || []).map((w, idx) => ({
      title: (
        <div style={{ textAlign: 'right' }}>
          <div>Tuần {idx + 1}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {dayjs(w.time_start).format('DD/MM')} - {dayjs(w.time_end).format('DD/MM')}
          </Text>
        </div>
      ),
      key: `w-${idx}`,
      width: 120,
      align: 'right',
      render: (_, r) => Number(r.weekly_sales?.[idx] || 0).toLocaleString('vi-VN'),
    }));
  }, [weeksMeta]);

  const columns = useMemo(
    () => [
      {
        title: 'Mã sản phẩm',
        dataIndex: 'code',
        width: 170,
        fixed: 'left',
        render: (v) => <b>{v}</b>,
      },
      {
        title: 'Tên sản phẩm',
        dataIndex: 'name',
        width: 300,
      },
      ...weekColumns,
      {
        title: 'Trung bình bán/tuần',
        key: 'avg_weekly_sales',
        width: 170,
        align: 'right',
        render: (_, r) => Number(r.avg_weekly_sales || 0).toLocaleString('vi-VN'),
      },
      {
        title: 'Tồn hiện tại',
        key: 'current_stock',
        width: 140,
        align: 'right',
        render: (_, r) => <Text strong>{Number(r.current_stock || 0).toLocaleString('vi-VN')}</Text>,
      },
      {
        title: 'Số lượng SP chưa trả',
        key: 'outstanding_qty',
        width: 170,
        align: 'right',
        render: (_, r) => Number(outstandingByCode[r.code] || 0).toLocaleString('vi-VN'),
      },
      {
        title: 'Số tuần bán hết (ước tính)',
        key: 'weeks_to_stockout',
        width: 200,
        align: 'right',
        render: (_, r) => {
          if (r.weeks_to_stockout === null || r.weeks_to_stockout === undefined) return 'Chưa có dữ liệu';
          return `${Number(r.weeks_to_stockout).toFixed(2)} tuần`;
        },
      },
      {
        title: 'Tồn vải (quy đổi)',
        key: 'converted_stock',
        width: 210,
        align: 'right',
        render: (_, r) => Number(conversionByCode[r.code] || 0).toLocaleString('vi-VN'),
      },
      {
        title: 'Tổng tồn duy trì',
        key: 'total_maintainable_stock',
        width: 170,
        align: 'right',
        render: (_, r) => {
          const total = Number(r.current_stock || 0) + Number(outstandingByCode[r.code] || 0) + Number(conversionByCode[r.code] || 0);
          return <Text strong>{total.toLocaleString('vi-VN')}</Text>;
        },
      },
      {
        title: 'Số tuần duy trì (tổng tồn)',
        key: 'weeks_to_stockout_total',
        width: 210,
        align: 'right',
        render: (_, r) => {
          const avg = Number(r.avg_weekly_sales || 0);
          const total = Number(r.current_stock || 0) + Number(outstandingByCode[r.code] || 0) + Number(conversionByCode[r.code] || 0);
          if (avg <= 0) return 'Chưa có dữ liệu';
          return `${Number(total / avg).toFixed(2)} tuần`;
        },
      },
    ],
    [weekColumns, conversionByCode, outstandingByCode]
  );

  const conversionColumns = useMemo(
    () => [
      {
        title: 'Mã SKU sản phẩm',
        dataIndex: 'product_code',
        width: 230,
        render: (value, record) => (
          <Select
            showSearch
            value={value || undefined}
            placeholder="Chọn mã sản phẩm"
            options={productCodeOptionsForConvert}
            onChange={(v) => updateConversionRow(record.id, { product_code: v })}
            style={{ width: '100%' }}
            optionFilterProp="label"
          />
        ),
      },
      {
        title: 'Vải trong kho tổng',
        dataIndex: 'material_id',
        width: 360,
        render: (value, record) => (
          <Select
            showSearch
            value={value}
            placeholder="Chọn mã vải"
            style={{ width: '100%' }}
            loading={loadingMaterials}
            optionFilterProp="label"
            options={(materials || []).map((m) => ({
              value: m.id,
              label: `${m.sku} - ${m.variant_name} (Tồn: ${Number(m.quantity_on_hand || 0).toLocaleString('vi-VN')})`,
            }))}
            onChange={(v) => updateConversionRow(record.id, { material_id: v })}
          />
        ),
      },
      {
        title: 'Số lượng vải quy đổi',
        dataIndex: 'fabric_qty',
        width: 170,
        align: 'right',
        render: (value, record) => (
          <InputNumber
            min={0}
            step={0.0001}
            value={value}
            style={{ width: '100%' }}
            onChange={(v) => updateConversionRow(record.id, { fabric_qty: Number(v || 0) })}
            formatter={(v) => {
              if (v === undefined || v === null || v === '') return '';
              const num = Number(String(v).replace(/,/g, ''));
              if (Number.isNaN(num)) return '';
              return num.toString();
            }}
            parser={(v) => String(v || '').replace(/,/g, '')}
          />
        ),
      },
      {
        title: 'Định mức (vải/SP)',
        dataIndex: 'consumption_norm',
        width: 160,
        align: 'right',
        render: (value, record) => (
          <InputNumber
            min={0.0001}
            step={0.0001}
            value={value}
            style={{ width: '100%' }}
            onChange={(v) => updateConversionRow(record.id, { consumption_norm: Number(v || 0) })}
            formatter={(v) => {
              if (v === undefined || v === null || v === '') return '';
              const num = Number(String(v).replace(/,/g, ''));
              if (Number.isNaN(num)) return '';
              return num.toString();
            }}
            parser={(v) => String(v || '').replace(/,/g, '')}
          />
        ),
      },
      {
        title: 'Tồn bán thành phẩm',
        key: 'converted_qty',
        width: 170,
        align: 'right',
        render: (_, record) => {
          const qty = Number(record.fabric_qty || 0);
          const norm = Number(record.consumption_norm || 0);
          const converted = norm > 0 ? qty / norm : 0;
          return <Text strong>{Number(converted || 0).toLocaleString('vi-VN')}</Text>;
        },
      },
      {
        title: '',
        key: 'action',
        width: 80,
        align: 'center',
        render: (_, record) => (
          <Button danger size="small" onClick={() => removeConversionRow(record.id)}>
            Xóa
          </Button>
        ),
      },
    ],
    [loadingMaterials, materials, productCodeOptionsForConvert]
  );

  const aggregateRow = useMemo(() => {
    const weeksCount = (weeksMeta || []).length;
    const weeklyTotals = Array.from({ length: weeksCount }, (_, idx) =>
      (rows || []).reduce((acc, r) => acc + Number(r?.weekly_sales?.[idx] || 0), 0)
    );
    const total4wSales = weeklyTotals.reduce((acc, v) => acc + Number(v || 0), 0);
    const avgWeeklySalesAll = weeksCount > 0 ? total4wSales / weeksCount : 0;
    const totalCurrentStock = (rows || []).reduce((acc, r) => acc + Number(r?.current_stock || 0), 0);
    const weeksToStockoutAll = avgWeeklySalesAll > 0 ? totalCurrentStock / avgWeeklySalesAll : null;
    const weeksToMaintainAll = avgWeeklySalesAll > 0 ? totalMaintainableStock / avgWeeklySalesAll : null;
    return {
      weeklyTotals,
      avgWeeklySalesAll,
      totalCurrentStock,
      weeksToStockoutAll,
      weeksToMaintainAll,
    };
  }, [rows, weeksMeta, totalMaintainableStock]);

  const selectedCodeBlocks = useMemo(() => {
    const nameMap = {};
    (rows || []).forEach((r) => {
      nameMap[r.code] = r.name || '';
    });
    return (selectedCodes || []).map((code) => ({
      code,
      name: nameMap[code] || '',
    }));
  }, [selectedCodes, rows]);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        bordered={false}
        title={<Title level={5} style={{ margin: 0 }}>Kế hoạch đặt vải</Title>}
        extra={<Text type="secondary">Phân tích tốc độ bán 4 tuần gần nhất để lên kế hoạch sản xuất</Text>}
      >
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={24} xl={16}>
            <Text strong>Chọn mã con sản phẩm</Text>
            <Select
              mode="multiple"
              allowClear
              showSearch
              style={{ width: '100%', marginTop: 6 }}
              placeholder="Ví dụ: PN06108, PN06109..."
              options={codeOptions}
              value={selectedCodes}
              onChange={setSelectedCodes}
              onSearch={fetchCodeOptions}
              onFocus={() => {
                if (!codeOptions.length) fetchCodeOptions('');
              }}
              filterOption={false}
              loading={loadingOptions}
            />
          </Col>
          <Col xs={24} md={10} xl={4}>
            <Text strong>Mốc thời gian phân tích</Text>
            <DatePicker
              value={anchorDate}
              onChange={setAnchorDate}
              placeholder="Chọn ngày"
              style={{ width: '100%', marginTop: 6 }}
              format="DD/MM/YYYY"
            />
          </Col>
          <Col xs={24} md={14} xl={4}>
            <Button
              type="primary"
              onClick={handleAnalyze}
              loading={loadingPlan}
              style={{ width: '100%' }}
            >
              Phân tích dữ liệu 4 tuần
            </Button>
          </Col>
        </Row>

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <Text strong>Danh sách mã con đã chọn (hàng dọc)</Text>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedCodeBlocks.length === 0 ? (
              <Text type="secondary">Chưa chọn mã sản phẩm</Text>
            ) : (
              selectedCodeBlocks.map((item) => (
                <div
                  key={item.code}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 240px',
                    gap: 12,
                    alignItems: 'center',
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  <div>
                    <Tag style={{ marginRight: 8 }}>
                      <b>{item.code}</b>
                    </Tag>
                    <Text>{item.name || ''}</Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Số SP chưa trả</Text>
                    <InputNumber
                      min={0}
                      value={Number(outstandingByCode?.[item.code] || 0)}
                      onChange={(val) => {
                        setManualOutstandingTouched((prev) => ({ ...prev, [item.code]: true }));
                        setOutstandingByCode((prev) => ({
                          ...prev,
                          [item.code]: Number(val || 0),
                        }));
                      }}
                      style={{ width: '100%', marginTop: 4 }}
                      placeholder="Mặc định 0"
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic
                title="Số SP chưa trả (đang ở xưởng)"
                value={totalOutstanding}
                formatter={(value) => Number(value || 0).toLocaleString('vi-VN')}
              />
            </Card>
          </Col>
        </Row>

        <Divider style={{ margin: '16px 0 12px' }} />

        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Số mã đã chọn" value={summary?.selected_codes || 0} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic
                title="Tổng tồn hiện tại"
                value={summary?.total_stock || 0}
                formatter={(value) => Number(value || 0).toLocaleString('vi-VN')}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic
                title="Tổng bán 4 tuần"
                value={summary?.total_4w_sales || 0}
                formatter={(value) => Number(value || 0).toLocaleString('vi-VN')}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic
                title="Tổng tồn bán thành phẩm (quy đổi)"
                value={totalConvertedStock}
                formatter={(value) => Number(value || 0).toLocaleString('vi-VN')}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic
                title="Tổng tồn duy trì (tồn + chưa trả + quy đổi)"
                value={totalMaintainableStock}
                formatter={(value) => Number(value || 0).toLocaleString('vi-VN')}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        size="small"
        bordered={false}
        title="Bảng quy đổi vải theo từng mã SKU sản phẩm"
        extra={
          <Space>
            <Select
              allowClear
              showSearch
              value={selectedCentralWarehouse}
              placeholder="Chọn kho tổng"
              style={{ width: 260 }}
              optionFilterProp="label"
              options={(centralWarehouses || []).map((w) => ({
                value: w.id,
                label: w.name,
              }))}
              onChange={handleChangeCentralWarehouse}
            />
            <Button type="primary" disabled={!selectedCentralWarehouse} onClick={addConversionRow}>
              Thêm dòng quy đổi
            </Button>
          </Space>
        }
      >
        {!selectedCentralWarehouse ? (
          <Alert
            type="info"
            showIcon
            message="Vui lòng chọn kho tổng để tải danh sách vải và thực hiện quy đổi."
          />
        ) : (
          <Alert
            type="info"
            showIcon
            message="Nếu 1 SKU có nhiều loại vải, tồn bán thành phẩm sẽ lấy theo loại vải cho ra số thấp nhất."
            style={{ marginBottom: 12 }}
          />
        )}
        <Table
          rowKey="id"
          dataSource={conversionRows}
          columns={conversionColumns}
          pagination={false}
          size="small"
          locale={{ emptyText: 'Chưa có dòng quy đổi. Bấm "Thêm dòng quy đổi" để bắt đầu.' }}
          scroll={{ x: 1300 }}
          loading={loadingMaterials}
        />
      </Card>

      <Card size="small" bordered={false}>
        <Table
          rowKey="code"
          dataSource={rows}
          columns={columns}
          loading={loadingPlan}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1800 }}
          size="middle"
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafafa' }}>
                <Table.Summary.Cell index={0}>
                  <Text strong>TỔNG SKU CHA</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Text type="secondary">{rows.length} SKU con</Text>
                </Table.Summary.Cell>
                {(aggregateRow.weeklyTotals || []).map((val, idx) => (
                  <Table.Summary.Cell key={`weekly-total-${idx}`} index={idx + 2} align="right">
                    <Text strong>{Number(val || 0).toLocaleString('vi-VN')}</Text>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={2 + (weeksMeta || []).length} align="right">
                  <Text strong>{Number(aggregateRow.avgWeeklySalesAll || 0).toLocaleString('vi-VN')}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3 + (weeksMeta || []).length} align="right">
                  <Text strong>{Number(aggregateRow.totalCurrentStock || 0).toLocaleString('vi-VN')}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4 + (weeksMeta || []).length} align="right">
                  <Text strong>{Number(totalOutstanding || 0).toLocaleString('vi-VN')}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5 + (weeksMeta || []).length} align="right">
                  <Text strong>
                    {aggregateRow.weeksToStockoutAll === null
                      ? 'Chưa có dữ liệu'
                      : `${Number(aggregateRow.weeksToStockoutAll).toFixed(2)} tuần`}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6 + (weeksMeta || []).length} align="right">
                  <Text strong>{Number(totalConvertedStock || 0).toLocaleString('vi-VN')}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={7 + (weeksMeta || []).length} align="right">
                  <Text strong>{Number(totalMaintainableStock || 0).toLocaleString('vi-VN')}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8 + (weeksMeta || []).length} align="right">
                  <Text strong>
                    {aggregateRow.weeksToMaintainAll === null
                      ? 'Chưa có dữ liệu'
                      : `${Number(aggregateRow.weeksToMaintainAll).toFixed(2)} tuần`}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>
    </Space>
  );
};

export default ProductPlanningPage;
