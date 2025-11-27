import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Layout, Menu, theme, Avatar, Space, Typography, Spin } from 'antd';
import { 
  DatabaseOutlined, 
  SkinOutlined, 
  ShoppingCartOutlined, 
  ShopOutlined,
  UserOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  PieChartOutlined,
  BarChartOutlined
} from '@ant-design/icons';

// Import API
import warehouseApi from './api/warehouseApi';

// Import Đầy Đủ Các Trang
import InventoryPage from './pages/InventoryPage';
import PurchasePage from './pages/PurchasePage';
import ProductionPage from './pages/ProductionPage';
import WarehousePage from './pages/WarehousePage';
import CentralDashboard from './pages/CentralDashboard';
import WorkshopDetail from './pages/WorkshopDetail';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [centralWarehouses, setCentralWarehouses] = useState([]); // Danh sách Kho Tổng
  const [loadingMenu, setLoadingMenu] = useState(true);

  const {
    token: { colorBgContainer },
  } = theme.useToken();

  // --- 1. GỌI API ĐỂ LẤY DANH SÁCH KHO TỔNG ---
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await warehouseApi.getAllWarehouses();
        // Lọc ra những kho là "Kho Tổng" để hiển thị trên menu Dashboard
        const centrals = response.data.filter(w => w.type_name === 'Kho Tổng');
        setCentralWarehouses(centrals);
      } catch (error) {
        console.error("Lỗi tải menu kho:", error);
      }
      setLoadingMenu(false);
    };
    fetchWarehouses();
  }, []);

  // --- 2. TẠO CẤU TRÚC MENU ĐỘNG ---
  const menuItems = [
    // MỤC 1: DASHBOARD (Dạng danh sách thả xuống)
    {
      key: 'dashboard',
      icon: <PieChartOutlined />,
      label: 'Báo cáo Tổng quan',
      children: centralWarehouses.map(w => ({
        key: `/dashboard/${w.id}`,
        label: <Link to={`/dashboard/${w.id}`}>{w.name}</Link>,
        icon: <BarChartOutlined />
      }))
    },

    // CÁC MỤC CHỨC NĂNG KHÁC
    { key: '/', icon: <DatabaseOutlined />, label: <Link to="/">Kho Vật Tư</Link> },
    { key: '/warehouses', icon: <ShopOutlined />, label: <Link to="/warehouses">Kho & Xưởng</Link> },
    { key: '/purchases', icon: <ShoppingCartOutlined />, label: <Link to="/purchases">Nhập Hàng</Link> },
    { key: '/production', icon: <SkinOutlined />, label: <Link to="/production">Sản Xuất</Link> },
  ];

  return (
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        
        {/* SIDEBAR BÊN TRÁI */}
        <Sider 
          trigger={null} 
          collapsible 
          collapsed={collapsed}
          width={260}
          style={{ 
            overflow: 'auto', 
            height: '100vh', 
            position: 'fixed', 
            left: 0, top: 0, bottom: 0,
            zIndex: 100,
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)'
          }}
        >
          {/* Logo */}
          <div style={{ height: 64, margin: 16, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {collapsed ? <SkinOutlined style={{color: 'white', fontSize: 24}}/> : <Title level={4} style={{ color: 'white', margin: 0, letterSpacing: 1 }}>FASHION WMS</Title>}
          </div>

          {/* Menu */}
          {loadingMenu ? (
             <div style={{textAlign: 'center', marginTop: 20}}><Spin /></div> 
          ) : (
            <Menu
              theme="dark"
              mode="inline"
              defaultOpenKeys={['dashboard']} // Mặc định mở bung mục Dashboard
              items={menuItems}
              style={{ fontSize: 15, fontWeight: 500 }}
            />
          )}
        </Sider>

        {/* GIAO DIỆN BÊN PHẢI */}
        <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'all 0.2s' }}>
          
          {/* Header */}
          <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 99, boxShadow: '0 1px 4px rgba(0,21,41,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
                  className: 'trigger',
                  onClick: () => setCollapsed(!collapsed),
                  style: { fontSize: 18, cursor: 'pointer', marginRight: 24 }
                })}
                <Title level={5} style={{ margin: 0 }}>Hệ thống Quản lý Chuỗi Cung Ứng</Title>
            </div>
            
            <Space>
               <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
               <Text strong>Admin</Text>
            </Space>
          </Header>

          {/* Content */}
          <Content style={{ margin: '24px 16px', overflow: 'initial' }}>
            <div style={{ padding: 24, minHeight: '80vh' }}>
              <Routes>
                {/* 1. Dashboard Kho Tổng */}
                <Route path="/dashboard/:id" element={<CentralDashboard />} />
                
                {/* 2. Chi tiết Xưởng (QUAN TRỌNG: Đường dẫn này khớp với link trong Dashboard) */}
                <Route path="/workshop/:id" element={<WorkshopDetail />} />

                {/* 3. Các trang chức năng chính */}
                <Route path="/" element={<InventoryPage />} />
                <Route path="/warehouses" element={<WarehousePage />} />
                <Route path="/purchases" element={<PurchasePage />} />
                <Route path="/production" element={<ProductionPage />} />
              </Routes>
            </div>
          </Content>

        </Layout>
      </Layout>
    </Router>
  );
};

export default App;