import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Row, Col, Statistic, Tabs, Table, Tag, message, Spin, Typography, Alert, Button } from 'antd';
import { GoldOutlined, ShopOutlined, ContainerOutlined, RocketOutlined, ReloadOutlined } from '@ant-design/icons';
import reportApi from '../api/reportApi';
import dayjs from 'dayjs';
const { Title } = Typography;

const CentralDashboard = () => {
    const { id } = useParams(); 
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    const fetchDashboardData = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const warehouseId = id || 1; 
            const response = await reportApi.getCentralDashboard(warehouseId);
            setData(response.data);
        } catch (error) {
            console.error("Lỗi API:", error);
            setErrorMsg(error.response?.data?.detail || "Không thể kết nối đến Server");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchDashboardData();
    }, [id]);

    if (loading) return <div style={{height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><Spin size="large" tip="Đang tải dữ liệu..." /></div>;
    if (errorMsg) return <div style={{padding: 40}}><Alert message="Gặp lỗi khi tải dữ liệu" description={errorMsg} type="error" showIcon action={<Button size="small" type="primary" danger onClick={fetchDashboardData} icon={<ReloadOutlined />}>Thử lại</Button>} /></div>;
    if (!data) return <div>Không có dữ liệu hiển thị</div>;

    // --- CẤU HÌNH CỘT BẢNG ---

    // 1. Bảng Tồn kho (Đã thêm cột Ghi chú)
    const inventoryColumns = [
        { title: 'Mã SKU', dataIndex: 'sku', key: 'sku', render: t => <b>{t}</b> },
        { title: 'Tên Sản Phẩm / NVL', dataIndex: 'name', key: 'name' },
        
        // --- CỘT GHI CHÚ MỚI ---
        { 
            title: 'Ghi chú', 
            dataIndex: 'note', 
            key: 'note',
            render: (t) => t ? <span style={{color: '#888', fontSize: 12, fontStyle: 'italic'}}>{t}</span> : '-'
        },
        // -----------------------

        { title: 'Đơn vị', dataIndex: 'unit', key: 'unit', align: 'center' },
        { title: 'Tổng Tồn', dataIndex: 'total_quantity', key: 'qty', align: 'center', render: (qty) => <Tag color="blue">{qty}</Tag> },
        { title: 'Tổng Giá Trị', dataIndex: 'total_value', key: 'val', align: 'right', render: (val) => <span style={{color: 'green', fontWeight: 'bold'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)}</span> },
    ];

    const productionColumns = [
        { title: 'Mã Lệnh', dataIndex: 'code', key: 'code' },
        { title: 'Đang may tại', dataIndex: 'workshop', key: 'workshop', render: t => <Tag color="orange">{t}</Tag> },
        { title: 'Sản phẩm', dataIndex: 'product', key: 'product' },
        { title: 'Tiến độ', render: (_, r) => `${r.finished} / ${r.planned}` },
        { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: t => <Tag color="processing">{t.toUpperCase()}</Tag> }
    ];

    const poColumns = [
        { title: 'Mã PO', dataIndex: 'code', key: 'code' },
        { title: 'Nhà Cung Cấp', dataIndex: 'supplier', key: 'sup' },
        { title: 'Ngày nhập', dataIndex: 'date', key: 'date' },
        { title: 'Tổng tiền', dataIndex: 'amount', key: 'amt', align: 'right', render: (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val) },
    ];

    const totalInventoryValue = data.total_inventory.reduce((sum, item) => sum + item.total_value, 0);

    return (
        <div>
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0 }}>📊 Dashboard: {data.info.name}</Title>
                <span style={{ color: '#888' }}>Thương hiệu: {data.info.brand}</span>
            </div>

            <Row gutter={[16, 16]}>
                <Col span={6}>
                    <Card bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)'}}>
                        <Statistic title="Tổng Giá Trị Tài Sản" value={totalInventoryValue} precision={0} valueStyle={{ color: '#3f8600' }} prefix={<GoldOutlined />} formatter={(val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)'}}>
                        <Statistic title="Mạng lưới Xưởng con" value={data.workshops.length} prefix={<ShopOutlined />} suffix="Xưởng" />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)'}}>
                        <Statistic title="Đơn Nhập gần đây" value={data.recent_purchases.length} prefix={<ContainerOutlined />} />
                    </Card>
                </Col>
                <Col span={6}>
                    <Card bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)'}}>
                        <Statistic title="Lệnh SX Đang Chạy" value={data.active_production.length} valueStyle={{ color: '#1677ff' }} prefix={<RocketOutlined />} />
                    </Card>
                </Col>
            </Row>

            <Card style={{ marginTop: 24 }} bordered={false}>
                <Tabs defaultActiveKey="1" items={[
                    { key: '1', label: `📦 Tồn kho Toàn Chuỗi (${data.total_inventory.length})`, children: <Table dataSource={data.total_inventory} columns={inventoryColumns} rowKey="sku" pagination={{pageSize: 8}} /> },
                    { key: '2', label: `⚙️ Giám sát Sản xuất (${data.active_production.length})`, children: <Table dataSource={data.active_production} columns={productionColumns} rowKey="code" /> },
                    { key: '3', label: '🚚 Lịch sử Nhập Kho Tổng', children: <Table dataSource={data.recent_purchases} columns={poColumns} rowKey="code" /> },
                    { 
                        key: '4', 
                        label: '🏭 Mạng lưới Xưởng Con', 
                        children: (
                            <Row gutter={[16, 16]}>
                                {data.workshops.map(w => (
                                    <Col span={8} key={w.id}>
                                        <Card hoverable onClick={() => window.location.href = `/workshop/${w.id}`} style={{borderRadius: 8, borderColor: '#d9d9d9'}}>
                                            <Card.Meta avatar={<ShopOutlined style={{fontSize: 24, color: '#1677ff'}} />} title={w.name} description={w.address || "Chưa cập nhật địa chỉ"} />
                                            <div style={{marginTop: 10, textAlign: 'right', color: '#1677ff'}}>Xem chi tiết &rarr;</div>
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        ) 
                    }
                ]} />
            </Card>
        </div>
    );
};

export default CentralDashboard;