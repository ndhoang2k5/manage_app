import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Form, Input, Upload, message, Select, Tag, Popconfirm, Image, Descriptions, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import draftApi from '../api/draftApi';
import productionApi from '../api/productionApi';
import dayjs from 'dayjs';

const BASE_URL = window.location.origin; 

const DraftPage = () => {
    const [drafts, setDrafts] = useState([]);
    
    // State cho Modal Tạo/Sửa
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [fileList, setFileList] = useState([]);
    
    // State cho Modal Xem Chi Tiết (MỚI)
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [viewingItem, setViewingItem] = useState(null);

    const [form] = Form.useForm();

    const fetchDrafts = async () => {
        try {
            const res = await draftApi.getAll();
            setDrafts(res.data);
        } catch (error) { message.error("Lỗi tải dữ liệu"); }
    };

    useEffect(() => { fetchDrafts(); }, []);

    const handleUpload = async ({ file, onSuccess, onError }) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await productionApi.uploadImage(formData);
            file.url = res.data.url; 
            onSuccess("ok");
        } catch (err) { onError("Upload failed"); }
    };
    const handleFileChange = ({ fileList }) => setFileList(fileList);

    const openModal = (record = null) => {
        setEditingItem(record);
        if (record) {
            form.setFieldsValue(record);
            setFileList(record.images.map((url, i) => ({ uid: i, name: 'img', status: 'done', url: url, originFileObj: { url } })));
        } else {
            form.resetFields();
            setFileList([]);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (values) => {
        try {
            const imageUrls = fileList.map(f => f.originFileObj?.url || f.url).filter(Boolean);
            const payload = { ...values, image_urls: imageUrls };
            
            if (editingItem) {
                await draftApi.update(editingItem.id, payload);
                message.success("Cập nhật thành công!");
            } else {
                await draftApi.create(payload);
                message.success("Tạo mẫu dự kiến thành công!");
            }
            setIsModalOpen(false);
            fetchDrafts();
        } catch (error) { message.error("Lỗi lưu dữ liệu"); }
    };

    const handleDelete = async (id) => {
        try {
            await draftApi.delete(id);
            message.success("Đã xóa");
            fetchDrafts();
        } catch (error) { message.error("Lỗi xóa"); }
    };

    // --- HÀM MỞ MODAL CHI TIẾT (MỚI) ---
    const openDetailModal = (record) => {
        setViewingItem(record);
        setIsDetailOpen(true);
    };

    // Hàm đếm ngược
    const getRemainingTime = (createdAt) => {
        const created = dayjs(createdAt);
        const deadline = created.add(2, 'day');
        const now = dayjs();
        const diffHours = deadline.diff(now, 'hour');
        if (diffHours < 0) return { text: "Quá hạn", color: "red" };
        if (diffHours < 24) return { text: `Còn ${diffHours}h`, color: "orange" };
        return { text: "Còn >1 ngày", color: "green" };
    };

    const columns = [
        { title: 'Mã', dataIndex: 'code', width: 100, render: t => <b>{t}</b> },
        { 
            title: 'Hình ảnh', 
            dataIndex: 'images', 
            width: 100,
            render: (imgs) => imgs && imgs.length > 0 ? (
                <img src={imgs[0].startsWith('http') ? imgs[0] : `${BASE_URL}${imgs[0]}`} style={{height: 50, borderRadius: 4, objectFit: 'cover'}} />
            ) : <span style={{color:'#ccc', fontSize: 12}}>No Image</span>
        },
        { title: 'Tên Ý Tưởng / Mẫu', dataIndex: 'name', render: t => <b>{t}</b> },
        { 
            title: 'Deadline (2 ngày)', 
            key: 'deadline',
            width: 120,
            render: (_, r) => {
                if (r.status !== 'pending') return <Tag color="default">Hoàn tất</Tag>;
                const { text, color } = getRemainingTime(r.created_at);
                return <Tag color={color}>{text}</Tag>;
            }
        },
        { 
            title: 'Trạng thái', dataIndex: 'status', width: 100,
            render: s => <Tag color={s==='approved'?'green':s==='rejected'?'red':'orange'}>{s?.toUpperCase()}</Tag>
        },
        {
            title: 'Hành động', key: 'action', width: 150, align: 'center',
            render: (_, r) => (
                <div style={{display: 'flex', gap: 8, justifyContent: 'center'}}>
                    {/* Nút Xem Chi Tiết */}
                    <Button icon={<EyeOutlined />} size="small" onClick={() => openDetailModal(r)} title="Xem chi tiết" />
                    
                    <Button icon={<EditOutlined />} size="small" onClick={() => openModal(r)} />
                    <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDelete(r.id)}>
                        <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                </div>
            )
        }
    ];

    return (
        <div style={{padding: 0}}>
            <Card title="Danh sách Mẫu Dự Kiến & Ý Tưởng" extra={<Button type="primary" onClick={() => openModal()}>+ Thêm Ý Tưởng</Button>}>
                <Table dataSource={drafts} columns={columns} rowKey="id" pagination={{pageSize: 8}} />
            </Card>

            {/* MODAL TẠO/SỬA */}
            <Modal title={editingItem ? "Sửa Ý Tưởng" : "Thêm Ý Tưởng Mới"} open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null}>
                <Form layout="vertical" form={form} onFinish={handleSave}>
                    <Form.Item label="Mã Dự Kiến" name="code" rules={[{required: true}]}><Input /></Form.Item>
                    <Form.Item label="Tên Ý Tưởng" name="name" rules={[{required: true}]}><Input /></Form.Item>
                    <Form.Item label="Ghi chú chi tiết" name="note"><Input.TextArea rows={4} /></Form.Item>
                    {editingItem && (
                        <Form.Item label="Trạng thái duyệt" name="status">
                            <Select>
                                <Select.Option value="pending">Chờ duyệt</Select.Option>
                                <Select.Option value="approved">Đã duyệt (Lên mẫu)</Select.Option>
                                <Select.Option value="rejected">Hủy bỏ</Select.Option>
                            </Select>
                        </Form.Item>
                    )}
                    <Form.Item label="Hình ảnh tham khảo">
                        <Upload listType="picture-card" fileList={fileList} customRequest={handleUpload} onChange={handleFileChange}>
                            {fileList.length >= 5 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>Upload</div></div>}
                        </Upload>
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>Lưu</Button>
                </Form>
            </Modal>

            {/* --- MODAL XEM CHI TIẾT (MỚI) --- */}
            <Modal 
                title="Chi Tiết Mẫu Dự Kiến" 
                open={isDetailOpen} 
                onCancel={() => setIsDetailOpen(false)} 
                footer={[<Button key="close" onClick={() => setIsDetailOpen(false)}>Đóng</Button>]}
                width={800}
            >
                {viewingItem && (
                    <div>
                        <Descriptions bordered column={1} labelStyle={{width: 150, fontWeight: 'bold'}}>
                            <Descriptions.Item label="Mã Dự Kiến">{viewingItem.code}</Descriptions.Item>
                            <Descriptions.Item label="Tên Ý Tưởng">{viewingItem.name}</Descriptions.Item>
                            <Descriptions.Item label="Ngày tạo">{dayjs(viewingItem.created_at).format('DD/MM/YYYY HH:mm')}</Descriptions.Item>
                            <Descriptions.Item label="Trạng thái">
                                <Tag color={viewingItem.status==='approved'?'green':viewingItem.status==='rejected'?'red':'orange'}>
                                    {viewingItem.status?.toUpperCase()}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Ghi chú">
                                <div style={{whiteSpace: 'pre-wrap'}}>{viewingItem.note || "Không có ghi chú"}</div>
                            </Descriptions.Item>
                        </Descriptions>

                        <Divider orientation="left">Hình Ảnh Tham Khảo</Divider>
                        
                        <div style={{display: 'flex', gap: 15, flexWrap: 'wrap'}}>
                            {viewingItem.images && viewingItem.images.length > 0 ? (
                                <Image.PreviewGroup>
                                    {viewingItem.images.map((url, idx) => (
                                        <Image 
                                            key={idx}
                                            width={200}
                                            src={url.startsWith('http') ? url : `${BASE_URL}${url}`} 
                                            style={{border: '1px solid #ddd', padding: 4, borderRadius: 4}}
                                        />
                                    ))}
                                </Image.PreviewGroup>
                            ) : (
                                <span style={{color:'#999'}}>Không có hình ảnh</span>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default DraftPage;