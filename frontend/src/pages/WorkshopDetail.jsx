import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Table, Tag, Button, Spin, Typography, Tabs, Alert } from 'antd';
import { ArrowLeftOutlined, GoldOutlined, ShopOutlined, ReloadOutlined } from '@ant-design/icons';
import reportApi from '../api/reportApi';
import { getStoredUser, canViewMaterialCostForBrand } from '../utils/permissions';

const { Title } = Typography;

const WorkshopDetail = () => {
    const user = getStoredUser();
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const canViewCost = canViewMaterialCostForBrand(user, data?.info?.brand_id);

    const fetchDetail = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await reportApi.getWorkshopDetail(id);
            setData(res.data);
        } catch (error) {
            console.error(error);
            setErrorMsg(error.response?.data?.detail || 'Không thể tải chi tiết xưởng');
            setData(null);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchDetail();
    }, [id]);

    if (loading) return <div style={{textAlign: 'center', marginTop: 50}}><Spin size="large"/></div>;
    if (errorMsg) return (
        <div style={{ padding: 24 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>Quay lại</Button>
            <Alert
                message="Không thể truy cập xưởng con"
                description={errorMsg}
                type="error"
                showIcon
                action={<Button size="small" type="primary" danger onClick={fetchDetail} icon={<ReloadOutlined />}>Thử lại</Button>}
            />
        </div>
    );
    if (!data) return <div>Không tìm thấy dữ liệu</div>;

    // Cột bảng Tồn kho (Đã thêm Ghi chú)
    const stockColumns = [
        { title: 'Mã SKU', dataIndex: 'sku', key: 'sku' },
        { title: 'Tên Vật Tư / Sản Phẩm', dataIndex: 'name', key: 'name', render: t => <b>{t}</b> },
        
        // --- CỘT GHI CHÚ MỚI ---
        { 
            title: 'Ghi chú', 
            dataIndex: 'note', 
            key: 'note',
            render: (t) => t ? <span style={{color: '#888', fontSize: 12, fontStyle: 'italic'}}>{t}</span> : '-'
        },
        // -----------------------

        { 
            title: 'Loại', 
            dataIndex: 'type', 
            key: 'type',
            render: t => <Tag color={t === 'material' ? 'blue' : 'green'}>{t === 'material' ? 'Nguyên liệu' : 'Thành phẩm'}</Tag>
        },
        { title: 'Số lượng', dataIndex: 'qty', key: 'qty', align: 'center' },
        {
            title: 'Tổng Giá Trị',
            dataIndex: 'value',
            key: 'val',
            align: 'right',
            render: (v) => (canViewCost
                ? <span style={{color: '#3f8600'}}>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v)}</span>
                : <Tag color="default">***</Tag>),
        },
    ];

    // Cột bảng Sản xuất
    const prodColumns = [
        { title: 'Mã Lệnh', dataIndex: 'code', key: 'code' },
        { title: 'Sản phẩm đang may', dataIndex: 'product', key: 'product' },
        { title: 'Tiến độ', render: (_, r) => `${r.finished} / ${r.planned}` },
        { title: 'Hạn chót', dataIndex: 'due_date', key: 'due' },
        { 
            title: 'Trạng thái', 
            dataIndex: 'status', 
            key: 'st',
            render: s => <Tag color={s === 'in_progress' ? 'processing' : s === 'completed' ? 'success' : 'default'}>{s.toUpperCase()}</Tag>
        }
    ];

    return (
        <div>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{marginBottom: 16}}>Quay lại</Button>
            
            <Card bordered={false} style={{marginBottom: 16, borderRadius: 8}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                        <Title level={3} style={{margin: 0}}><ShopOutlined /> {data.info.name}</Title>
                        <span style={{color: '#888'}}>Địa chỉ: {data.info.address}</span>
                    </div>
                    {canViewCost ? (
                        <Statistic 
                            title="Tổng Tài Sản Tại Xưởng" 
                            value={data.total_asset_value} 
                            prefix={<GoldOutlined />}
                            valueStyle={{color: '#3f8600', fontWeight: 'bold'}}
                            formatter={v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v)}
                        />
                    ) : (
                        <Statistic
                            title="Tổng Tài Sản Tại Xưởng"
                            value="***"
                            prefix={<GoldOutlined />}
                            valueStyle={{ color: '#999' }}
                        />
                    )}
                </div>
            </Card>

            <Row gutter={16}>
                <Col span={24}>
                    <Card bordered={false} style={{borderRadius: 8}}>
                        <Tabs defaultActiveKey="1" items={[
                            {
                                key: '1',
                                label: `📦 Kho hiện tại (${data.inventory.length} mã)`,
                                children: <Table dataSource={data.inventory} columns={stockColumns} rowKey="sku" />
                            },
                            {
                                key: '2',
                                label: `⚙️ Hoạt động Sản xuất (${data.production.length} lệnh)`,
                                children: <Table dataSource={data.production} columns={prodColumns} rowKey="code" />
                            }
                        ]} />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default WorkshopDetail;