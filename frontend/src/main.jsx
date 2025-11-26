import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ConfigProvider } from 'antd'; // Import ConfigProvider
import viVN from 'antd/locale/vi_VN';  // Import Tiếng Việt cho các component

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={viVN} // Chuyển toàn bộ lịch, bảng báo lỗi sang Tiếng Việt
      theme={{
        token: {
          // 1. Màu chủ đạo (Chọn màu Xanh đậm Fashion hoặc Tím than)
          colorPrimary: '#003eb3', // Xanh Navy chuyên nghiệp
          colorLink: '#1677ff',
          
          // 2. Bo tròn các góc (Trông mềm mại hơn)
          borderRadius: 8, 
          
          // 3. Font chữ
          fontFamily: "'Inter', sans-serif",
        },
        components: {
          Card: {
            headerFontSize: 16,
            headerFontWeight: 600,
            boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
          },
          Table: {
            headerBg: '#fafafa', // Màu nền header bảng sáng hơn
            headerColor: '#595959',
            headerFontWeight: 600,
          },
          Layout: {
             bodyBg: '#f5f5f5', // Màu nền body sáng
             siderBg: '#001529', // Màu sidebar tối
          }
        }
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)