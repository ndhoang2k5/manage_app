import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import salesManagementApi from '../api/salesManagementApi';

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

  const fetchCodeOptions = async (keyword = '') => {
    setLoadingOptions(true);
    try {
      const res = await salesManagementApi.searchProductCodes({ keyword, limit: 50 });
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

  const handleAnalyze = async () => {
    if (!selectedCodes.length) {
      message.warning('Vui lòng chọn ít nhất 1 mã sản phẩm');
      return;
    }

    setLoadingPlan(true);
    try {
      const res = await salesManagementApi.getProductPlanning4w({
        codes: selectedCodes,
        anchor_time_ms: anchorDate ? anchorDate.valueOf() : undefined,
        weeks: 4,
      });
      const data = res?.data?.data || {};
      setWeeksMeta(data.weeks || []);
      setRows(data.items || []);
      setSummary(data.summary || null);
    } catch (error) {
      message.error(error?.response?.data?.detail || 'Lỗi tính kế hoạch sản phẩm');
    } finally {
      setLoadingPlan(false);
    }
  };

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
        title: 'Số tuần bán hết (ước tính)',
        key: 'weeks_to_stockout',
        width: 200,
        align: 'right',
        render: (_, r) => {
          if (r.weeks_to_stockout === null || r.weeks_to_stockout === undefined) return 'Chưa có dữ liệu';
          return `${Number(r.weeks_to_stockout).toFixed(2)} tuần`;
        },
      },
    ],
    [weekColumns]
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        bordered={false}
        title={<Title level={5} style={{ margin: 0 }}>Quản lý tạo sản phẩm</Title>}
        extra={<Text type="secondary">Phân tích tốc độ bán 4 tuần gần nhất để lên kế hoạch sản xuất</Text>}
      >
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={24} xl={14}>
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
          <Col xs={24} md={14} xl={6}>
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
        </Row>
      </Card>

      <Card size="small" bordered={false}>
        <Table
          rowKey="code"
          dataSource={rows}
          columns={columns}
          loading={loadingPlan}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1400 }}
          size="middle"
        />
      </Card>
    </Space>
  );
};

export default ProductPlanningPage;
