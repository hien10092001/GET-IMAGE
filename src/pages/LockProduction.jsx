import { useState, useEffect, useRef } from 'react'
import { Table, Button, Input, Select, Space, Tag, Modal, Form, Row, Col, Card, DatePicker, Radio, Divider, Popconfirm, message, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons'
const XLSX = window.XLSX
import dayjs from 'dayjs'
import api from '../services/api'

const { Option } = Select

function LockProduction() {
  const [locks, setLocks] = useState([])
  const [loading, setLoading] = useState(false)
  const [lockDate, setLockDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [lockShift, setLockShift] = useState('sáng')
  const [detailOpen, setDetailOpen] = useState(false)
  const [currentLock, setCurrentLock] = useState(null)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [itemForm] = Form.useForm()
  const [addContainerNo, setAddContainerNo] = useState('')
  const [addShippingLine, setAddShippingLine] = useState('')
  const [addSize, setAddSize] = useState('')
  const [addBay, setAddBay] = useState('')
  const [addLocation, setAddLocation] = useState('')
  const [addRemark, setAddRemark] = useState('')
  const addNoRef = useRef(null)

  const fetchLocks = () => {
    setLoading(true)
    api.get('/locks').then(res => {
      setLocks(res.data)
    }).catch(() => {
      message.error('Lỗi tải dữ liệu')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchLocks() }, [])

  const handleLock = async () => {
    try {
      const existing = locks.find(l => l.date === lockDate && l.shift === lockShift)
      if (existing) {
        setCurrentLock(existing)
        setDetailOpen(true)
        return
      }
      const res = await api.post('/locks', { date: lockDate, shift: lockShift, items: [] })
      message.success(`Đã chốt sản lượng ca ${lockShift} ngày ${lockDate}`)
      fetchLocks()
      setCurrentLock(res.data)
      setDetailOpen(true)
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi chốt sản lượng')
    }
  }

  const handleViewLock = (lock) => {
    setCurrentLock(lock)
    setDetailOpen(true)
  }

  const handleAddItem = async () => {
    if (!addContainerNo || !addShippingLine || !addSize) {
      message.warning('Nhập Container No, Hãng tàu và Size')
      return
    }
    if (!currentLock) return
    try {
      const newItem = {
        containerNo: addContainerNo,
        shippingLine: addShippingLine,
        size: addSize,
        bay: addBay,
        location: addLocation,
        remark: addRemark,
      }
      const res = await api.put(`/locks/${currentLock._id}/items`, { items: [newItem] })
      setCurrentLock(res.data)
      setAddContainerNo('')
      setAddShippingLine('')
      setAddSize('')
      setAddBay('')
      setAddLocation('')
      setAddRemark('')
      addNoRef.current?.focus()
      message.success('Đã thêm')
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi thêm')
    }
  }

  const openEditItem = (item) => {
    setEditingItem(item)
    itemForm.setFieldsValue(item)
    setItemModalOpen(true)
  }

  const handleEditItem = async () => {
    try {
      const values = await itemForm.validateFields()
      setSubmitting(true)
      const res = await api.put(`/locks/${currentLock._id}/items/${editingItem._id}`, values)
      setCurrentLock(res.data)
      setItemModalOpen(false)
      setEditingItem(null)
      message.success('Đã sửa')
    } catch (e) {
      if (e.response) message.error(e.response.data?.message || 'Lỗi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteItem = async (itemId) => {
    try {
      const res = await api.delete(`/locks/${currentLock._id}/items/${itemId}`)
      setCurrentLock(res.data)
      message.success('Đã xóa')
    } catch (e) {
      message.error('Lỗi xóa')
    }
  }

  const handleDeleteLock = async (lockId) => {
    try {
      await api.delete(`/locks/${lockId}`)
      message.success('Đã xóa')
      setDetailOpen(false)
      setCurrentLock(null)
      fetchLocks()
    } catch (e) {
      message.error('Lỗi xóa')
    }
  }

  const exportLockExcel = () => {
    if (!currentLock) return
    const rows = currentLock.items.map((c, i) => ({
      STT: i + 1,
      'Container No': c.containerNo,
      'Hãng tàu': c.shippingLine,
      Size: c.size,
      'Phân Loại': c.location || '',
      Bay: c.bay || '',
      'Ghi chú': c.remark || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'SanLuong')
    ws['!cols'] = [
      { wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 30 },
    ]
    XLSX.writeFile(wb, `sanluong_${currentLock.date}_${currentLock.shift}.xlsx`)
    message.success('Xuất Excel thành công')
  }

  const columns = [
    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => i + 1 },
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo' },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine' },
    { title: 'Size', dataIndex: 'size', key: 'size' },
    { title: 'Phân Loại', dataIndex: 'location', key: 'location', width: 120 },
    { title: 'Bay', dataIndex: 'bay', key: 'bay', width: 80 },
    { title: 'Ghi chú', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    {
      title: 'Hành động', key: 'action', width: 100,
      render: (_, record) => (
        <Space>
          <Tooltip title="Sửa"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEditItem(record)} /></Tooltip>
          <Popconfirm title="Xóa item này?" onConfirm={() => handleDeleteItem(record._id)} okText="Xóa" cancelText="Hủy">
            <Tooltip title="Xóa"><Button type="text" danger size="small" icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const addColumns = [
    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => i + 1 },
    { title: 'Ngày', dataIndex: 'date', key: 'date', width: 110 },
    { title: 'Ca', dataIndex: 'shift', key: 'shift', width: 60 },
    { title: 'Số lượng', key: 'count', width: 80, render: (_, r) => r.items?.length || 0 },
    { title: 'Người chốt', dataIndex: 'createdBy', key: 'createdBy', width: 100 },
    {
      title: 'Ngày chốt', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: v => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Hành động', key: 'action', width: 80,
      render: (_, record) => (
        <Tooltip title="Xem chi tiết">
          <Button type="primary" size="small" icon={<EyeOutlined />} onClick={() => handleViewLock(record)} />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <Card className="mb-4">
        <Row gutter={16} align="middle">
          <Col>
            <DatePicker
              value={dayjs(lockDate)}
              onChange={d => setLockDate(d.format('YYYY-MM-DD'))}
              format="DD/MM/YYYY"
              allowClear={false}
            />
          </Col>
          <Col>
            <Radio.Group value={lockShift} onChange={e => setLockShift(e.target.value)}>
              <Radio.Button value="sáng">Sáng</Radio.Button>
              <Radio.Button value="tối">Tối</Radio.Button>
            </Radio.Group>
          </Col>
          <Col>
            <Button type="primary" icon={<LockOutlined />} onClick={handleLock}>
              Chốt sản lượng
            </Button>
          </Col>
        </Row>
      </Card>

      <Card title="Lịch sử chốt sản lượng" className="mb-4">
        <Table
          columns={addColumns}
          dataSource={locks}
          rowKey="_id"
          loading={loading}
          scroll={{ x: 700 }}
          pagination={{ pageSize: 10, showTotal: t => `Tổng ${t} phiếu` }}
        />
      </Card>

      <Modal
        title={currentLock ? `Sản lượng ca ${currentLock.shift} - ${dayjs(currentLock.date).format('DD/MM/YYYY')}` : ''}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={1100}
      >
        {currentLock && (
          <>
            <div className="flex items-center justify-between mb-3">
              <Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                  setEditingItem(null)
                  itemForm.resetFields()
                  setItemModalOpen(true)
                }}>
                  Thêm container
                </Button>
                <Button icon={<ExportOutlined />} onClick={exportLockExcel}>
                  Xuất Excel
                </Button>
              </Space>
              <Popconfirm title="Xóa toàn bộ phiếu này?" onConfirm={() => handleDeleteLock(currentLock._id)} okText="Xóa" cancelText="Hủy">
                <Button danger icon={<DeleteOutlined />}>Xóa phiếu</Button>
              </Popconfirm>
            </div>

            <Divider />

            <Row gutter={12} className="mb-3">
              <Col span={5}>
                <Input ref={addNoRef} placeholder="Container No" value={addContainerNo} onChange={e => setAddContainerNo(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
              </Col>
              <Col span={4}>
                <Input placeholder="Hãng tàu" value={addShippingLine} onChange={e => setAddShippingLine(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
              </Col>
              <Col span={3}>
                <Input placeholder="Size" value={addSize} onChange={e => setAddSize(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
              </Col>
              <Col span={3}>
                <Input placeholder="Phân Loại" value={addLocation} onChange={e => setAddLocation(e.target.value)} />
              </Col>
              <Col span={3}>
                <Input placeholder="Bay" value={addBay} onChange={e => setAddBay(e.target.value.toUpperCase())} />
              </Col>
              <Col span={4}>
                <Input placeholder="Ghi chú" value={addRemark} onChange={e => setAddRemark(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
              </Col>
              <Col>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>Thêm</Button>
              </Col>
            </Row>

            <Table
              columns={columns}
              dataSource={currentLock.items}
              rowKey="_id"
              scroll={{ x: 1000 }}
              pagination={false}
            />
          </>
        )}
      </Modal>

      <Modal
        title={editingItem ? 'Sửa container' : 'Thêm container'}
        open={itemModalOpen}
        onOk={editingItem ? handleEditItem : handleAddItem}
        onCancel={() => { setItemModalOpen(false); setEditingItem(null) }}
        confirmLoading={submitting}
        okText={editingItem ? 'Cập nhật' : 'Thêm'}
        cancelText="Hủy"
        width={600}
      >
        <Form form={itemForm} layout="vertical">
          <Form.Item name="containerNo" label="Container No" rules={[{ required: true, message: 'Nhập số container' }]}>
            <Input placeholder="VD: TEMU5750298" />
          </Form.Item>
          <Form.Item name="shippingLine" label="Hãng tàu" rules={[{ required: true, message: 'Chọn hãng tàu' }]}>
            <Select placeholder="Chọn hãng tàu">
              <Option value="MSC">MSC</Option>
              <Option value="MAERSK">MAERSK</Option>
              <Option value="CMA CGM">CMA CGM</Option>
              <Option value="COSCO">COSCO</Option>
              <Option value="HAPAG-LLOYD">HAPAG-LLOYD</Option>
              <Option value="ONE">ONE</Option>
              <Option value="EVERGREEN">EVERGREEN</Option>
              <Option value="YANG MING">YANG MING</Option>
              <Option value="ZIM">ZIM</Option>
              <Option value="WAN HAI">WAN HAI</Option>
              <Option value="Other">Other</Option>
            </Select>
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="size" label="Size" rules={[{ required: true, message: 'Nhập size' }]}>
                <Input placeholder="VD: 40HC" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Phân Loại">
                <Input placeholder="VD: Hư hỏng nặng / Nhẹ / ..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="bay" label="Bay">
                <Input placeholder="VD: A01" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="remark" label="Ghi chú">
                <Input placeholder="Ghi chú" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default LockProduction
