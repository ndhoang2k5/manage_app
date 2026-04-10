import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Table, Typography, Tag, Spin, Alert, Button, Tabs, message } from 'antd';
import { ShopOutlined, GoldOutlined, ContainerOutlined, RocketOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import reportApi from '../api/reportApi';
import axiosClient from '../api/axiosClient'; 
import { getStoredUser, canViewMaterialCostForBrand } from '../utils/permissions';
const { Title } = Typography;
const CentralDashboard = () => {
    const user = getStoredUser();
    const navigate = useNavigate();

    const { id } = useParams(); 
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const canViewCost = canViewMaterialCostForBrand(user, data?.info?.brand_id);


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
        let isMounted = true; // Tránh lỗi bộ nhớ khi chuyển trang nhanh

        const fetchDashboard = async () => {
            setLoading(true); // Bật xoay
            setErrorMsg(null);
            try {
                const res = await reportApi.getCentralDashboard(id);
                if (isMounted) {
                    setData(res.data);
                }
            } catch (err) {
                if (isMounted) {
                    console.error("Lỗi API Dashboard:", err);
                    // Lấy câu thông báo lỗi từ Backend (nếu có)
                    const detail = err.response?.data?.detail || "Lỗi tải báo cáo! Vui lòng thử lại.";
                    setErrorMsg(detail);
                    // Hiển thị popup lỗi để user biết (Tùy chọn)
                    message.error(detail);
                }
            } finally {
                // block finally LUÔN LUÔN CHẠY dù thành công hay lỗi
                // Đảm bảo tắt vòng xoay
                if (isMounted) {
                    setLoading(false); 
                }
            }
        };

        if (id) {
            fetchDashboard();
        }

        return () => { isMounted = false; };
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
        {
            title: 'Tổng Giá Trị',
            dataIndex: 'total_value',
            key: 'val',
            align: 'right',
            render: (val) => (canViewCost
                ? <span style={{color: 'green', fontWeight: 'bold'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)}</span>
                : <Tag color="default">***</Tag>),
        },
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
        {
            title: 'Tổng tiền',
            dataIndex: 'amount',
            key: 'amt',
            align: 'right',
            render: (val) => (canViewCost
                ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
                : '***'),
        },
    ];

    const totalInventoryValue = data.total_inventory.reduce((sum, item) => sum + item.total_value, 0);

    const handleExportExcel = () => {
        // Vì API trả về File nhị phân (Binary), cách đơn giản nhất là mở URL trên trình duyệt
        // Hoặc dùng thẻ <a> ẩn. Ở đây dùng window.open cho gọn.
        
        const token = localStorage.getItem('token');
        // Gọi thẳng URL API kèm theo token (Cách này hơi trick nếu API chặn auth qua header)
        // Cách chuẩn nhất với Axios là dùng responseType: 'blob'
        
        axiosClient.get(`/reports/export-inventory/${id}`, { responseType: 'blob' })
            .then((response) => {
                // Tạo một đường link ảo để tải file
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                
                // Lấy tên file từ Header (nếu có) hoặc đặt mặc định
                let fileName = `TonKho_${data?.info?.name || 'Kho'}.xlsx`;
                
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                link.remove();
            })
            .catch(err => {
                console.error(err);
                alert("Lỗi khi xuất Excel!");
            });
    };

    return (
        <div style={{ background: '#f0f2f5', minHeight: '100vh', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Title level={2} style={{ margin: 0 }}>
                    <ShopOutlined /> {data.info.name} <Tag color="blue">{data.info.brand}</Tag>
                </Title>
                
                {/* NÚT XUẤT EXCEL */}
                {canViewCost ? (
                    <Button 
                        type="primary" 
                        icon={<DownloadOutlined />} 
                        size="large"
                        onClick={handleExportExcel}
                        style={{ background: '#107c41', borderColor: '#107c41' }}
                    >
                        Xuất Excel Tồn Kho Toàn Hệ Thống
                    </Button>
                ) : null}
            </div>
            
            <div style={{ marginBottom: 24 }}>
                <Title level={3} style={{ margin: 0 }}>📊 Dashboard: {data.info.name}</Title>
                <span style={{ color: '#888' }}>Thương hiệu: {data.info.brand}</span>
            </div>

            <Row gutter={[16, 16]}>
                <Col span={6}>
                    <Card bordered={false} style={{borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)'}}>
                        {canViewCost ? (
                            <Statistic title="Tổng Giá Trị Tài Sản" value={totalInventoryValue} precision={0} valueStyle={{ color: '#3f8600' }} prefix={<GoldOutlined />} formatter={(val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)} />
                        ) : (
                            <Statistic title="Tổng Giá Trị Tài Sản" value="***" prefix={<GoldOutlined />} valueStyle={{ color: '#999' }} />
                        )}
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
                                        <Card hoverable onClick={() => navigate(`/workshop/${w.id}`)} style={{borderRadius: 8, borderColor: '#d9d9d9'}}>
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