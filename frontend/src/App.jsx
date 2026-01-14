import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Layout, Menu, theme, Avatar, Space, Typography, Spin, Button, Tag } from 'antd';
import { 
  DatabaseOutlined, SkinOutlined, ShoppingCartOutlined, ShopOutlined,
  UserOutlined, MenuUnfoldOutlined, MenuFoldOutlined,
  PieChartOutlined, BarChartOutlined, LogoutOutlined, BulbOutlined
} from '@ant-design/icons';



// Import Pages
import InventoryPage from './pages/InventoryPage';
import PurchasePage from './pages/PurchasePage';
import ProductionPage from './pages/ProductionPage';
import WarehousePage from './pages/WarehousePage';
import CentralDashboard from './pages/CentralDashboard';
import WorkshopDetail from './pages/WorkshopDetail';
import LoginPage from './pages/LoginPage';
import warehouseApi from './api/warehouseApi';
import DraftPage from './pages/DraftPage';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const App = () => {
  // --- KIỂM TRA ĐĂNG NHẬP ---
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Nếu không có token -> Trả về trang Login ngay lập tức
  if (!token) {
      return <LoginPage />;
  }
  // ---------------------------

  const [collapsed, setCollapsed] = useState(false);
  const [centralWarehouses, setCentralWarehouses] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);

  const { token: { colorBgContainer } } = theme.useToken();

  // Hàm Đăng xuất
  const handleLogout = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/'; // Reload lại sẽ tự nhảy về Login
  };

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await warehouseApi.getAllWarehouses();
        const centrals = response.data.filter(w => w.type_name === 'Kho Tổng');
        setCentralWarehouses(centrals);
      } catch (error) {
        console.error("Lỗi tải menu kho:", error);
      }
      setLoadingMenu(false);
    };
    fetchWarehouses();
  }, []);

  const menuItems = [
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
    { key: '/', icon: <DatabaseOutlined />, label: <Link to="/">Kho Vật Tư</Link> },
    { key: '/warehouses', icon: <ShopOutlined />, label: <Link to="/warehouses">Kho & Xưởng</Link> },
    { key: '/purchases', icon: <ShoppingCartOutlined />, label: <Link to="/purchases">Nhập Hàng</Link> },
    { key: '/production', icon: <SkinOutlined />, label: <Link to="/production">Sản Xuất</Link> },
    { key: '/drafts', icon: <BulbOutlined />, label: <Link to="/drafts">Đơn Hàng Dự Kiến</Link> },
  ];

  return (
    <Router>
      <Layout style={{ minHeight: '100vh' }}>
        <Sider trigger={null} collapsible collapsed={collapsed} width={260} style={{ overflow: 'auto', height: '100vh', position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100, boxShadow: '2px 0 8px rgba(0,0,0,0.15)' }}>
          <div style={{ height: 64, margin: 16, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {collapsed ? <SkinOutlined style={{color: 'white', fontSize: 24}}/> : <Title level={4} style={{ color: 'white', margin: 0, letterSpacing: 1 }}>FASHION WMS</Title>}
          </div>

          {loadingMenu ? <div style={{textAlign: 'center', marginTop: 20}}><Spin /></div> : 
            <Menu theme="dark" mode="inline" defaultOpenKeys={['dashboard']} items={menuItems} style={{ fontSize: 15, fontWeight: 500 }} />
          }
        </Sider>

        <Layout style={{ marginLeft: collapsed ? 80 : 260, transition: 'all 0.2s' }}>
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
               <div style={{textAlign: 'right', marginRight: 10, lineHeight: '1.2'}}>
                   <Text strong style={{display: 'block'}}>{user.name || 'User'}</Text>
                   <Tag color={user.role === 'admin' ? 'red' : 'blue'} style={{margin: 0, fontSize: 10}}>{(user.role || 'staff').toUpperCase()}</Tag>
               </div>
               <Avatar style={{ backgroundColor: user.role === 'admin' ? '#f56a00' : '#1677ff' }} icon={<UserOutlined />} />
               <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} danger title="Đăng xuất" />
            </Space>
          </Header>

          <Content style={{ margin: '24px 16px', overflow: 'initial' }}>
            <div style={{ padding: 24, minHeight: '80vh' }}>
              <Routes>
                <Route path="/dashboard/:id" element={<CentralDashboard />} />
                <Route path="/workshop/:id" element={<WorkshopDetail />} />
                <Route path="/" element={<InventoryPage />} />
                <Route path="/warehouses" element={<WarehousePage />} />
                <Route path="/purchases" element={<PurchasePage />} />
                <Route path="/production" element={<ProductionPage />} />
                <Route path="/drafts" element={<DraftPage />} />
              </Routes>
            </div>
          </Content>
        </Layout>
      </Layout>
    </Router>
  );
};

export default App;