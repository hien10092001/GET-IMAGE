import { useState, useEffect, useRef } from 'react'
import { Table, Button, Input, Select, Space, Tag, Modal, Form, Row, Col, Card, Divider, Popconfirm, message, Tooltip, Upload, DatePicker, Radio, Checkbox, AutoComplete } from 'antd'
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeOutlined, UploadOutlined, LockOutlined, CopyOutlined, FolderOpenOutlined } from '@ant-design/icons'
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
  const [searchText, setSearchText] = useState('')
  const searchTimerRef = useRef(null)
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
  const [addFolderIn, setAddFolderIn] = useState('')
  const [addFolderSC, setAddFolderSC] = useState('')
  const [addHinhIn, setAddHinhIn] = useState(false)
  const [addHinhSC, setAddHinhSC] = useState(false)
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [lockDate, setLockDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [lockShift, setLockShift] = useState('sáng')
  const [frequencies, setFrequencies] = useState({})
  const [locationHistory, setLocationHistory] = useState({})
  const [locationOptions, setLocationOptions] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewRowColors, setPreviewRowColors] = useState([])
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [form] = Form.useForm()
  const searchRef = useRef(null)
  const addNoRef = useRef(null)
  const folderInHandlesRef = useRef([])
  const folderSCHandlesRef = useRef([])

  useEffect(() => {
    localStorage.setItem('containerRef', JSON.stringify(referenceData))
  }, [referenceData])

  useEffect(() => {
    return () => clearTimeout(searchTimerRef.current)
  }, [])

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
    Promise.all([
      api.get('/containers/frequencies'),
      api.get('/locks/frequencies'),
    ]).then(([contRes, lockRes]) => {
      const combined = {}
      Object.entries(contRes.data).forEach(([k, v]) => { combined[k] = (combined[k] || 0) + v })
      Object.entries(lockRes.data).forEach(([k, v]) => { combined[k] = (combined[k] || 0) + v })
      setFrequencies(combined)
    }).catch(() => {})
  }

  const fetchLocationHistory = () => {
    api.get('/containers/locations').then(res => setLocationHistory(res.data)).catch(() => {})
  }

  useEffect(() => {
    fetchData()
    fetchFrequencies()
    fetchLocationHistory()
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
        folderIn: addFolderIn.split('; ')[0] || '',
        folderSC: addFolderSC.split('; ')[0] || '',
        folderSC2: addFolderSC.split('; ')[1] || '',
        hinhIn: addHinhIn,
        hinhSC: addHinhSC,
      }
      const res = await api.post('/containers', payload)
      message.success('Đã thêm container')
      setAddContainerNo('')
      setAddShippingLine('')
      setAddSize('')
      setAddBay('')
      setAddLocation('')
      setAddRemark('')
      setAddHinhIn(false)
      setAddHinhSC(false)
      addNoRef.current?.focus()
      const lastPage = Math.ceil((total + 1) / pageSize)
      setPage(lastPage)
      fetchData(lastPage)
      fetchFrequencies()
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
      fetchFrequencies()
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
      fetchFrequencies()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa')
    }
  }

  const handleDeleteAll = async () => {
    try {
      const res = await api.delete('/containers/all')
      message.success(res.data.message)
      setData([])
      setTotal(0)
      setPage(1)
      fetchFrequencies()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa tất cả')
    }
  }

  const checkFolderForContainer = async (handle, containerNo) => {
    if (!handle || !containerNo) return false
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'directory' && entry.name.includes(containerNo)) return true
      }
    } catch {}
    return false
  }

  const autoCheckHinh = async (containerNo) => {
    const inResults = await Promise.all(folderInHandlesRef.current.map(h => checkFolderForContainer(h, containerNo)))
    const scResults = await Promise.all(folderSCHandlesRef.current.map(h => checkFolderForContainer(h, containerNo)))
    setAddHinhIn(inResults.some(Boolean))
    setAddHinhSC(scResults.some(Boolean))
  }

  const handlePickFolderIn = async () => {
    try {
      if (!window.showDirectoryPicker) return
      const dirHandle = await window.showDirectoryPicker()
      folderInHandlesRef.current = [...folderInHandlesRef.current, dirHandle]
      setAddFolderIn(prev => prev ? prev + '; ' + dirHandle.name : dirHandle.name)
      if (addContainerNo) autoCheckHinh(addContainerNo)
      if (data.length) scanFolders()
    } catch (err) {
      if (err.name !== 'AbortError') message.error('Không thể chọn folder')
    }
  }

  const handlePickFolderSC = async () => {
    try {
      if (!window.showDirectoryPicker) return
      const dirHandle = await window.showDirectoryPicker()
      folderSCHandlesRef.current = [...folderSCHandlesRef.current, dirHandle]
      setAddFolderSC(prev => prev ? prev + '; ' + dirHandle.name : dirHandle.name)
      if (addContainerNo) autoCheckHinh(addContainerNo)
      if (data.length) scanFolders()
    } catch (err) {
      if (err.name !== 'AbortError') message.error('Không thể chọn folder')
    }
  }

  const scanFolders = async () => {
    if (!folderInHandlesRef.current.length && !folderSCHandlesRef.current.length) {
      message.warning('Chưa chọn folder để quét')
      return
    }
    const hide = message.loading('Đang quét folder...', 0)
    let updated = 0
    for (const item of data) {
      const inMatch = folderInHandlesRef.current.length ? (await Promise.all(folderInHandlesRef.current.map(h => checkFolderForContainer(h, item.containerNo)))).some(Boolean) : false
      const scMatch = folderSCHandlesRef.current.length ? (await Promise.all(folderSCHandlesRef.current.map(h => checkFolderForContainer(h, item.containerNo)))).some(Boolean) : false
      const updates = {}
      if (inMatch !== !!item.hinhIn) updates.hinhIn = inMatch
      if (scMatch !== !!item.hinhSC) updates.hinhSC = scMatch
      if (Object.keys(updates).length) {
        try {
          await api.put(`/containers/${item._id}`, updates)
          updated++
        } catch {}
      }
    }
    hide()
    if (updated) fetchData()
    message.success(`Đã cập nhật ${updated} container`)
  }

  const handleToggleHinh = async (id, field, value) => {
    try {
      await api.put(`/containers/${id}`, { [field]: value })
      setData(prev => prev.map(item => item._id === id ? { ...item, [field]: value } : item))
    } catch (e) {
      message.error('Lỗi cập nhật')
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
    setLocationOptions([])
    const match = referenceData.find(r => r.containerNo === v)
    if (match) {
      if (match.shippingLine) setAddShippingLine(match.shippingLine)
      if (match.size) setAddSize(match.size)
      if (match.bay) setAddBay(match.bay)
    }
    const locs = v ? locationHistory[v] : undefined
    if (locs && locs.length === 1) {
      setAddLocation(locs[0])
    } else if (locs && locs.length > 1) {
      setAddLocation('')
      setLocationOptions(locs)
    }
    if (v) autoCheckHinh(v)
    else { setAddHinhIn(false); setAddHinhSC(false) }
  }

  const exportExcel = async () => {
    setPreviewLoading(true)
    setPreviewOpen(true)
    try {
      const params = {}
      if (search) params.search = search
      if (filters.shippingLine) params.shippingLine = filters.shippingLine
      if (filters.size) params.size = filters.size
      const res = await api.get('/containers/all', { params })
      const data = res.data.map((c, i) => ({
        STT: i + 1,
        'Container No': c.containerNo,
        'Hãng tàu': c.shippingLine,
        Size: c.size,
        'Phân Loại': c.location || '',
        'Ghi chú': c.remark || '',
        Bay: String(c.bay ?? '').trim(),
        'Ngày tạo': dayjs(c.createdAt).format('DD/MM/YYYY'),
      }))
      setPreviewData(data)
      const colors = ['#f0f5ff', '#fff7e6', '#f6ffed', '#fff0f6', '#e6fffb', '#f9f0ff', '#fffbe6']
      const rowColors = []
      let colorIdx = -1
      let prevBay = null
      for (const r of data) {
        if (r.Bay !== prevBay) colorIdx++
        rowColors.push(colors[colorIdx % colors.length])
        prevBay = r.Bay
      }
      setPreviewRowColors(rowColors)
    } catch {
      message.error('Lỗi tải dữ liệu')
    } finally {
      setPreviewLoading(false)
    }
  }

  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(previewData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Containers')
    ws['!cols'] = [
      { wch: 5 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 20 },
      { wch: 30 }, { wch: 10 }, { wch: 18 },
    ]
    XLSX.writeFile(wb, `containers_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
    message.success('Đã tải Excel')
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
    { title: 'SL', key: 'count', width: 60, align: 'center', render: (_, r) => containerFreq[r.containerNo] > 1 ? <Tag color="red">{containerFreq[r.containerNo]}</Tag> : containerFreq[r.containerNo] },
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo', sorter: true },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 100, sorter: true },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 100, sorter: true },
    { title: 'Phân Loại', dataIndex: 'location', key: 'location', width: 120 },
    { title: 'Ghi chú', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true },
    { title: 'Bay', dataIndex: 'bay', key: 'bay', width: 80 },
    {
      title: 'Ngày tạo', dataIndex: 'createdAt', key: 'createdAt', width: 120, sorter: true,
      render: (v) => dayjs(v).format('DD/MM/YYYY'),
    },
    { title: 'Hình In', dataIndex: 'hinhIn', key: 'hinhIn', width: 80, align: 'center',
      render: (v, r) => <Checkbox checked={!!v} onChange={e => handleToggleHinh(r._id, 'hinhIn', e.target.checked)} />,
    },
    { title: 'Hình SC', dataIndex: 'hinhSC', key: 'hinhSC', width: 80, align: 'center',
      render: (v, r) => <Checkbox checked={!!v} onChange={e => handleToggleHinh(r._id, 'hinhSC', e.target.checked)} />,
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
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} md={6}>
            <Input
              ref={searchRef}
              placeholder="Tìm kiếm container..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => {
                const val = e.target.value
                setSearchText(val)
                clearTimeout(searchTimerRef.current)
                searchTimerRef.current = setTimeout(() => {
                  setSearch(val)
                  setPage(1)
                }, 300)
              }}
              allowClear
              onClear={() => {
                setSearchText('')
                setSearch('')
                setPage(1)
              }}
            />
          </Col>
          <Col xs={12} md={2}>
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
          <Col xs={12} md={2}>
            <Select placeholder="Size" allowClear className="w-full" value={filters.size || undefined} onChange={(v) => setFilters(p => ({ ...p, size: v || '' }))}>
              <Option value="20GP">20GP</Option>
              <Option value="40GP">40GP</Option>
              <Option value="40HC">40HC</Option>
              <Option value="45HC">45HC</Option>
              <Option value="20RF">20RF</Option>
              <Option value="40RF">40RF</Option>
            </Select>
          </Col>
          <Col xs={12} md={2}>
            <Button type="primary" icon={<ExportOutlined />} style={{ background: '#1890ff', borderColor: '#1890ff' }} onClick={exportExcel} block>Excel</Button>
          </Col>
          <Col xs={12} md={2}>
            <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={importExcel} className="w-full">
              <Button type="primary" icon={<UploadOutlined />} style={{ background: '#fa8c16', borderColor: '#fa8c16' }} block>Import Ton</Button>
            </Upload>
          </Col>
          <Col xs={12} md={2}>
            <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(file) => {
              const reader = new FileReader()
              reader.onload = (e) => {
                try {
                  const data = new Uint8Array(e.target.result)
                  const wb = XLSX.read(data, { type: 'array' })
                  const ws = wb.Sheets[wb.SheetNames[0]]
                  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
                  if (rows.length < 2) { message.warning('File không có dữ liệu'); return }
                  const header = rows[0].map(h => String(h).toLowerCase().trim())
                  const ci = header.findIndex(h => /cont|soc/i.test(h))
                  const si = header.findIndex(h => /hang|shipping|hãng|tàu/i.test(h))
                  const zi = header.findIndex(h => /size/i.test(h))
                  const li = header.findIndex(h => /phân|loại|location/i.test(h))
                  const bi = header.findIndex(h => /bay/i.test(h))
                  const ri = header.findIndex(h => /ghi|chú|remark/i.test(h))
                  const di = header.findIndex(h => /ngày.*tạo|ngay.*tao|date.*create|created.*(at|date)|create.*date/i.test(h))
                  if (ci === -1) { message.error('Không tìm thấy cột Container No'); return }
                  const parseDate = (v) => {
                    if (!v) return undefined
                    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString()
                    const s = String(v).trim()
                    const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
                    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).toISOString()
                    const d = new Date(s)
                    if (!isNaN(d.getTime())) return d.toISOString()
                    return undefined
                  }
                  const items = rows.slice(1).filter(r => r[ci]).map(r => ({
                    containerNo: String(r[ci]).toUpperCase().trim(),
                    shippingLine: si >= 0 && r[si] ? String(r[si]).trim() : '',
                    size: zi >= 0 && r[zi] ? String(r[zi]).toUpperCase().trim() : '',
                    location: li >= 0 && r[li] ? String(r[li]).trim() : '',
                    bay: bi >= 0 && r[bi] ? String(r[bi]).toUpperCase().trim() : '',
                    remark: ri >= 0 && r[ri] ? String(r[ri]).trim() : '',
                    createdAt: di >= 0 && r[di] ? parseDate(r[di]) : undefined,
                  })).filter(i => i.containerNo && i.shippingLine && i.size)
                  if (!items.length) { message.warning('Không có dữ liệu hợp lệ'); return }
                  Promise.all(items.map(i => api.post('/containers', i).catch(() => {}))).then(async () => {
                    message.success(`Đã thêm ${items.length} container từ Excel`)
                    const countRes = await api.get('/containers', { params: { limit: 1, sort: 'createdAt' } })
                    const lastPage = Math.ceil(countRes.data.total / pageSize)
                    setPage(lastPage)
                    fetchData(lastPage)
                    fetchFrequencies()
                  })
                } catch (err) { message.error('Lỗi đọc file: ' + err.message) }
              }
              reader.readAsArrayBuffer(file)
              return false
            }} className="w-full">
              <Button type="primary" icon={<UploadOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} block>Import Data</Button>
            </Upload>
          </Col>
          <Col xs={12} md={2}>
            <Button
              type="primary"
              icon={<LockOutlined />}
              onClick={() => setLockModalOpen(true)}
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', fontWeight: 600, boxShadow: '0 2px 8px rgba(102,126,234,0.4)' }}
              block
            >
              Tạo sản lượng
            </Button>
          </Col>
          <Col xs={12} md={2}>
            <Button icon={<SearchOutlined />} onClick={scanFolders} block>Quét folder</Button>
          </Col>
          <Col xs={12} md={2}>
            <Popconfirm title="Xóa tất cả dữ liệu?" description="Hành động này không thể hoàn tác!" onConfirm={handleDeleteAll} okText="Xóa hết" cancelText="Hủy" okButtonProps={{ danger: true }}>
              <Button danger icon={<DeleteOutlined />} block>Xóa hết</Button>
            </Popconfirm>
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
            <AutoComplete placeholder="Phân Loại" value={addLocation} options={locationOptions.map(o => ({ value: o }))} onChange={setAddLocation} onSelect={v => setAddLocation(v)} />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="Ghi chú" value={addRemark} onChange={e => setAddRemark(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </Col>
          <Col xs={8} sm={6} md={2}>
            <Input placeholder="Bay" value={addBay} onChange={e => setAddBay(e.target.value.toUpperCase())} />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="Folder Hình In" value={addFolderIn} readOnly
              addonAfter={<Button size="small" type="text" icon={<FolderOpenOutlined />} onClick={handlePickFolderIn} />}
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Input placeholder="Folder Hình SC" value={addFolderSC} readOnly
              addonAfter={<Button size="small" type="text" icon={<FolderOpenOutlined />} onClick={handlePickFolderSC} />}
            />
          </Col>
          <Col xs={12} sm={8} md={1}>
            {addHinhIn && <Tag color="green">In</Tag>}
            {addHinhSC && <Tag color="blue">SC</Tag>}
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
          loading={{ spinning: loading, delay: 300 }}
          scroll={{ x: 1400 }}
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
                <Input placeholder="VD: Hư hỏng nặng / Nhẹ / ..." onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="bay" label="Bay">
                <Input placeholder="VD: A01" onInput={e => e.target.value = e.target.value.toUpperCase()} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="Ghi chú">
            <Input.TextArea rows={2} onInput={e => e.target.value = e.target.value.toUpperCase()} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="folderIn" label="Folder Hình In">
                <Input placeholder="Chọn folder In..." readOnly
                  addonAfter={
                    <Button size="small" type="text" icon={<FolderOpenOutlined />}
                      onClick={async () => {
                        try {
                          const dir = await window.showDirectoryPicker()
                          form.setFieldValue('folderIn', dir.name)
                        } catch {}
                      }}
                    />
                  }
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="folderSC" label="Folder Hình SC">
                <Input placeholder="Chọn folder SC..." readOnly
                  addonAfter={
                    <Button size="small" type="text" icon={<FolderOpenOutlined />}
                      onClick={async () => {
                        try {
                          const dir = await window.showDirectoryPicker()
                          form.setFieldValue('folderSC', dir.name)
                        } catch {}
                      }}
                    />
                  }
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="folderSC2" label="Folder Hình SC 2">
                <Input placeholder="Chọn folder SC 2..." readOnly
                  addonAfter={
                    <Button size="small" type="text" icon={<FolderOpenOutlined />}
                      onClick={async () => {
                        try {
                          const dir = await window.showDirectoryPicker()
                          form.setFieldValue('folderSC2', dir.name)
                        } catch {}
                      }}
                    />
                  }
                />
              </Form.Item>
            </Col>
          </Row>
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
            <Row><Col span={8}><strong>Folder In:</strong></Col><Col span={16}>{viewItem.folderIn || '-'}</Col></Row>
            <Row><Col span={8}><strong>Folder SC:</strong></Col><Col span={16}>{viewItem.folderSC || '-'}{viewItem.folderSC2 ? '; ' + viewItem.folderSC2 : ''}</Col></Row>
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

      <Modal
        title="Xem trước dữ liệu"
        open={previewOpen}
        onCancel={() => { setPreviewOpen(false); setSelectedRowKeys([]) }}
        footer={<Space>
          <Button icon={<CopyOutlined />} onClick={() => {
            const rows = selectedRowKeys.length ? previewData.filter(r => selectedRowKeys.includes(r.STT)) : previewData
            const fields = ['Container No', 'Hãng tàu', 'Size', 'Phân Loại', 'Ghi chú']
            const tsv = rows.map(r => fields.map(h => String(r[h] ?? '')).join('\t')).join('\n')
            navigator.clipboard.writeText(tsv)
            message.success(`Đã copy ${rows.length} dòng`)
          }}>Copy {selectedRowKeys.length ? `(${selectedRowKeys.length})` : '(tất cả)'}</Button>
          <Button type="primary" icon={<ExportOutlined />} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={downloadExcel}>Tải Excel</Button>
        </Space>}
        width={1000}
      >
        <Table
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={[
            { title: 'STT', key: 'stt', width: 50, render: (_, __, i) => i + 1 },
            { title: 'Container No', dataIndex: 'Container No', key: 'Container No' },
            { title: 'Hãng tàu', dataIndex: 'Hãng tàu', key: 'Hãng tàu' },
            { title: 'Size', dataIndex: 'Size', key: 'Size' },
            { title: 'Phân Loại', dataIndex: 'Phân Loại', key: 'Phân Loại', width: 120 },
            { title: 'Ghi chú', dataIndex: 'Ghi chú', key: 'Ghi chú', width: 150, ellipsis: true },
            { title: 'Bay', dataIndex: 'Bay', key: 'Bay', width: 80 },
            { title: 'Ngày tạo', dataIndex: 'Ngày tạo', key: 'Ngày tạo', width: 100 },
          ]}
          dataSource={previewData}
          rowKey="STT"
          loading={previewLoading}
          scroll={{ x: 900 }}
          pagination={{ pageSize: 50, showTotal: t => `Tổng ${t} container` }}
          size="small"
          onRow={(record) => ({
            style: { backgroundColor: previewRowColors[record.STT - 1] },
          })}
        />
      </Modal>
    </div>
  )
}

export default ContainerManagement