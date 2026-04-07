import React from 'react';
import { Tag } from 'antd';

const AccessModeBadge = ({ canManage, label = 'Trang này' }) => {
  if (canManage) return null;
  return (
    <Tag color="gold" style={{ marginInlineStart: 8 }}>
      Chỉ xem - {label}
    </Tag>
  );
};

export default AccessModeBadge;
