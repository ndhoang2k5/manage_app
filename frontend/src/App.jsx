import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, Avatar, Space, Typography } from 'antd';
import { 
  DatabaseOutlined, 
  SkinOutlined, 
  ShoppingCartOutlined, 
  ShopOutlined,
  UserOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined
} from '@ant-design/icons';

// Import các trang
import InventoryPage from './pages/InventoryPage';
import PurchasePage from './pages/PurchasePage';
import ProductionPage from './pages/ProductionPage';
import WarehousePage from './pages/WarehousePage';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // Mapping tiêu đề trang dựa trên URL
  const location = window.location.pathname; // Lưu ý: dùng useLocation() trong Router mới chuẩn, đây là bản simple
  
  return (
    <Router>
      {/* Layout bao trùm toàn màn hình */}
      <Layout style={{ minHeight: '100vh' }}>
        
        {/* SIDEBAR BÊN TRÁI */}
        <Sider 
          trigger={null} 
          collapsible 
          collapsed={collapsed}
          width={250}
          style={{ 
            overflow: 'auto', 
            height: '100vh', 
            position: 'fixed', 
            left: 0, 
            top: 0, 
            bottom: 0,
            zIndex: 100,
            boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)'
          }}
        >
          {/* Logo */}
          <div style={{ height: 64, margin: 16, background: 'rgba(255, 255, 255, 0.1)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {collapsed ? <SkinOutlined style={{color: 'white', fontSize: 24}}/> : <Title level={4} style={{ color: 'white', margin: 0, letterSpacing: 1 }}>FASHION WMS</Title>}
          </div>

          <Menu
            theme="dark"
            mode="inline"
            defaultSelectedKeys={['1']}
            items={[
              { key: '1', icon: <DatabaseOutlined />, label: <Link to="/">Kho Vật Tư</Link> },
              { key: '2', icon: <ShopOutlined />, label: <Link to="/warehouses">Kho & Xưởng</Link> },
              { key: '3', icon: <ShoppingCartOutlined />, label: <Link to="/purchases">Nhập Hàng</Link> },
              { key: '4', icon: <SkinOutlined />, label: <Link to="/production">Sản Xuất</Link> },
            ]}
            style={{ fontSize: 15, fontWeight: 500 }}
          />
        </Sider>

        {/* PHẦN GIAO DIỆN BÊN PHẢI (Sẽ tự co giãn) */}
        <Layout style={{ marginLeft: collapsed ? 80 : 250, transition: 'all 0.2s' }}>
          
          {/* HEADER */}
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

          {/* NỘI DUNG CHÍNH (CONTENT) */}
          <Content style={{ margin: '24px 16px', overflow: 'initial' }}>
            <div style={{ 
              padding: 24, 
              minHeight: '80vh', 
              // Không set width cố định để nó tự bung ra 100%
            }}>
              <Routes>
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