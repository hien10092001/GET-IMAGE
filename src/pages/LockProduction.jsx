import { useState, useEffect, useRef } from 'react'
import { Table, Button, Input, Select, AutoComplete, Space, Tag, Modal, Form, Row, Col, Card, DatePicker, Radio, Divider, Popconfirm, message, Tooltip, Upload, Tabs, Checkbox, Popover } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeOutlined, LockOutlined, UploadOutlined, UnlockOutlined, SearchOutlined, CopyOutlined, CheckCircleOutlined, FilterOutlined } from '@ant-design/icons'
const XLSX = window.XLSX
import dayjs from 'dayjs'
import api from '../services/api'

const { Option } = Select

const renderMultiTag = (v, color) => {
  if (!v) return <span className="text-gray-400">--</span>
  return v.split(', ').map((d, i) => <Tag key={i} color={color} style={{ marginBottom: 2 }}>{d.trim()}</Tag>)
}

const dateInRange = (dateStr, from, to) => {
  if (!dateStr || !from || !to) return false
  return dateStr.split(', ').some(d => {
    const ts = dayjs(d.trim()).valueOf()
    return ts >= from.valueOf() && ts <= to.valueOf()
  })
}

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
  const [searchText, setSearchText] = useState('')
  const [search, setSearch] = useState('')
  const searchTimerRef = useRef(null)
  const [filterDateRange, setFilterDateRange] = useState(null)
  const [filterShift, setFilterShift] = useState('')
  const [filterShippingLine, setFilterShippingLine] = useState('')
  const [filterSize, setFilterSize] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewItems, setPreviewItems] = useState([])
  const [previewSource, setPreviewSource] = useState(null)
  const [previewEditIndex, setPreviewEditIndex] = useState(-1)
  const [previewEditOpen, setPreviewEditOpen] = useState(false)
  const [previewForm] = Form.useForm()
  const [shippingLists, setShippingLists] = useState([])
  const [slLoading, setSlLoading] = useState(false)
  const [createSlOpen, setCreateSlOpen] = useState(false)
  const [createSlName, setCreateSlName] = useState('')
  const [createSlShippingLine, setCreateSlShippingLine] = useState('')
  const [createSlItems, setCreateSlItems] = useState([])
  const [detailSlOpen, setDetailSlOpen] = useState(false)
  const [detailSl, setDetailSl] = useState(null)
  const [detailSlLoading, setDetailSlLoading] = useState(false)
  const [slFilter, setSlFilter] = useState('all')
  const [createSlFilter, setCreateSlFilter] = useState('all')
  const [previewFilter, setPreviewFilter] = useState('all')
  const [slSearchText, setSlSearchText] = useState('')
  const [slSelectedRowKeys, setSlSelectedRowKeys] = useState([])
  const [slDateRange, setSlDateRange] = useState(null)
  const [slDetailDateRange, setSlDetailDateRange] = useState(null)
  const [selectedExportFields, setSelectedExportFields] = useState({
    containerNo: true,
    shippingLine: false,
    size: false,
    location: true,
    remark: true,
    bay: false,
    createdAt: false,
    dscGroup: false,
    xuLiLai: false,
    vsDvs: false,
    shippingLists: false,
  })

  const exportFieldLabels = {
    containerNo: 'Container No',
    shippingLine: 'Hãng tàu',
    size: 'Size',
    location: 'Phân Loại',
    remark: 'Ghi chú',
    bay: 'Bay',
    createdAt: 'Ngày tạo',
    dscGroup: 'Đã sửa chữa',
    xuLiLai: 'Xử lý lại',
    vsDvs: 'Vệ sinh',
    shippingLists: 'List tàu',
  }

  const getActiveExportFields = () =>
    Object.entries(selectedExportFields).filter(([, v]) => v).map(([k]) => exportFieldLabels[k])

  const getShippingListNames = (containerNo) => {
    const names = shippingLists
      .filter(sl => sl.items?.some(i => i.containerNo === containerNo))
      .map(sl => sl.name)
    return names.length ? names.join(', ') : ''
  }

  const buildExportRow = (item, fields) => {
    const row = { STT: (item._idx || 0) + 1 }
    fields.forEach(f => {
      if (f === 'Container No') row[f] = item.containerNo || ''
      else if (f === 'Hãng tàu') row[f] = item.shippingLine || ''
      else if (f === 'Size') row[f] = item.size || ''
      else if (f === 'Phân Loại') row[f] = item.location || ''
      else if (f === 'Ghi chú') row[f] = item.remark || ''
      else if (f === 'Bay') row[f] = item.bay || ''
      else if (f === 'Ngày tạo') row[f] = item.createdAt ? dayjs(item.createdAt).format('DD/MM/YYYY') : ''
      else if (f === 'Đã sửa chữa') row[f] = item.dsc || item.choHtxnDvs || item.sc || ''
      else if (f === 'Xử lý lại') row[f] = item.xuLiLai || ''
      else if (f === 'Vệ sinh') row[f] = item.vsDvs || ''
      else if (f === 'List tàu') row[f] = getShippingListNames(item.containerNo)
    })
    return row
  }

  const fetchLocks = () => {
    queueMicrotask(() => setLoading(true))
    const params = {}
    if (search) params.search = search
    if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
      params.dateFrom = filterDateRange[0].format('YYYY-MM-DD')
      params.dateTo = filterDateRange[1].format('YYYY-MM-DD')
    }
    if (filterShift) params.shift = filterShift
    if (filterShippingLine) params.shippingLine = filterShippingLine
    if (filterSize) params.size = filterSize
    api.get('/locks', { params }).then(res => {
      setLocks(res.data)
    }).catch(() => {
      message.error('Lỗi tải dữ liệu')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchLocks() }, [search, filterDateRange, filterShift, filterShippingLine, filterSize])

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

  const parseExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
          if (rows.length < 2) { reject(new Error('File không có dữ liệu')); return }
          const header = rows[0].map(h => String(h).toLowerCase().trim())
          const ci = header.findIndex(h => /cont|soc/i.test(h))
          const si = header.findIndex(h => /hang|shipping|hãng|tàu/i.test(h))
          const zi = header.findIndex(h => /size/i.test(h))
          const li = header.findIndex(h => /phân|loại|location/i.test(h))
          const bi = header.findIndex(h => /bay/i.test(h))
          const ri = header.findIndex(h => /ghi|chú|remark/i.test(h))
          const dsci = header.findIndex(h => /dsc/i.test(h))
          const choi = header.findIndex(h => /cho.*htxn|chờ.*xử.*lý|htxn.*dvs/i.test(h))
          const sci = header.findIndex(h => /^sc$/i.test(h))
          const vsi = header.findIndex(h => /vs.*dvs|vệ sinh/i.test(h))
          const xuli = header.findIndex(h => /x[uúùủũụứừửữự] l[iíìĩị] l[aàáãạ]i|xu li lai/i.test(h))
          if (ci === -1) { reject(new Error('Không tìm thấy cột Container No')); return }
          const items = rows.slice(1).filter(r => r[ci]).map(r => ({
            containerNo: String(r[ci]).toUpperCase().trim(),
            shippingLine: si >= 0 && r[si] ? String(r[si]).trim() : '',
            size: zi >= 0 && r[zi] ? String(r[zi]).toUpperCase().trim() : '',
            location: li >= 0 && r[li] ? String(r[li]).trim() : '',
            bay: bi >= 0 && r[bi] ? String(r[bi]).toUpperCase().trim() : '',
            remark: ri >= 0 && r[ri] ? String(r[ri]).trim() : '',
            dsc: dsci >= 0 && r[dsci] ? String(r[dsci]).trim() : '',
            choHtxnDvs: choi >= 0 && r[choi] ? String(r[choi]).trim() : '',
            sc: sci >= 0 && r[sci] ? String(r[sci]).trim() : '',
            vsDvs: vsi >= 0 && r[vsi] ? String(r[vsi]).trim() : '',
            xuLiLai: xuli >= 0 && r[xuli] ? String(r[xuli]).trim() : '',
            _tempId: Math.random().toString(36).slice(2),
          })).filter(i => i.containerNo && i.shippingLine && i.size)
          if (!items.length) { reject(new Error('Không có dữ liệu hợp lệ')); return }
          resolve(items)
        } catch (err) { reject(err) }
      }
      reader.onerror = () => reject(new Error('Lỗi đọc file'))
      reader.readAsArrayBuffer(file)
    })
  }

  const copyItemsToClipboard = (items) => {
    const activeFields = getActiveExportFields()
    if (activeFields.length === 0) { message.warning('Chọn ít nhất một cột'); return }
    const header = activeFields.join('\t')
    const rows = items.map((i, idx) => {
      const row = buildExportRow({ ...i, _idx: idx }, activeFields)
      return activeFields.map(f => String(row[f] ?? '')).join('\t')
    })
    navigator.clipboard.writeText(header + '\n' + rows.join('\n')).then(() => {
      message.success(`Đã copy ${rows.length} dòng`)
    }).catch(() => {
      message.error('Lỗi copy')
    })
  }

  const handleSavePreview = async () => {
    try {
      setSubmitting(true)
      if (previewSource?.type === 'main') {
        const existing = locks.find(l => l.date === previewSource.date && l.shift === previewSource.shift)
        if (existing) {
          await api.put(`/locks/${existing._id}/items`, { items: previewItems })
        } else {
          const res = await api.post('/locks', { date: previewSource.date, shift: previewSource.shift, items: previewItems })
          setCurrentLock(res.data)
          setDetailOpen(true)
        }
      } else if (previewSource?.type === 'detail' && previewSource.lockId) {
        const res = await api.put(`/locks/${previewSource.lockId}/items`, { items: previewItems })
        setCurrentLock(res.data)
      }
      message.success(`Đã thêm ${previewItems.length} container`)
      setPreviewOpen(false)
      setPreviewItems([])
      setPreviewSource(null)
      fetchLocks()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi lưu dữ liệu')
    } finally {
      setSubmitting(false)
    }
  }

  const openPreviewEdit = (item, index) => {
    setPreviewEditIndex(index)
    previewForm.setFieldsValue(item)
    setPreviewEditOpen(true)
  }

  const handlePreviewEdit = async () => {
    try {
      const values = await previewForm.validateFields()
      const updated = [...previewItems]
      updated[previewEditIndex] = { ...updated[previewEditIndex], ...values }
      setPreviewItems(updated)
      setPreviewEditOpen(false)
      setPreviewEditIndex(-1)
      message.success('Đã sửa')
    } catch (e) { /* validation failed */ }
  }

  const handlePreviewDelete = (index) => {
    const updated = previewItems.filter((_, i) => i !== index)
    setPreviewItems(updated)
    message.success('Đã xóa')
  }

  const exportLockExcel = () => {
    if (!currentLock) return
    const activeFields = getActiveExportFields()
    if (activeFields.length === 0) { message.warning('Chọn ít nhất một cột'); return }
    const rows = currentLock.items.map((c, i) =>
      buildExportRow({ ...c, createdAt: currentLock.createdAt, _idx: i }, activeFields)
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'SanLuong')
    ws['!cols'] = [{ wch: 5 }, ...activeFields.map(() => ({ wch: 18 }))]
    XLSX.writeFile(wb, `sanluong_${currentLock.date}_${currentLock.shift}.xlsx`)
    message.success('Xuất Excel thành công')
  }

  const fetchShippingLists = async (dates) => {
    try {
      setSlLoading(true)
      const params = {}
      if (dates && dates[0] && dates[1]) {
        params.dateFrom = dates[0].format('YYYY-MM-DD')
        params.dateTo = dates[1].format('YYYY-MM-DD')
      }
      const res = await api.get('/shipping-lists', { params })
      setShippingLists(res.data)
    } catch { message.error('Lỗi tải danh sách tàu')
    } finally { setSlLoading(false) }
  }

  const handleCreateSl = async () => {
    if (!createSlName.trim() || !createSlItems.length) {
      message.warning('Nhập tên list và tải Excel'); return
    }
    try {
      await api.post('/shipping-lists', { name: createSlName, shippingLine: createSlShippingLine, items: createSlItems })
      message.success('Đã tạo list tàu')
      setCreateSlOpen(false)
      setCreateSlName('')
      setCreateSlShippingLine('')
      setCreateSlItems([])
      fetchShippingLists()
    } catch (e) { message.error(e.response?.data?.message || 'Lỗi tạo list') }
  }

  const handleViewSl = async (id) => {
    try {
      setDetailSlLoading(true)
      const res = await api.get(`/shipping-lists/${id}`)
      setDetailSl(res.data)
      setDetailSlOpen(true)
    } catch { message.error('Lỗi tải chi tiết')
    } finally { setDetailSlLoading(false) }
  }

  const handleDeleteSl = async (id) => {
    try {
      await api.delete(`/shipping-lists/${id}`)
      message.success('Đã xóa')
      fetchShippingLists()
    } catch { message.error('Lỗi xóa') }
  }

  const handleDeleteSlItem = async (listId, itemId) => {
    try {
      await api.delete(`/shipping-lists/${listId}/items/${itemId}`)
      message.success('Đã xóa')
      handleViewSl(listId)
    } catch { message.error('Lỗi xóa') }
  }

  useEffect(() => { fetchShippingLists(slDateRange) }, [slDateRange])

  const columns = [
    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => i + 1 },
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo' },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 100 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'Phân Loại', dataIndex: 'location', key: 'location', width: 100 },
    { title: 'Ghi chú', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    { title: 'Bay', dataIndex: 'bay', key: 'bay', width: 80 },
    {
      title: 'List tàu', key: 'shippingLists', width: 180,
      render: (_, r) => {
        const lists = shippingLists.filter(sl => sl.items?.some(i => i.containerNo === r.containerNo))
        return lists.length ? lists.map(l => <Tag key={l._id} color="geekblue" style={{ marginBottom: 2 }}>{l.name}</Tag>) : <span className="text-gray-400">--</span>
      },
    },
    {
      title: 'Hành động', key: 'action', width: 105,
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

  const exportPreviewExcel = () => {
    const activeFields = getActiveExportFields()
    if (activeFields.length === 0) { message.warning('Chọn ít nhất một cột'); return }
    const rows = previewItems.map((c, i) => buildExportRow({ ...c, _idx: i }, activeFields))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Preview')
    ws['!cols'] = [{ wch: 5 }, ...activeFields.map(() => ({ wch: 18 }))]
    XLSX.writeFile(wb, `preview_sanluong_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
    message.success('Xuất Excel thành công')
  }

  const exportSlExcel = (items, name) => {
    const activeFields = getActiveExportFields()
    if (activeFields.length === 0) { message.warning('Chọn ít nhất một cột'); return }
    const rows = items.map((c, i) => buildExportRow({ ...c, _idx: i }, activeFields))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DSContainer')
    ws['!cols'] = [
      { wch: 5 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
    ]
    XLSX.writeFile(wb, `ds_${name || 'tau'}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
    message.success('Xuất Excel thành công')
  }

  const fetchContainerStatus = async (items) => {
    try {
      const containerNos = items.map(i => i.containerNo)
      const res = await api.post('/locks/check-status', { containerNos })
      return items.map(i => ({ ...i, locked: !!res.data[i.containerNo] }))
    } catch {
      return items.map(i => ({ ...i, locked: false }))
    }
  }

  const previewColumns = [
    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => i + 1 },
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', width: 160 },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 140 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'Phân Loại', dataIndex: 'location', key: 'location', width: 120 },
    { title: 'Ghi chú', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    { title: 'Bay', dataIndex: 'bay', key: 'bay', width: 80 },
    {
      title: 'List tàu', key: 'shippingLists', width: 180,
      render: (_, r) => {
        const lists = shippingLists.filter(sl => sl.items?.some(i => i.containerNo === r.containerNo))
        return lists.length ? lists.map(l => <Tag key={l._id} color="geekblue" style={{ marginBottom: 2 }}>{l.name}</Tag>) : <span className="text-gray-400">--</span>
      },
    },
    {
      title: 'DA SUA CHUA', key: 'dscGroup', width: 160,
      render: (_, r) => renderMultiTag(r.dsc || r.choHtxnDvs || r.sc, 'green'),
    },
    {
      title: 'XU LI LAI', dataIndex: 'xuLiLai', key: 'xuLiLai', width: 120,
      render: v => renderMultiTag(v, 'red'),
    },
    {
      title: 'DA VE SINH', dataIndex: 'vsDvs', key: 'vsDvs', width: 120,
      render: v => renderMultiTag(v, 'blue'),
    },
    {
      title: 'Hành động', key: 'action', width: 100,
      render: (_, record, index) => (
        <Space>
          <Tooltip title="Sửa"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openPreviewEdit(record, index)} /></Tooltip>
          <Popconfirm title="Xóa?" onConfirm={() => handlePreviewDelete(index)} okText="Xóa" cancelText="Hủy">
            <Tooltip title="Xóa"><Button type="text" danger size="small" icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
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
            <Button
              type="primary"
              icon={<LockOutlined />}
              onClick={handleLock}
              size="large"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', fontWeight: 600, boxShadow: '0 2px 8px rgba(102,126,234,0.4)' }}
            >
              Chốt sản lượng
            </Button>
          </Col>
          <Col>
            <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={async (file) => {
              try {
                const items = await parseExcelFile(file)
                const itemsWithStatus = await fetchContainerStatus(items)
                setPreviewItems(itemsWithStatus)
                setPreviewSource({ type: 'main', date: lockDate, shift: lockShift })
                setPreviewOpen(true)
              } catch (err) {
                message.error(err.message || 'Lỗi đọc file')
              }
              return false
            }}>
              <Button type="primary" icon={<UploadOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }}>Tải Excel</Button>
            </Upload>
          </Col>
          <Col>
            <Button icon={<EyeOutlined />} onClick={() => setCreateSlOpen(true)}>
              DS Tàu
            </Button>
          </Col>
        </Row>
      </Card>

      <Card className="mb-4">
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={6}>
            <Input
              placeholder="Tìm kiếm container..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={e => {
                const val = e.target.value
                setSearchText(val)
                clearTimeout(searchTimerRef.current)
                searchTimerRef.current = setTimeout(() => setSearch(val), 300)
              }}
              allowClear
              onClear={() => { setSearchText(''); setSearch('') }}
            />
          </Col>
          <Col xs={12} md={5}>
            <DatePicker.RangePicker
              value={filterDateRange}
              onChange={dates => setFilterDateRange(dates)}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={12} md={3}>
            <Select
              placeholder="Ca"
              allowClear
              className="w-full"
              value={filterShift || undefined}
              onChange={v => setFilterShift(v || '')}
            >
              <Option value="sáng">Sáng</Option>
              <Option value="tối">Tối</Option>
            </Select>
          </Col>
          <Col xs={12} md={3}>
            <Input
              placeholder="Hãng tàu"
              value={filterShippingLine}
              onChange={e => setFilterShippingLine(e.target.value)}
              allowClear
              onClear={() => setFilterShippingLine('')}
            />
          </Col>
          <Col xs={12} md={3}>
            <Input
              placeholder="Size"
              value={filterSize}
              onChange={e => setFilterSize(e.target.value.toUpperCase())}
              allowClear
              onClear={() => setFilterSize('')}
            />
          </Col>
        </Row>
      </Card>

      <Card className="mb-4">
        <Tabs
          defaultActiveKey="san-luong"
          items={[
            {
              key: 'san-luong',
              label: <span><LockOutlined /> Sản lượng</span>,
              children: (
                <Table
                  columns={addColumns}
                  dataSource={locks}
                  rowKey="_id"
                  loading={loading}
                  scroll={{ x: 700 }}
                  pagination={{ pageSize: 10, showTotal: t => `Tổng ${t} phiếu` }}
                />
              ),
            },
            {
              key: 'tau',
              label: <span><EyeOutlined /> Danh sách tàu</span>,
              children: (
                <>
                <div className="mb-3">
                  <DatePicker.RangePicker
                    value={slDateRange}
                    onChange={dates => setSlDateRange(dates)}
                    format="DD/MM/YYYY"
                    placeholder={['Từ ngày', 'Đến ngày']}
                    allowClear
                    onClear={() => setSlDateRange(null)}
                  />
                </div>
                <Table
                  rowKey="_id"
                  loading={slLoading}
                  scroll={{ x: 700 }}
                  pagination={{ pageSize: 10, showTotal: t => `Tổng ${t} list` }}
                  dataSource={shippingLists}
                  columns={[
                    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => i + 1 },
                    { title: 'Tên list', dataIndex: 'name', key: 'name', width: 180 },
                    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 140, render: v => v || <span className="text-gray-400">--</span> },
                    { title: 'Số lượng', key: 'count', width: 80, render: (_, r) => r.items?.length || 0 },
                    { title: 'Người tạo', dataIndex: 'createdBy', key: 'createdBy', width: 100 },
                    {
                      title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', width: 120,
                      render: v => dayjs(v).format('DD/MM/YYYY HH:mm'),
                    },
                    {
                      title: 'Hành động', key: 'action', width: 120,
                      render: (_, record) => (
                        <Space>
                          <Tooltip title="Xem chi tiết">
                            <Button type="primary" size="small" icon={<EyeOutlined />} onClick={() => handleViewSl(record._id)} />
                          </Tooltip>
                          <Popconfirm title="Xóa list này?" onConfirm={() => handleDeleteSl(record._id)} okText="Xóa" cancelText="Hủy">
                            <Tooltip title="Xóa">
                              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                            </Tooltip>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
                </>
              ),
            },
          ]}
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
                <Button type="primary" icon={<PlusOutlined />} style={{ background: '#1890ff', borderColor: '#1890ff' }} onClick={() => {
                  setEditingItem(null)
                  itemForm.resetFields()
                  setItemModalOpen(true)
                }}>
                  Thêm container
                </Button>
                <Popover
                  trigger="click"
                  title="Chọn cột xuất"
                  content={
                    <Space direction="vertical" style={{ minWidth: 160 }}>
                      {Object.entries(exportFieldLabels).map(([key, label]) => (
                        <Checkbox
                          key={key}
                          checked={selectedExportFields[key]}
                          onChange={e => setSelectedExportFields(p => ({ ...p, [key]: e.target.checked }))}
                        >
                          {label}
                        </Checkbox>
                      ))}
                    </Space>
                  }
                >
                  <Button icon={<FilterOutlined />}>Chọn cột</Button>
                </Popover>
                <Button type="primary" icon={<ExportOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={exportLockExcel}>
                  Xuất Excel
                </Button>
                <Button icon={<CopyOutlined />} onClick={() => copyItemsToClipboard(currentLock.items)}>
                  Copy
                </Button>
                <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={async (file) => {
                  try {
                    const items = await parseExcelFile(file)
                    const itemsWithStatus = await fetchContainerStatus(items)
                    setPreviewItems(itemsWithStatus)
                    setPreviewSource({ type: 'detail', lockId: currentLock._id })
                    setPreviewOpen(true)
                  } catch (err) {
                    message.error(err.message || 'Lỗi đọc file')
                  }
                  return false
                }}>
                  <Button type="primary" icon={<UploadOutlined />} style={{ background: '#fa8c16', borderColor: '#fa8c16' }}>Tải Excel</Button>
                </Upload>
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
                <Input placeholder="Phân Loại" value={addLocation} onChange={e => setAddLocation(e.target.value.toUpperCase())} />
              </Col>
              <Col span={4}>
                <Input placeholder="Ghi chú" value={addRemark} onChange={e => setAddRemark(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAddItem()} />
              </Col>
              <Col span={3}>
                <Input placeholder="Bay" value={addBay} onChange={e => setAddBay(e.target.value.toUpperCase())} />
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
            <AutoComplete placeholder="Chọn hoặc nhập hãng tàu"
              options={[
                { value: 'MSC' },
                { value: 'MAERSK' },
                { value: 'CMA CGM' },
                { value: 'COSCO' },
                { value: 'HAPAG-LLOYD' },
                { value: 'ONE' },
                { value: 'EVERGREEN' },
                { value: 'YANG MING' },
                { value: 'ZIM' },
                { value: 'WAN HAI' },
                { value: 'Other' },
              ]}
              filterOption={(input, option) => option.value.toUpperCase().includes(input.toUpperCase())}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="size" label="Size" rules={[{ required: true, message: 'Nhập size' }]}>
                <Input placeholder="VD: 40HC" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Phân Loại">
                <Input placeholder="VD: Hư hỏng nặng / Nhẹ / ..." onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="remark" label="Ghi chú">
                <Input placeholder="Ghi chú" onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bay" label="Bay">
                <Input placeholder="VD: A01" onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={`Xem trước dữ liệu từ Excel (${previewItems.length} container)`}
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setPreviewItems([]); setPreviewSource(null); setPreviewFilter('all') }}
        footer={
          <Space>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleSavePreview} loading={submitting} style={{ background: '#52c41a', borderColor: '#52c41a' }}>
              Lưu dữ liệu
            </Button>
            <Popover
              trigger="click"
              title="Chọn cột xuất"
              content={
                <Space direction="vertical" style={{ minWidth: 160 }}>
                  {Object.entries(exportFieldLabels).map(([key, label]) => (
                    <Checkbox
                      key={key}
                      checked={selectedExportFields[key]}
                      onChange={e => setSelectedExportFields(p => ({ ...p, [key]: e.target.checked }))}
                    >
                      {label}
                    </Checkbox>
                  ))}
                </Space>
              }
            >
              <Button icon={<FilterOutlined />}>Chọn cột</Button>
            </Popover>
            <Button icon={<ExportOutlined />} onClick={exportPreviewExcel}>
              Xuất Excel
            </Button>
            <Button icon={<CopyOutlined />} onClick={() => copyItemsToClipboard(previewItems)}>
              Copy
            </Button>
            <Button onClick={() => { setPreviewOpen(false); setPreviewItems([]); setPreviewSource(null) }}>
              Hủy
            </Button>
          </Space>
        }
        width={1100}
      >
        {previewItems.length > 0 && (() => {
          const countDsc = previewItems.filter(i => i.dsc || i.choHtxnDvs || i.sc).length
          const countVs = previewItems.filter(i => i.vsDvs).length
          const countBoth = previewItems.filter(i => (i.dsc || i.choHtxnDvs || i.sc) && i.vsDvs).length
          const countXuli = previewItems.filter(i => i.xuLiLai).length
          const filtered = previewItems.filter(i => {
            if (previewFilter === 'dsc') return i.dsc || i.choHtxnDvs || i.sc
            if (previewFilter === 'vs') return i.vsDvs
            if (previewFilter === 'both') return (i.dsc || i.choHtxnDvs || i.sc) && i.vsDvs
            if (previewFilter === 'xuli') return i.xuLiLai
            return true
          })
          return (
          <>
            <div className="mb-3 flex flex-wrap gap-2 items-center">
              <Tag color="blue" className="font-semibold">{previewItems.length} container</Tag>
              {[...new Set(previewItems.map(i => i.shippingLine).filter(Boolean))].map(line => (
                <Tag key={line} color="geekblue">{line}</Tag>
              ))}
              {[...new Set(previewItems.map(i => i.size).filter(Boolean))].map(s => (
                <Tag key={s} color="purple">Size {s}</Tag>
              ))}
              <Tag className="cursor-pointer" color={previewFilter === 'all' ? 'cyan' : 'default'} onClick={() => setPreviewFilter('all')}>Tất cả ({previewItems.length})</Tag>
              <Tag className="cursor-pointer" color={previewFilter === 'dsc' ? 'green' : 'default'} onClick={() => setPreviewFilter('dsc')}>Đã sửa chữa ({countDsc})</Tag>
              <Tag className="cursor-pointer" color={previewFilter === 'vs' ? 'blue' : 'default'} onClick={() => setPreviewFilter('vs')}>Vệ sinh ({countVs})</Tag>
              <Tag className="cursor-pointer" color={previewFilter === 'xuli' ? 'red' : 'default'} onClick={() => setPreviewFilter('xuli')}>Xử lý lại ({countXuli})</Tag>
              <Tag className="cursor-pointer" color={previewFilter === 'both' ? 'purple' : 'default'} onClick={() => setPreviewFilter('both')}>Cả hai ({countBoth})</Tag>
            </div>
            <Table
              columns={previewColumns}
              dataSource={filtered}
              rowKey="_tempId"
              scroll={{ x: 900 }}
              pagination={{ pageSize: 20, showTotal: t => `${t} container` }}
              size="small"
            />
          </>
        )
        })()}
      </Modal>

      <Modal
        title="Sửa container"
        open={previewEditOpen}
        onOk={handlePreviewEdit}
        onCancel={() => { setPreviewEditOpen(false); setPreviewEditIndex(-1) }}
        okText="Cập nhật"
        cancelText="Hủy"
        width={600}
      >
        <Form form={previewForm} layout="vertical">
          <Form.Item name="containerNo" label="Container No" rules={[{ required: true, message: 'Nhập số container' }]}>
            <Input placeholder="VD: TEMU5750298" />
          </Form.Item>
          <Form.Item name="shippingLine" label="Hãng tàu" rules={[{ required: true, message: 'Chọn hãng tàu' }]}>
            <AutoComplete placeholder="Chọn hoặc nhập hãng tàu"
              options={[
                { value: 'MSC' },
                { value: 'MAERSK' },
                { value: 'CMA CGM' },
                { value: 'COSCO' },
                { value: 'HAPAG-LLOYD' },
                { value: 'ONE' },
                { value: 'EVERGREEN' },
                { value: 'YANG MING' },
                { value: 'ZIM' },
                { value: 'WAN HAI' },
                { value: 'Other' },
              ]}
              filterOption={(input, option) => option.value.toUpperCase().includes(input.toUpperCase())}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="size" label="Size" rules={[{ required: true, message: 'Nhập size' }]}>
                <Input placeholder="VD: 40HC" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="location" label="Phân Loại">
                <Input placeholder="VD: Hư hỏng nặng / Nhẹ / ..." onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="remark" label="Ghi chú">
                <Input placeholder="Ghi chú" onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bay" label="Bay">
                <Input placeholder="VD: A01" onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Tạo list tàu mới"
        open={createSlOpen}
        onCancel={() => { setCreateSlOpen(false); setCreateSlName(''); setCreateSlShippingLine(''); setCreateSlItems([]); setCreateSlFilter('all') }}
        footer={
          <Space>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleCreateSl} disabled={!createSlItems.length}>
              Lưu list
            </Button>
            <Button onClick={() => { setCreateSlOpen(false); setCreateSlName(''); setCreateSlShippingLine(''); setCreateSlItems([]) }}>
              Hủy
            </Button>
          </Space>
        }
        width={800}
      >
        <Row gutter={12} className="mb-3">
          <Col span={12}>
            <Input placeholder="Tên list (VD: Tàu MSC DITTA)" value={createSlName} onChange={e => setCreateSlName(e.target.value)} />
          </Col>
          <Col span={6}>
            <Input placeholder="Hãng tàu (không bắt buộc)" value={createSlShippingLine} onChange={e => setCreateSlShippingLine(e.target.value)} />
          </Col>
          <Col span={6}>
            <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={async (file) => {
              try {
                const items = await parseExcelFile(file)
                const itemsWithStatus = await fetchContainerStatus(items)
                setCreateSlItems(itemsWithStatus)
              } catch (err) {
                message.error(err.message || 'Lỗi đọc file')
              }
              return false
            }}>
              <Button icon={<UploadOutlined />} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>Tải Excel</Button>
            </Upload>
          </Col>
        </Row>
        {createSlItems.length > 0 && (() => {
          const countDsc = createSlItems.filter(i => i.dsc || i.choHtxnDvs || i.sc).length
          const countVs = createSlItems.filter(i => i.vsDvs).length
          const countBoth = createSlItems.filter(i => (i.dsc || i.choHtxnDvs || i.sc) && i.vsDvs).length
          const countXuli = createSlItems.filter(i => i.xuLiLai).length
          const filtered = createSlItems.filter(i => {
            if (createSlFilter === 'dsc') return i.dsc || i.choHtxnDvs || i.sc
            if (createSlFilter === 'vs') return i.vsDvs
            if (createSlFilter === 'both') return (i.dsc || i.choHtxnDvs || i.sc) && i.vsDvs
            if (createSlFilter === 'xuli') return i.xuLiLai
            return true
          })
          return (
          <>
            <div className="mb-2 flex flex-wrap gap-2 items-center">
              <Tag className="cursor-pointer" color={createSlFilter === 'all' ? 'cyan' : 'default'} onClick={() => setCreateSlFilter('all')}>Tất cả ({createSlItems.length})</Tag>
              <Tag className="cursor-pointer" color={createSlFilter === 'dsc' ? 'green' : 'default'} onClick={() => setCreateSlFilter('dsc')}>Đã sửa chữa ({countDsc})</Tag>
              <Tag className="cursor-pointer" color={createSlFilter === 'vs' ? 'blue' : 'default'} onClick={() => setCreateSlFilter('vs')}>Vệ sinh ({countVs})</Tag>
              <Tag className="cursor-pointer" color={createSlFilter === 'xuli' ? 'red' : 'default'} onClick={() => setCreateSlFilter('xuli')}>Xử lý lại ({countXuli})</Tag>
              <Tag className="cursor-pointer" color={createSlFilter === 'both' ? 'purple' : 'default'} onClick={() => setCreateSlFilter('both')}>Cả hai ({countBoth})</Tag>
            </div>
            <Table
              rowKey="_tempId"
              dataSource={filtered}
              size="small"
              scroll={{ x: 700 }}
              pagination={{ pageSize: 15, showTotal: t => `${t} container` }}
              columns={[
                { title: 'STT', key: 'stt', width: 50, render: (_, __, i) => i + 1 },
                { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', width: 160 },
                { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 130 },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 70 },
                {
                  title: 'List tàu', key: 'shippingLists', width: 180,
                  render: (_, r) => {
                    const lists = shippingLists.filter(sl => sl.items?.some(i => i.containerNo === r.containerNo))
                    return lists.length ? lists.map(l => <Tag key={l._id} color="geekblue" style={{ marginBottom: 2 }}>{l.name}</Tag>) : <span className="text-gray-400">--</span>
                  },
                },
                {
                  title: 'DA SUA CHUA', key: 'dscGroup', width: 150,
                  render: (_, r) => renderMultiTag(r.dsc || r.choHtxnDvs || r.sc, 'green'),
                },
                { title: 'XU LI LAI', dataIndex: 'xuLiLai', key: 'xuLiLai', width: 100, render: v => renderMultiTag(v, 'red') },
                { title: 'DA VE SINH', dataIndex: 'vsDvs', key: 'vsDvs', width: 100, render: v => renderMultiTag(v, 'blue') },
                {
                  title: '', key: 'action', width: 50,
                  render: (_, __, index) => (
                    <Popconfirm title="Xóa?" onConfirm={() => {
                      setCreateSlItems(prev => prev.filter((_, i) => i !== index))
                    }} okText="Xóa" cancelText="Hủy">
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </>
        )
      })()}
      </Modal>

      <Modal
        title={detailSl ? `DS Tàu: ${detailSl.name}` : ''}
        open={detailSlOpen}
        onCancel={() => { setDetailSlOpen(false); setDetailSl(null); setSlFilter('all'); setSlSearchText(''); setSlSelectedRowKeys([]); setSlDetailDateRange(null) }}
        footer={null}
        width={1000}
      >
          {detailSl && (() => {
            const items = detailSl.items || []
            const countDsc = items.filter(i => i.dsc || i.choHtxnDvs || i.sc).length
            const countVs = items.filter(i => i.vsDvs).length
            const countBoth = items.filter(i => (i.dsc || i.choHtxnDvs || i.sc) && i.vsDvs).length
            const countXuli = items.filter(i => i.xuLiLai).length
            const searched = slSearchText
              ? items.filter(i => i.containerNo.toLowerCase().includes(slSearchText.toLowerCase()))
              : items
            const dateFiltered = slDetailDateRange && slDetailDateRange[0] && slDetailDateRange[1]
              ? searched.filter(i => {
                  const from = slDetailDateRange[0].startOf('day')
                  const to = slDetailDateRange[1].endOf('day')
                  return dateInRange(i.dsc || i.choHtxnDvs || i.sc, from, to)
                    || dateInRange(i.vsDvs, from, to)
                    || dateInRange(i.xuLiLai, from, to)
                })
              : searched
            const filtered = dateFiltered.filter(i => {
              if (slFilter === 'dsc') return i.dsc || i.choHtxnDvs || i.sc
              if (slFilter === 'vs') return i.vsDvs
              if (slFilter === 'both') return (i.dsc || i.choHtxnDvs || i.sc) && i.vsDvs
              if (slFilter === 'xuli') return i.xuLiLai
              return true
            })
            const rowSelection = {
              selectedRowKeys: slSelectedRowKeys,
              onChange: setSlSelectedRowKeys,
            }
            return (
              <>
                <div className="mb-3 flex flex-wrap gap-2 items-center">
                  {detailSl.shippingLine && <Tag color="geekblue">{detailSl.shippingLine}</Tag>}
                  <Tag className="cursor-pointer" color={slFilter === 'all' ? 'cyan' : 'default'} onClick={() => setSlFilter('all')}>Tất cả ({items.length})</Tag>
                  <Tag className="cursor-pointer" color={slFilter === 'dsc' ? 'green' : 'default'} onClick={() => setSlFilter('dsc')}>Đã sửa chữa ({countDsc})</Tag>
                  <Tag className="cursor-pointer" color={slFilter === 'vs' ? 'blue' : 'default'} onClick={() => setSlFilter('vs')}>Vệ sinh ({countVs})</Tag>
                  <Tag className="cursor-pointer" color={slFilter === 'xuli' ? 'red' : 'default'} onClick={() => setSlFilter('xuli')}>Xử lý lại ({countXuli})</Tag>
                  <Tag className="cursor-pointer" color={slFilter === 'both' ? 'purple' : 'default'} onClick={() => setSlFilter('both')}>Cả hai ({countBoth})</Tag>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 items-center justify-between">
                  <Space wrap>
                    <DatePicker.RangePicker
                      value={slDetailDateRange}
                      onChange={dates => setSlDetailDateRange(dates)}
                      format="DD/MM/YYYY"
                      placeholder={['Từ ngày', 'Đến ngày']}
                      allowClear
                      onClear={() => setSlDetailDateRange(null)}
                      size="small"
                    />
                    <Input.Search
                      placeholder="Tìm số container..."
                      value={slSearchText}
                      onChange={e => setSlSearchText(e.target.value)}
                      onSearch={v => setSlSearchText(v)}
                      allowClear
                      onClear={() => setSlSearchText('')}
                      style={{ width: 200 }}
                    />
                  </Space>
                  <Space>
                    <Popover
                      trigger="click"
                      title="Chọn cột xuất"
                      content={
                        <Space direction="vertical" style={{ minWidth: 160 }}>
                          {Object.entries(exportFieldLabels).map(([key, label]) => (
                            <Checkbox
                              key={key}
                              checked={selectedExportFields[key]}
                              onChange={e => setSelectedExportFields(p => ({ ...p, [key]: e.target.checked }))}
                            >
                              {label}
                            </Checkbox>
                          ))}
                        </Space>
                      }
                    >
                      <Button icon={<FilterOutlined />}>Chọn cột</Button>
                    </Popover>
                    <Button icon={<ExportOutlined />} onClick={() => exportSlExcel(
                      slSelectedRowKeys.length ? items.filter(i => slSelectedRowKeys.includes(i._id)) : filtered,
                      detailSl.name
                    )} disabled={!filtered.length}>
                      {slSelectedRowKeys.length ? `Xuất ${slSelectedRowKeys.length} cont` : 'Xuất Excel'}
                    </Button>
                  </Space>
                </div>
                <Table
                  rowKey="_id"
                  dataSource={filtered}
                  loading={detailSlLoading}
                  size="small"
                  scroll={{ x: 800 }}
                  pagination={{ pageSize: 20, showTotal: t => `${t} container` }}
                  rowSelection={rowSelection}
                  columns={[
                    { title: 'STT', key: 'stt', width: 50, render: (_, __, i) => i + 1 },
                    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', width: 160 },
                    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 140 },
                    { title: 'Size', dataIndex: 'size', key: 'size', width: 70 },
                    {
                      title: 'DA SUA CHUA', key: 'dscGroup', width: 150,
                      render: (_, r) => renderMultiTag(r.dsc || r.choHtxnDvs || r.sc, 'green'),
                    },
                    { title: 'XU LI LAI', dataIndex: 'xuLiLai', key: 'xuLiLai', width: 100, render: v => renderMultiTag(v, 'red') },
                    { title: 'DA VE SINH', dataIndex: 'vsDvs', key: 'vsDvs', width: 100, render: v => renderMultiTag(v, 'blue') },
                    {
                      title: '', key: 'action', width: 50,
                      render: (_, record) => (
                        <Popconfirm title="Xóa container này?" onConfirm={() => handleDeleteSlItem(detailSl._id, record._id)} okText="Xóa" cancelText="Hủy">
                          <Tooltip title="Xóa"><Button type="text" danger size="small" icon={<DeleteOutlined />} /></Tooltip>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </>
            )
          })()}
      </Modal>
    </div>
  )
}

export default LockProduction
