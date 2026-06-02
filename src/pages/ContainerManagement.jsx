import { useState, useEffect, useRef } from 'react'
import { Table, Button, Input, Select, Space, Tag, Modal, Form, Row, Col, Card, Divider, Popconfirm, message, Tooltip, Upload, DatePicker, Radio } from 'antd'
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeOutlined, UploadOutlined, LockOutlined } from '@ant-design/icons'
const XLSX = window.XLSX
import dayjs from 'dayjs'
import api from '../services/api'

const { Option } = Select

function ContainerManagement() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ shippingLine: '', size: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewItem, setViewItem] = useState(null)
  const [viewRefOpen, setViewRefOpen] = useState(false)
  const [referenceData, setReferenceData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('containerRef') || '[]') } catch { return [] }
  })
  const [addContainerNo, setAddContainerNo] = useState('')
  const [addShippingLine, setAddShippingLine] = useState('')
  const [addSize, setAddSize] = useState('')
  const [addBay, setAddBay] = useState('')
  const [addLocation, setAddLocation] = useState('')
  const [addRemark, setAddRemark] = useState('')
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [lockDate, setLockDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [lockShift, setLockShift] = useState('sáng')
  const [frequencies, setFrequencies] = useState({})
  const [form] = Form.useForm()
  const searchRef = useRef(null)
  const addNoRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('containerRef', JSON.stringify(referenceData))
  }, [referenceData])

  const fetchData = (p, ps) => {
    queueMicrotask(() => setLoading(true))
    const params = { page: p || page, limit: ps || pageSize, sort: 'createdAt' }
    if (search) params.search = search
    if (filters.shippingLine) params.shippingLine = filters.shippingLine
    if (filters.size) params.size = filters.size
    api.get('/containers', { params }).then((res) => {
      setData(res.data.data)
      setTotal(res.data.total)
    }).catch(() => {
      message.error('Lỗi tải dữ liệu')
    }).finally(() => {
      setLoading(false)
    })
  }

  const fetchFrequencies = () => {
    api.get('/containers/frequencies').then(res => setFrequencies(res.data)).catch(() => {})
  }

  useEffect(() => {
    fetchData()
    fetchFrequencies()
  }, [page, pageSize, search, filters])

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      ...record,
      createdAt: record.createdAt ? dayjs(record.createdAt) : null,
    })
    setModalOpen(true)
  }

  const openView = (record) => {
    setViewItem(record)
    setViewOpen(true)
  }

  const handleAdd = async () => {
    if (!addContainerNo || !addShippingLine || !addSize) {
      message.warning('Nhập Container No, Hãng tàu và Size')
      return
    }
    try {
      const payload = {
        containerNo: addContainerNo,
        shippingLine: addShippingLine,
        size: addSize,
        bay: addBay,
        location: addLocation,
        remark: addRemark,
      }
      await api.post('/containers', payload)
      message.success('Đã thêm container')
      setAddContainerNo('')
      setAddShippingLine('')
      setAddSize('')
      setAddBay('')
      setAddLocation('')
      setAddRemark('')
      addNoRef.current?.focus()
      fetchData()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi thêm container')
    }
  }

  const handleEditSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        createdAt: values.createdAt ? values.createdAt.toISOString() : undefined,
      }
      await api.put(`/containers/${editing._id}`, payload)
      message.success('Cập nhật thành công')
      setModalOpen(false)
      fetchData()
    } catch (e) {
      if (e.response) message.error(e.response.data?.message || 'Lỗi')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/containers/${id}`)
      message.success('Đã xóa container')
      fetchData()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa')
    }
  }

  const importExcel = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
        if (rows.length < 2) { message.warning('File không có dữ liệu'); return }
        const headerRow = rows[0]
        if (!headerRow || headerRow.length === 0) { message.error('File không có header'); return }
        const header = headerRow.map(h => String(h).toLowerCase().trim())
        const ci = header.findIndex(h => /s.?[o0].*cont|cont|soc/i.test(h))
        const si = header.findIndex(h => /hang|shipping|line|hãng|tàu/i.test(h))
        const zi = header.findIndex(h => /size|loại/i.test(h))
        const bi = header.findIndex(h => /bay/i.test(h))
        if (ci === -1) { message.error('Không tìm thấy cột Container No. Cột hiện có: ' + header.join(', ')); return }
        const refs = rows.slice(1).filter(r => r[ci]).map(r => ({
          containerNo: String(r[ci]).toUpperCase().trim(),
          shippingLine: si >= 0 && r[si] ? String(r[si]).trim() : '',
          size: zi >= 0 && r[zi] ? String(r[zi]).toUpperCase().trim() : '',
          bay: bi >= 0 && r[bi] ? String(r[bi]).toUpperCase().trim() : '',
        }))
        const merged = [...referenceData, ...refs]
        const seen = new Set()
        const deduped = merged.filter(r => {
          const key = r.containerNo + '|' + r.shippingLine
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        const added = deduped.length - referenceData.length
        const dupCount = merged.length - deduped.length
        setReferenceData(deduped)
        message.success(`Đã thêm ${added} reference${dupCount ? ` (loại ${dupCount} trùng)` : ''}. Tổng: ${deduped.length}`)
      } catch (err) {
        message.error('Lỗi đọc file Excel: ' + (err.message || ''))
      }
    }
    reader.readAsArrayBuffer(file)
    return false
  }

  const handleContainerNoChange = (e) => {
    const val = e.target.value.toUpperCase().trim()
    const match = referenceData.find(r => r.containerNo === val)
    if (match) {
      if (match.shippingLine) form.setFieldValue('shippingLine', match.shippingLine)
      if (match.size) form.setFieldValue('size', match.size)
      if (match.bay) form.setFieldValue('bay', match.bay)
    }
  }

  const handleAddNoChange = (v) => {
    setAddContainerNo(v)
    const match = referenceData.find(r => r.containerNo === v)
    if (match) {
      if (match.shippingLine) setAddShippingLine(match.shippingLine)
      if (match.size) setAddSize(match.size)
      if (match.bay) setAddBay(match.bay)
    }
  }

  const exportExcel = async () => {
    try {
      const params = {}
      if (search) params.search = search
      if (filters.shippingLine) params.shippingLine = filters.shippingLine
      if (filters.size) params.size = filters.size
      const res = await api.get('/containers/all', { params })
      const rows = res.data.map((c, i) => ({
        STT: i + 1,
        'Container No': c.containerNo,
        'Hãng tàu': c.shippingLine,
        Size: c.size,
        Bay: c.bay || '',
        'Phân Loại': c.location || '',
        'Ghi chú': c.remark || '',
        'Ngày tạo': dayjs(c.createdAt).format('DD/MM/YYYY'),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Containers')
      ws['!cols'] = [
        { wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 20 },
        { wch: 30 }, { wch: 18 },
      ]
      XLSX.writeFile(wb, `containers_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
      message.success('Xuất Excel thành công')
    } catch {
      message.error('Lỗi xuất Excel')
    }
  }

  const handleCreateLock = async () => {
    try {
      const params = {}
      if (search) params.search = search
      if (filters.shippingLine) params.shippingLine = filters.shippingLine
      if (filters.size) params.size = filters.size
      params.limit = total
      const res = await api.get('/containers', { params })
      const items = res.data.data.map(c => ({
        containerNo: c.containerNo,
        shippingLine: c.shippingLine,
        size: c.size,
        bay: c.bay || '',
        location: c.location || '',
        remark: c.remark || '',
      }))
      const containerIds = res.data.data.map(c => c._id)
      if (!items.length) { message.warning('Không có dữ liệu để chốt'); return }
      await api.post('/locks', { date: lockDate, shift: lockShift, items, containerIds })
      message.success(`Đã chốt ${items.length} container vào ca ${lockShift} ngày ${dayjs(lockDate).format('DD/MM/YYYY')}`)
      setLockModalOpen(false)
      fetchData()
      fetchFrequencies()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi chốt sản lượng')
    }
  }

  const containerFreq = frequencies

  const columns = [
    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => (page - 1) * pageSize + i + 1 },
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', sorter: true },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', sorter: true },
    { title: 'Size', dataIndex: 'size', key: 'size', sorter: true },
    { title: 'SL', key: 'count', width: 60, align: 'center', render: (_, r) => containerFreq[r.containerNo] > 1 ? <Tag color="red">{containerFreq[r.containerNo]}</Tag> : containerFreq[r.containerNo] },
    { title: 'Phân Loại', dataIndex: 'location', key: 'location', width: 120 },
    { title: 'Bay', dataIndex: 'bay', key: 'bay', width: 80 },
    { title: 'Ghi chú', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    {
      title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', width: 120, sorter: true,
      render: (v) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Hành động', key: 'action', width: 130, fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="Xem"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(record)} /></Tooltip>
          <Tooltip title="Sửa"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} /></Tooltip>
          <Popconfirm title="Xóa container này?" onConfirm={() => handleDelete(record._id)} okText="Xóa" cancelText="Hủy">
            <Tooltip title="Xóa"><Button type="text" danger size="small" icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Card className="mb-4">
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input
              ref={searchRef}
              placeholder="Tìm kiếm container..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select placeholder="Hãng tàu" allowClear className="w-full" value={filters.shippingLine || undefined} onChange={(v) => setFilters(p => ({ ...p, shippingLine: v || '' }))}>
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
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select placeholder="Size" allowClear className="w-full" value={filters.size || undefined} onChange={(v) => setFilters(p => ({ ...p, size: v || '' }))}>
              <Option value="20GP">20GP</Option>
              <Option value="40GP">40GP</Option>
              <Option value="40HC">40HC</Option>
              <Option value="45HC">45HC</Option>
              <Option value="20RF">20RF</Option>
              <Option value="40RF">40RF</Option>
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8} className="flex gap-2 flex-wrap">
            <Button icon={<ExportOutlined />} onClick={exportExcel}>Excel</Button>
            <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={importExcel}>
              <Button icon={<UploadOutlined />}>Import Ref</Button>
            </Upload>
            {referenceData.length > 0 && <Button icon={<EyeOutlined />} size="small" onClick={() => setViewRefOpen(true)}>{referenceData.length} ref</Button>}
            <Button icon={<LockOutlined />} onClick={() => setLockModalOpen(true)}>Tạo sản lượng</Button>
          </Col>
        </Row>
        <Divider className="my-3" />
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} sm={8} md={4}>
            <Input ref={addNoRef} placeholder="Container No" value={addContainerNo} onChange={e => handleAddNoChange(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select placeholder="Hãng tàu" className="w-full" value={addShippingLine || undefined} onChange={setAddShippingLine}>
              <Option value="">-- Chọn --</Option>
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
          </Col>
          <Col xs={8} sm={6} md={2}>
            <Input placeholder="Size" value={addSize} onChange={e => setAddSize(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </Col>
          <Col xs={12} sm={8} md={2}>
            <Input placeholder="Phân Loại" value={addLocation} onChange={e => setAddLocation(e.target.value)} />
          </Col>
          <Col xs={8} sm={6} md={2}>
            <Input placeholder="Bay" value={addBay} onChange={e => setAddBay(e.target.value.toUpperCase())} />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="Ghi chú" value={addRemark} onChange={e => setAddRemark(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Thêm</Button>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="_id"
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} container`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
        />
      </Card>

      <Modal
        title={editing ? 'Sửa Container' : 'Thêm Container'}
        open={modalOpen}
        onOk={handleEditSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText={editing ? 'Cập nhật' : 'Thêm'}
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="containerNo" label="Container No" rules={[{ required: true, message: 'Nhập số container' }]}>
                <Input placeholder="VD: TEMU5750298" onChange={handleContainerNoChange} />
              </Form.Item>
            </Col>
            <Col span={12}>
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
            </Col>
          </Row>
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
          </Row>
          <Form.Item name="remark" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Reference Container Imported" open={viewRefOpen} onCancel={() => setViewRefOpen(false)} footer={null} width={700}>
        <Table
          dataSource={referenceData}
          rowKey="containerNo"
          pagination={false}
          size="small"
          columns={[
            { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo' },
            { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine' },
            { title: 'Size', dataIndex: 'size', key: 'size' },
            { title: 'Bay', dataIndex: 'bay', key: 'bay' },
          ]}
        />
      </Modal>

      <Modal title="Chi tiết Container" open={viewOpen} onCancel={() => setViewOpen(false)} footer={null} width={500}>
        {viewItem && (
          <div className="space-y-2">
            <Row><Col span={8}><strong>Container No:</strong></Col><Col span={16}>{viewItem.containerNo}</Col></Row>
            <Row><Col span={8}><strong>Hãng tàu:</strong></Col><Col span={16}>{viewItem.shippingLine}</Col></Row>
            <Row><Col span={8}><strong>Size:</strong></Col><Col span={16}>{viewItem.size}</Col></Row>
            <Row><Col span={8}><strong>Phân Loại:</strong></Col><Col span={16}>{viewItem.location || '-'}</Col></Row>
            <Row><Col span={8}><strong>Bay:</strong></Col><Col span={16}>{viewItem.bay || '-'}</Col></Row>
            <Row><Col span={8}><strong>Ghi chú:</strong></Col><Col span={16}>{viewItem.remark || '-'}</Col></Row>
            <Row><Col span={8}><strong>Người tạo:</strong></Col><Col span={16}>{viewItem.createdBy}</Col></Row>
            <Row><Col span={8}><strong>Ngày tạo:</strong></Col><Col span={16}>{dayjs(viewItem.createdAt).format('DD/MM/YYYY HH:mm')}</Col></Row>
          </div>
        )}
      </Modal>

      <Modal
        title="Tạo sản lượng"
        open={lockModalOpen}
        onOk={handleCreateLock}
        onCancel={() => setLockModalOpen(false)}
        okText="Chốt sản lượng"
        cancelText="Hủy"
      >
        <Space direction="vertical" size="middle" className="w-full">
          <div>
            <label className="block mb-1 font-medium">Ngày:</label>
            <DatePicker
              value={dayjs(lockDate)}
              onChange={d => setLockDate(d.format('YYYY-MM-DD'))}
              format="DD/MM/YYYY"
              allowClear={false}
              className="w-full"
            />
          </div>
          <div>
            <label className="block mb-1 font-medium">Ca:</label>
            <Radio.Group value={lockShift} onChange={e => setLockShift(e.target.value)}>
              <Radio.Button value="sáng">Sáng</Radio.Button>
              <Radio.Button value="tối">Tối</Radio.Button>
            </Radio.Group>
          </div>
        </Space>
      </Modal>
    </div>
  )
}

export default ContainerManagement