import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';

const warmTheme = {
  token: {
    colorPrimary: '#6f5144',
    colorPrimaryHover: '#806054',
    colorPrimaryActive: '#594036',
    colorPrimaryBg: '#f2eae2',
    colorPrimaryBgHover: '#e9ddd2',
    colorLink: '#765548',
    colorLinkHover: '#98745f',
    colorText: '#2f241f',
    colorTextSecondary: '#75685f',
    colorTextTertiary: '#9a8c80',
    colorBorder: '#e5dbd0',
    colorBorderSecondary: '#eee6dd',
    colorBgBase: '#fffdfa',
    colorBgContainer: '#fffdfa',
    colorBgElevated: '#fffdfa',
    colorBgLayout: '#f6f2ec',
    colorFillAlter: '#f5efe8',
    colorFillSecondary: '#f1e9e1',
    controlItemBgHover: '#f3ece5',
    controlItemBgActive: '#e9ddd2',
    controlOutline: 'rgba(111, 81, 68, 0.16)',
    borderRadius: 12,
    borderRadiusLG: 18,
    borderRadiusSM: 9,
    controlHeight: 38,
    fontFamily: "'Inter', sans-serif",
    boxShadow: '0 10px 32px rgba(73, 53, 43, 0.08)',
    boxShadowSecondary: '0 14px 42px rgba(73, 53, 43, 0.12)',
  },
  components: {
    Layout: {
      bodyBg: '#f6f2ec',
      headerBg: '#fffdfa',
      siderBg: '#584037',
    },
    Menu: {
      darkItemBg: '#584037',
      darkSubMenuItemBg: '#4f3931',
      darkItemColor: '#eadfd6',
      darkItemHoverBg: '#6a5045',
      darkItemSelectedBg: '#82675a',
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 12,
      itemMarginInline: 12,
      itemMarginBlock: 5,
      itemHeight: 46,
    },
    Card: {
      headerFontSize: 16,
      headerFontWeight: 650,
      colorBorderSecondary: '#ebe2d9',
      boxShadowTertiary: '0 10px 30px rgba(73, 53, 43, 0.07)',
    },
    Table: {
      headerBg: '#f3ede6',
      headerColor: '#5e4a40',
      headerFontWeight: 650,
      rowHoverBg: '#faf6f1',
      borderColor: '#ebe2d9',
    },
    Button: {
      borderRadius: 11,
      primaryShadow: 'none',
      defaultBorderColor: '#dfd3c7',
      defaultColor: '#59463d',
      defaultHoverBorderColor: '#8b6a58',
      defaultHoverColor: '#6f5144',
    },
    Input: {
      activeBorderColor: '#806054',
      hoverBorderColor: '#a18473',
      activeShadow: '0 0 0 3px rgba(111, 81, 68, 0.10)',
    },
    InputNumber: {
      activeBorderColor: '#806054',
      hoverBorderColor: '#a18473',
      activeShadow: '0 0 0 3px rgba(111, 81, 68, 0.10)',
    },
    Select: {
      optionSelectedBg: '#eee3d9',
      optionActiveBg: '#f6f0e9',
    },
    DatePicker: {
      activeBorderColor: '#806054',
      hoverBorderColor: '#a18473',
      activeShadow: '0 0 0 3px rgba(111, 81, 68, 0.10)',
    },
    Tabs: {
      itemSelectedColor: '#6f5144',
      itemHoverColor: '#806054',
      inkBarColor: '#6f5144',
    },
    Modal: {
      contentBg: '#fffdfa',
      headerBg: '#fffdfa',
      titleColor: '#392b25',
    },
    Drawer: {
      colorBgElevated: '#fffdfa',
    },
    Pagination: {
      itemActiveBg: '#eee3d9',
    },
    Segmented: {
      itemSelectedBg: '#fffdfa',
      trackBg: '#eee6dd',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={warmTheme}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
