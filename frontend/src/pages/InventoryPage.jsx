import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Modal, Form, Input, InputNumber, message, Tabs, Space, Select, Divider, Tooltip } from 'antd';
import { PlusOutlined, AppstoreOutlined, GroupOutlined, DeleteOutlined, SearchOutlined, EditOutlined } from '@ant-design/icons';
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
    const [editingItem, setEditingItem] = useState(null); // Lưu item đang sửa

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

    // --- MỞ MODAL TẠO MỚI ---
    const openCreateModal = () => {
        setEditingItem(null); // Reset chế độ sửa
        form.resetFields();
        setIsModalOpen(true);
    };

    // --- MỞ MODAL SỬA ---
    const openEditModal = (record) => {
        setEditingItem(record); // Gán item đang sửa
        // Điền dữ liệu cũ vào form
        form.setFieldsValue({
            sku: record.sku,
            name: record.variant_name,
            unit: record.category_name, // Backend trả về unit ở field category_name (do query join) - Cần lưu ý mapping này
            cost_price: record.cost_price,
            attributes: "", // Nếu backend chưa trả về attr thì để trống
            note: record.note
        });
        setIsModalOpen(true);
    };

    // --- XỬ LÝ LƯU (TẠO HOẶC SỬA) ---
    const handleSaveMaterial = async (values) => {
        try {
            if (editingItem) {
                // Logic SỬA
                await productApi.update(editingItem.id, values);
                message.success("Cập nhật thành công!");
            } else {
                // Logic TẠO MỚI
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
            const payload = {
                ...values,
                items: values.items.map(item => ({
                    material_variant_id: item.material_variant_id,
                    quantity: 1 
                }))
            };
            await productApi.createGroup(payload);
            message.success("Tạo nhóm thành công!");
            setIsGroupModalOpen(false);
            groupForm.resetFields();
            fetchData();
        } catch (error) {
            message.error("Lỗi: " + (error.response?.data?.detail || "Không thể tạo nhóm"));
        }
    };

    const materialColumns = [
        { title: 'ID', dataIndex: 'id', width: 60, align: 'center', render: t => <span style={{color:'#888'}}>#{t}</span> },
        { title: 'Mã SKU', dataIndex: 'sku', render: t => <Tag color="geekblue">{t}</Tag> },
        { title: 'Tên Vật Tư', dataIndex: 'variant_name', render: t => <b>{t}</b> },
        { title: 'Ghi chú', dataIndex: 'note', render: (t) => t ? <span style={{color: '#666', fontStyle: 'italic'}}>{t}</span> : '-' },
        { title: 'Giá Vốn', dataIndex: 'cost_price', align: 'right', render: v => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0) },
        { title: 'Tồn kho', dataIndex: 'quantity_on_hand', align: 'center', render: q => <Tag color={q > 0 ? 'success' : 'error'}>{q > 0 ? q : 'Hết'}</Tag> },
        
        // CỘT HÀNH ĐỘNG MỚI
        {
            title: '',
            key: 'action',
            width: 50,
            render: (_, record) => (
                <Button 
                    type="text" 
                    icon={<EditOutlined />} 
                    onClick={() => openEditModal(record)} 
                    style={{color: '#1677ff'}}
                />
            )
        }
    ];

    const groupColumns = [
        { title: 'Mã Nhóm', dataIndex: 'code', width: 150, render: t => <Tag color="purple" style={{fontSize: 14}}>{t}</Tag> },
        { title: 'Tên Nhóm / Bộ', dataIndex: 'name', width: 250, render: t => <b>{t}</b> },
        { title: 'Thành phần', dataIndex: 'items_summary', render: t => <span style={{color: '#666'}}>{t}</span> }, 
        { title: 'Ghi chú', dataIndex: 'description' },
    ];

    return (
        <div>
            <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <Tabs defaultActiveKey="1" items={[
                    {
                        key: '1',
                        label: <span><AppstoreOutlined /> Kho Vật Tư Lẻ</span>,
                        children: (
                            <>
                                <div style={{marginBottom: 16, display: 'flex', justifyContent: 'space-between'}}>
                                    <Input 
                                        placeholder="Tìm theo Tên, SKU hoặc Ghi chú..." 
                                        prefix={<SearchOutlined />} 
                                        style={{ width: 400 }}
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                        allowClear
                                    />
                                    <Button type="primary" onClick={openCreateModal} icon={<PlusOutlined />}>Nhập Vật Tư Mới</Button>
                                </div>
                                <Table dataSource={filteredMaterials} columns={materialColumns} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
                            </>
                        )
                    },
                    {
                        key: '2',
                        label: <span><GroupOutlined /> Danh sách Bộ/Nhóm (Sets)</span>,
                        children: (
                            <>
                                <div style={{marginBottom: 16, textAlign: 'right'}}>
                                    <Button type="dashed" onClick={() => setIsGroupModalOpen(true)} icon={<PlusOutlined />}>Tạo Nhóm Mới</Button>
                                </div>
                                <Table dataSource={groups} columns={groupColumns} rowKey="id" loading={loading} />
                            </>
                        )
                    }
                ]} />
            </Card>

            {/* MODAL TẠO / SỬA */}
            <Modal 
                title={editingItem ? "Sửa Thông Tin Vật Tư" : "Thêm Vật Tư Mới"} 
                open={isModalOpen} 
                onCancel={() => setIsModalOpen(false)} 
                footer={null}
            >
                <Form layout="vertical" onFinish={handleSaveMaterial} form={form}>
                    <Form.Item label="Mã SKU" name="sku" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label="Tên Vật tư" name="name" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label="Ghi chú" name="note">
                        <Input.TextArea rows={2} />
                    </Form.Item>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <Form.Item label="Đơn vị tính" name="unit" initialValue="Cái">
                            <Input />
                        </Form.Item>
                        
                        {/* LOGIC KHÓA GIÁ VỐN KHI SỬA */}
                        <Tooltip title={editingItem ? "Không thể sửa trực tiếp. Hãy sửa phiếu nhập nếu giá sai." : "Giá vốn khởi tạo"}>
                            <Form.Item label="Giá vốn (VNĐ)" name="cost_price">
                                <InputNumber 
                                    style={{ width: '100%' }} 
                                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    disabled={!!editingItem} // Disabled nếu đang sửa
                                    className={editingItem ? 'input-disabled-black' : ''}
                                />
                            </Form.Item>
                        </Tooltip>
                    </div>
                    
                    {editingItem && (
                        <div style={{marginBottom: 16, fontSize: 12, color: '#faad14'}}>
                            * Lưu ý: Giá vốn được tính bình quân từ các đơn nhập hàng. Không sửa trực tiếp tại đây.
                        </div>
                    )}

                    <Button type="primary" htmlType="submit" block>
                        {editingItem ? "Cập nhật" : "Lưu Vật Tư"}
                    </Button>
                </Form>
            </Modal>

            {/* MODAL TẠO NHÓM (Giữ nguyên) */}
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