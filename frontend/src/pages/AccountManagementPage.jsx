import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Checkbox,
  Space,
  Tag,
  Divider,
  Descriptions,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import accountApi from '../api/accountApi';
import warehouseApi from '../api/warehouseApi';

const MODULE_OPTIONS = [
  { key: 'inventory', label: 'Kho vật tư' },
  { key: 'warehouses', label: 'Kho & xưởng' },
  { key: 'purchases', label: 'Nhập hàng' },
  { key: 'production', label: 'Sản xuất' },
  { key: 'reports', label: 'Báo cáo' },
  { key: 'drafts', label: 'Đơn hàng dự kiến' },
  { key: 'sales-management', label: 'Quản lý số bán' },
  { key: 'material-cost', label: 'Xem giá vốn nguyên phụ liệu' },
];

const EMPTY_MODULE_MAP = MODULE_OPTIONS.reduce((acc, m) => {
  acc[m.key] = { can_view: false, can_manage: false };
  return acc;
}, {});

const AccountManagementPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [modulePermissionMap, setModulePermissionMap] = useState(EMPTY_MODULE_MAP);
  const [form] = Form.useForm();
  const selectedCentralIds = Form.useWatch('central_ids', form) || [];
  const selectedRole = Form.useWatch('role', form) || 'staff';
  const selectedMaterialCostView = !!modulePermissionMap['material-cost']?.can_view;
  const selectedMaterialCostBrandIds = Form.useWatch('material_cost_brand_ids', form) || [];

  const moduleLabelMap = MODULE_OPTIONS.reduce((acc, m) => {
    acc[m.key] = m.label;
    return acc;
  }, {});

  const centralWarehouses = warehouses.filter((w) => w.type_name === 'Kho Tổng');

  const getManagedCentralIdsOfWorkshop = (workshop) => {
    if (Array.isArray(workshop?.managed_by_central_ids) && workshop.managed_by_central_ids.length > 0) {
      return workshop.managed_by_central_ids;
    }
    // Fallback dữ liệu cũ: xưởng cùng brand với kho tổng
    return centralWarehouses
      .filter((c) => c.brand_id === workshop.brand_id)
      .map((c) => c.id);
  };

  const getWorkshopOptionsByCentralIds = (centralIds = []) => {
    if (!centralIds.length) return [];
    return warehouses
      .filter((w) => w.type_name !== 'Kho Tổng')
      .filter((w) => getManagedCentralIdsOfWorkshop(w).some((cid) => centralIds.includes(cid)))
      .map((w) => ({
        label: `${w.name} (${w.brand_name || 'Không rõ brand'})`,
        value: w.id,
      }));
  };

  const workshopOptions = getWorkshopOptionsByCentralIds(selectedCentralIds);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accRes, whRes, brandRes] = await Promise.all([
        accountApi.getAll(),
        warehouseApi.getAllWarehouses(),
        warehouseApi.getAllBrands(),
      ]);
      setAccounts(Array.isArray(accRes.data) ? accRes.data : []);
      setWarehouses(Array.isArray(whRes.data) ? whRes.data : []);
      setBrands(Array.isArray(brandRes.data) ? brandRes.data : []);
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi tải dữ liệu tài khoản');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setModulePermissionMap(EMPTY_MODULE_MAP);
    form.resetFields();
    form.setFieldsValue({ role: 'staff', central_ids: [], workshop_ids: [], material_cost_brand_ids: [] });
    setOpenModal(true);
  };

  const setMaterialCostModuleByBrandSelection = (brandIds = []) => {
    const hasAnyBrand = Array.isArray(brandIds) && brandIds.length > 0;
    setModulePermissionMap((prev) => ({
      ...prev,
      'material-cost': {
        can_view: hasAnyBrand,
        can_manage: false,
      },
    }));
  };

  const buildMapFromModulePermissions = (modulePermissions = []) => {
    const map = { ...EMPTY_MODULE_MAP };
    modulePermissions.forEach((m) => {
      if (map[m.module_key]) {
        map[m.module_key] = {
          can_view: !!m.can_view,
          can_manage: !!m.can_manage,
        };
      }
    });
    return map;
  };

  const openEdit = (row) => {
    setEditing(row);
    setModulePermissionMap(buildMapFromModulePermissions(row.module_permissions || []));
    const assignedIds = Array.isArray(row.warehouse_ids) ? row.warehouse_ids : [];
    const assignedSet = new Set(assignedIds);
    const centralIds = centralWarehouses
      .filter((w) => assignedSet.has(w.id))
      .map((w) => w.id);
    const workshopIds = warehouses
      .filter((w) => w.type_name !== 'Kho Tổng' && assignedSet.has(w.id))
      .map((w) => w.id);
    form.setFieldsValue({
      full_name: row.full_name,
      role: row.role,
      central_ids: centralIds,
      workshop_ids: workshopIds,
      material_cost_brand_ids: Array.isArray(row.material_cost_brand_ids) ? row.material_cost_brand_ids : [],
      password: '',
    });
    setOpenModal(true);
  };

  const onSubmit = async (values) => {
    const mergedWarehouseIds = Array.from(new Set([
      ...(values.central_ids || []),
      ...(values.workshop_ids || []),
    ]));
    const payload = {
      full_name: values.full_name,
      role: values.role,
      warehouse_ids: mergedWarehouseIds,
      material_cost_brand_ids: modulePermissionMap['material-cost']?.can_view
        ? (values.material_cost_brand_ids || [])
        : [],
      module_permissions: MODULE_OPTIONS.map((m) => ({
        module_key: m.key,
        can_view: !!modulePermissionMap[m.key]?.can_view,
        can_manage: !!modulePermissionMap[m.key]?.can_manage,
      })).filter((m) => m.can_view || m.can_manage),
    };

    if (!editing) {
      payload.username = values.username;
      payload.password = values.password;
    } else if (values.password) {
      payload.password = values.password;
    }

    try {
      if (editing) {
        await accountApi.update(editing.id, payload);
        message.success('Đã cập nhật tài khoản');
      } else {
        await accountApi.create(payload);
        message.success('Đã tạo tài khoản');
      }
      setOpenModal(false);
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi lưu tài khoản');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Xóa tài khoản ${row.username}?`)) return;
    try {
      await accountApi.remove(row.id);
      message.success('Đã xóa tài khoản');
      fetchData();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi xóa tài khoản');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: 'Tên đăng nhập', dataIndex: 'username', render: (v) => <b>{v}</b> },
    { title: 'Họ tên', dataIndex: 'full_name' },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      render: (v) => (
        <Tag color={v === 'admin' ? 'red' : 'blue'}>
          {String(v || '').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Kho/Xưởng được cấp',
      dataIndex: 'warehouse_ids',
      render: (ids) => {
        if (!ids?.length) return '-';
        const idSet = new Set(ids);
        const names = warehouses.filter((w) => idSet.has(w.id)).map((w) => w.name);
        return names.length ? names.join(', ') : ids.join(', ');
      },
    },
    {
      title: 'Hành động',
      align: 'center',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setDetailRecord(row); setDetailOpen(true); }}>
            Hiển thị
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(row)}
          />
        </Space>
      ),
    },
  ];

  const visibleAccounts = accounts.filter((a) => a.role !== 'admin');

  const renderPermissionTags = (mods = []) => {
    const map = {};
    mods.forEach((m) => {
      map[m.module_key] = m;
    });
    return MODULE_OPTIONS.map((m) => {
      const item = map[m.key] || {};
      if (!item.can_view && !item.can_manage) return null;
      return (
        <Tag key={m.key} color={item.can_manage ? 'red' : 'blue'}>
          {moduleLabelMap[m.key]} ({item.can_manage ? 'quản lý' : 'xem'})
        </Tag>
      );
    }).filter(Boolean);
  };

  return (
    <Card
      title="Quản Lý Tài Khoản"
      bordered={false}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Tạo tài khoản
        </Button>
      }
    >
      <Table rowKey="id" loading={loading} dataSource={visibleAccounts} columns={columns} />

      <Modal
        title={editing ? `Cập nhật: ${editing.username}` : 'Tạo tài khoản mới'}
        open={openModal}
        onCancel={() => setOpenModal(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Lưu' : 'Tạo'}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          {!editing && (
            <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item name="full_name" label="Họ tên" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing ? 'Mật khẩu mới (bỏ trống nếu không đổi)' : 'Mật khẩu'}
            rules={editing ? [] : [{ required: true }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Quản trị viên', value: 'admin' },
                { label: 'Nhân viên', value: 'staff' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="central_ids"
            label="Kho tổng được cấp"
            rules={selectedRole === 'admin' ? [] : [{ required: true, message: 'Vui lòng chọn ít nhất 1 kho tổng' }]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Chọn kho tổng"
              options={centralWarehouses.map((w) => ({
                label: `${w.name} (${w.brand_name || 'Không rõ brand'})`,
                value: w.id,
              }))}
              onChange={(nextCentralIds) => {
                const currentWorkshopIds = form.getFieldValue('workshop_ids') || [];
                const validWorkshopIdSet = new Set(
                  getWorkshopOptionsByCentralIds(nextCentralIds).map((o) => o.value)
                );
                const prunedWorkshopIds = currentWorkshopIds.filter((id) => validWorkshopIdSet.has(id));
                form.setFieldsValue({
                  central_ids: nextCentralIds,
                  workshop_ids: prunedWorkshopIds,
                });
              }}
              disabled={selectedRole === 'admin'}
            />
          </Form.Item>
          <Form.Item
            name="workshop_ids"
            label="Kho con / Xưởng được cấp"
            rules={selectedRole === 'admin' ? [] : [{ required: true, message: 'Vui lòng chọn ít nhất 1 kho con/xưởng' }]}
            extra="Danh sách kho con được lọc theo kho tổng đã chọn ở trên (không hiển thị trùng)."
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Chọn kho con/xưởng"
              options={workshopOptions}
              disabled={selectedRole === 'admin' || !selectedCentralIds.length}
            />
          </Form.Item>
          <Divider style={{ margin: '8px 0 14px' }} />
          <Form.Item label="Phân quyền module (xem/quản lý)">
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              {MODULE_OPTIONS.map((m) => {
                const perm = modulePermissionMap[m.key] || { can_view: false, can_manage: false };
                return (
                  <div
                    key={m.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 110px',
                      alignItems: 'center',
                      gap: 12,
                      padding: '6px 0',
                    }}
                  >
                    <b>{m.label}</b>
                    <Checkbox
                      checked={perm.can_view}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setModulePermissionMap((prev) => ({
                          ...prev,
                          [m.key]: {
                            ...prev[m.key],
                            can_view: checked,
                            can_manage: checked ? prev[m.key]?.can_manage : false,
                          },
                        }));
                        if (m.key === 'material-cost' && !checked) {
                          form.setFieldsValue({ material_cost_brand_ids: [] });
                        }
                      }}
                    >
                      Xem
                    </Checkbox>
                    <Checkbox
                      checked={perm.can_manage}
                      disabled={!perm.can_view || m.key === 'material-cost'}
                      onChange={(e) =>
                        setModulePermissionMap((prev) => ({
                          ...prev,
                          [m.key]: {
                            ...prev[m.key],
                            can_view: true,
                            can_manage: e.target.checked,
                          },
                        }))
                      }
                    >
                      Quản lý
                    </Checkbox>
                  </div>
                );
              })}
            </div>
          </Form.Item>
          <Form.Item
            label="Bật/Tắt quyền xem giá vốn theo nhãn hàng"
            extra="Tài khoản có thể dùng nhiều brand nhưng chỉ xem giá vốn ở các brand được tick."
          >
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <Button
                  size="small"
                  onClick={() => {
                    const allIds = brands.map((b) => Number(b.id));
                    form.setFieldsValue({ material_cost_brand_ids: allIds });
                    setMaterialCostModuleByBrandSelection(allIds);
                  }}
                >
                  Chọn tất cả brand
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    form.setFieldsValue({ material_cost_brand_ids: [] });
                    setMaterialCostModuleByBrandSelection([]);
                  }}
                >
                  Bỏ hết quyền xem giá
                </Button>
              </div>
              <Form.Item name="material_cost_brand_ids" noStyle>
                <Checkbox.Group
                  style={{ width: '100%' }}
                  value={selectedMaterialCostBrandIds}
                  onChange={(checkedIds) => {
                    form.setFieldsValue({ material_cost_brand_ids: checkedIds });
                    setMaterialCostModuleByBrandSelection(checkedIds);
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    {brands.map((b) => (
                      <Checkbox key={b.id} value={Number(b.id)}>
                        {b.name}
                      </Checkbox>
                    ))}
                  </div>
                </Checkbox.Group>
              </Form.Item>
              {!selectedMaterialCostView ? (
                <div style={{ marginTop: 8, color: '#faad14', fontSize: 12 }}>
                  Chưa có brand nào được cấp nên quyền "Xem giá vốn nguyên phụ liệu" đang tắt.
                </div>
              ) : null}
            </div>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detailRecord ? `Chi tiết quyền: ${detailRecord.username}` : 'Chi tiết quyền'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={760}
      >
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{detailRecord.id}</Descriptions.Item>
            <Descriptions.Item label="Tên đăng nhập">{detailRecord.username}</Descriptions.Item>
            <Descriptions.Item label="Họ tên">{detailRecord.full_name}</Descriptions.Item>
            <Descriptions.Item label="Vai trò">
              <Tag color={detailRecord.role === 'admin' ? 'red' : 'blue'}>
                {String(detailRecord.role || '').toUpperCase()}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Kho/Xưởng được cấp">
              {(() => {
                const ids = Array.isArray(detailRecord.warehouse_ids) ? detailRecord.warehouse_ids : [];
                if (!ids.length) return 'Không giới hạn';
                const idSet = new Set(ids);
                const names = warehouses.filter((w) => idSet.has(w.id)).map((w) => w.name);
                return names.length ? names.join(', ') : ids.join(', ');
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="Quyền hiệu lực module">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {renderPermissionTags(detailRecord.module_permissions || [])}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="Brand được xem giá vốn">
              {(() => {
                const ids = Array.isArray(detailRecord.material_cost_brand_ids) ? detailRecord.material_cost_brand_ids : [];
                if (!ids.length) return 'Không cấu hình';
                const idSet = new Set(ids.map((x) => Number(x)));
                const names = brands.filter((b) => idSet.has(Number(b.id))).map((b) => b.name);
                return names.length ? names.join(', ') : ids.join(', ');
              })()}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

export default AccountManagementPage;
