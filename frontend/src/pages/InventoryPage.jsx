import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Modal, Form, Input, InputNumber, message, Tabs, Space, Select, Divider, Tooltip } from 'antd';
import { PlusOutlined, AppstoreOutlined, GroupOutlined, DeleteOutlined, SearchOutlined, EditOutlined, BgColorsOutlined } from '@ant-design/icons';
import productApi from '../api/productApi';

const InventoryPage = () => {
    // Data States
    const [materials, setMaterials] = useState([]);
    const [groups, setGroups] = useState([]);
    
    // UI States
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [searchText, setSearchText] = useState('');
    
    // Edit State
    const [editingItem, setEditingItem] = useState(null); 

    const [form] = Form.useForm();
    const [groupForm] = Form.useForm();

    const fetchData = async () => {
        setLoading(true);
        try {
            const [matRes, groupRes] = await Promise.all([
                productApi.getAll(),
                productApi.getAllGroups()
            ]);
            setMaterials(matRes.data);
            setGroups(groupRes.data);
        } catch (error) {
            message.error("Lỗi tải dữ liệu!");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredMaterials = materials.filter(item => {
        const text = searchText.toLowerCase();
        return (
            (item.variant_name && item.variant_name.toLowerCase().includes(text)) ||
            (item.sku && item.sku.toLowerCase().includes(text)) ||
            (item.note && item.note.toLowerCase().includes(text))
        );
    });

    // --- MỞ MODAL TẠO MỚI (Reset form) ---
    const openCreateModal = () => {
        setEditingItem(null);
        form.resetFields();
        // Set giá trị mặc định cho form list (ít nhất 1 dòng màu)
        form.setFieldsValue({
            variants: [{ color_name: '', sku: '', cost_price: 0 }]
        });
        setIsModalOpen(true);
    };

    // --- MỞ MODAL SỬA ---
    const openEditModal = (record) => {
        setEditingItem(record); 
        form.setFieldsValue({
            sku: record.sku,
            // Nếu tên có định dạng "Tên Chung - Màu", ta tách ra để hiển thị cho đẹp (nếu muốn)
            // Nhưng đơn giản nhất là cứ hiển thị full name để sửa
            name: record.variant_name, 
            unit: record.category_name, 
            cost_price: record.cost_price,
            note: record.note
        });
        setIsModalOpen(true);
    };

    // --- XỬ LÝ LƯU (TẠO HOẶC SỬA) ---
    const handleSaveMaterial = async (values) => {
        try {
            if (editingItem) {
                // Logic Sửa (Giữ nguyên API cũ, chỉ sửa 1 dòng)
                await productApi.update(editingItem.id, values);
                message.success("Cập nhật thành công!");
            } else {
                // LOGIC TẠO MỚI (Gửi danh sách màu)
                await productApi.create(values);
                message.success("Tạo vật tư thành công!");
            }
            setIsModalOpen(false);
            form.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Thất bại"));
        }
    };
    
    const handleCreateGroup = async (values) => {
        try {
            // Tự động gán quantity = 1 (Đánh dấu có mặt trong nhóm)
            const payload = { 
                ...values, 
                items: values.items.map(item => ({ material_variant_id: item.material_variant_id, quantity: 1 })) 
            };
            await productApi.createGroup(payload);
            message.success("Tạo nhóm thành công!");
            setIsGroupModalOpen(false);
            groupForm.resetFields();
            fetchData();
        } catch (error) { message.error("Lỗi tạo nhóm"); }
    };

    // --- CẤU HÌNH CỘT BẢNG VẬT TƯ ---
    const materialColumns = [
        { title: 'ID', dataIndex: 'id', width: 60, align: 'center', render: t => <span style={{color:'#888'}}>#{t}</span> },
        { title: 'Mã SKU', dataIndex: 'sku', render: t => <Tag color="geekblue">{t}</Tag> },
        
        // Hiển thị Tên + Màu (Nếu có)
        { title: 'Tên Vật Tư', dataIndex: 'variant_name', render: (t, r) => 
            <span>
                <b>{t}</b> 
                {r.color && <Tag color="magenta" style={{marginLeft: 8}}>{r.color}</Tag>}
            </span> 
        },
        
        { title: 'Ghi chú', dataIndex: 'note', render: (t) => t ? <span style={{color: '#666', fontStyle: 'italic'}}>{t}</span> : '-' },
        { title: 'Giá Vốn', dataIndex: 'cost_price', align: 'right', render: v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0) },
        { title: 'Tồn kho', dataIndex: 'quantity_on_hand', align: 'center', render: q => <Tag color={q > 0 ? 'success' : 'error'}>{q > 0 ? q : 'Hết'}</Tag> },
        { title: '', key: 'action', width: 50, render: (_, record) => <Button type="text" icon={<EditOutlined />} onClick={() => openEditModal(record)} style={{color: '#1677ff'}} /> }
    ];

    const groupColumns = [
        { title: 'Mã Nhóm', dataIndex: 'code', width: 150, render: t => <Tag color="purple" style={{fontSize: 14}}>{t}</Tag> },
        { title: 'Tên Nhóm', dataIndex: 'name', width: 250, render: t => <b>{t}</b> },
        { title: 'Thành phần', dataIndex: 'items_summary', render: t => <span style={{color: '#666'}}>{t}</span> }, 
        { title: 'Ghi chú', dataIndex: 'description' },
    ];

    return (
        <div>
            <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <Tabs defaultActiveKey="1" items={[
                    {
                        key: '1', label: <span><AppstoreOutlined /> Kho Vật Tư Lẻ</span>,
                        children: (
                            <>
                                <div style={{marginBottom: 16, display: 'flex', justifyContent: 'space-between'}}>
                                    <Input placeholder="Tìm theo Tên, SKU hoặc Ghi chú..." prefix={<SearchOutlined />} style={{ width: 400 }} value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
                                    <Button type="primary" onClick={openCreateModal} icon={<PlusOutlined />}>Nhập Vật Tư Mới</Button>
                                </div>
                                <Table dataSource={filteredMaterials} columns={materialColumns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
                            </>
                        )
                    },
                    {
                        key: '2', label: <span><GroupOutlined /> Danh sách Bộ/Nhóm</span>,
                        children: (
                            <>
                                <div style={{marginBottom: 16, textAlign: 'right'}}><Button type="dashed" onClick={() => setIsGroupModalOpen(true)} icon={<PlusOutlined />}>Tạo Nhóm Mới</Button></div>
                                <Table dataSource={groups} columns={groupColumns} rowKey="id" loading={loading} />
                            </>
                        )
                    }
                ]} />
            </Card>

            {/* --- MODAL TẠO VẬT TƯ (NÂNG CẤP DYNAMIC FORM) --- */}
            <Modal title={editingItem ? "Sửa Vật Tư" : "Thêm Vật Tư Mới (Đa màu sắc)"} open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null} width={900}>
                <Form layout="vertical" onFinish={handleSaveMaterial} form={form}>
                    
                    {/* Phần thông tin chung */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                        <Form.Item label="Tên Vật tư chung" name="name" rules={[{ required: true, message: 'Nhập tên chung' }]}>
                            <Input placeholder="VD: Vải Linen Cao Cấp" disabled={!!editingItem} />
                        </Form.Item>
                        <Form.Item label="Đơn vị tính" name="unit" initialValue="Cái">
                            <Input />
                        </Form.Item>
                    </div>

                    {/* Nếu đang sửa (Editing) -> Chỉ hiện form đơn giản cũ */}
                    {editingItem ? (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <Form.Item label="Mã SKU" name="sku"><Input /></Form.Item>
                                
                                <Tooltip title="Giá vốn được tính tự động từ phiếu nhập">
                                    <Form.Item label="Giá Vốn" name="cost_price">
                                        <InputNumber disabled style={{width: '100%'}} />
                                    </Form.Item>
                                </Tooltip>
                            </div>
                            <Form.Item label="Ghi chú" name="note"><Input.TextArea /></Form.Item>
                            <div style={{fontSize: 12, color: '#faad14'}}>* Lưu ý: Giá vốn không sửa trực tiếp được.</div>
                        </>
                    ) : (
                        /* Nếu đang tạo mới -> Hiện Form List để thêm nhiều màu */
                        <div style={{background: '#f9f9f9', padding: 16, borderRadius: 8, marginTop: 10, border: '1px solid #f0f0f0'}}>
                            <div style={{marginBottom: 8, fontWeight: 500}}>Danh sách các Biến thể (Màu sắc / Loại):</div>
                            <Form.List name="variants">
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                <Form.Item {...restField} name={[name, 'color_name']} rules={[{ required: true, message: 'Nhập màu' }]}>
                                                    <Input placeholder="Màu (VD: Trắng)" prefix={<BgColorsOutlined />} style={{width: 150}} />
                                                </Form.Item>
                                                <Form.Item {...restField} name={[name, 'sku']} rules={[{ required: true, message: 'Nhập SKU' }]}>
                                                    <Input placeholder="Mã SKU (VD: LINEN-01)" style={{width: 180}} />
                                                </Form.Item>
                                                <Form.Item {...restField} name={[name, 'cost_price']} initialValue={0}>
                                                    <InputNumber placeholder="Giá vốn" style={{width: 120}} />
                                                </Form.Item>
                                                <Form.Item {...restField} name={[name, 'note']}>
                                                    <Input placeholder="Ghi chú" />
                                                </Form.Item>
                                                <DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} />
                                            </Space>
                                        ))}
                                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm biến thể màu</Button>
                                    </>
                                )}
                            </Form.List>
                        </div>
                    )}

                    <Button type="primary" htmlType="submit" block size="large" style={{marginTop: 20}}>
                        {editingItem ? "Cập nhật" : "Lưu Tất Cả"}
                    </Button>
                </Form>
            </Modal>
            
            {/* Modal Group (Giữ nguyên) */}
            <Modal title="Tạo Nhóm Vật Tư" open={isGroupModalOpen} onCancel={() => setIsGroupModalOpen(false)} footer={null} width={700}>
                <Form layout="vertical" onFinish={handleCreateGroup} form={groupForm}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Mã Nhóm" name="code" rules={[{ required: true }]}><Input /></Form.Item>
                        <Form.Item label="Tên Nhóm" name="name" rules={[{ required: true }]}><Input /></Form.Item>
                    </div>
                    <Form.Item label="Mô tả" name="description"><Input.TextArea rows={1} /></Form.Item>
                    <Divider orientation="left">Chi tiết trong nhóm</Divider>
                    <Form.List name="items">{(fields, { add, remove }) => (<>{fields.map(({ key, name, ...restField }) => (<Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline"><Form.Item {...restField} name={[name, 'material_variant_id']} rules={[{ required: true }]} style={{ width: 450 }}><Select placeholder="Chọn vật tư...">{materials.map(m => <Select.Option key={m.id} value={m.id}>{m.sku} - {m.variant_name}</Select.Option>)}</Select></Form.Item><DeleteOutlined onClick={() => remove(name)} style={{ color: 'red' }} /></Space>))}<Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>Thêm dòng vật tư con</Button></>)}</Form.List>
                    <Button type="primary" htmlType="submit" block style={{marginTop: 20}}>Lưu Nhóm Vật Tư</Button>
                </Form>
            </Modal>
        </div>
    );
};

export default InventoryPage;