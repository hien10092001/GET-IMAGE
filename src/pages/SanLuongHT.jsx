import { useEffect, useMemo, useState } from 'react'
import { Table, Button, Input, Space, Tag, Modal, Form, Row, Col, Card, Upload, Popconfirm, message, Tooltip, Alert, DatePicker, Select, Tabs, Switch, Checkbox } from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined,
  UploadOutlined, SearchOutlined, FileExcelOutlined, SaveOutlined, CopyOutlined,
  TranslationOutlined, CalendarOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../services/api'
import { aggregateEstResults, convertEstFile, loadEstSettings } from '../services/estConvert'

const XLSX = window.XLSX

const EST_REMARK_OPTIONS = ['SC PAP', 'VS PAP', 'VS PAD', 'SC PAD']
const DEFAULT_EST_REMARK = 'VS PAD'

const estRowLines = (row) => {
  const subs = row?.subs?.length ? row.subs : [{ it: row?.it, line: row?.line }]
  const kept = []
  const dropped = []
  subs.forEach((s, i) => {
    const line = String(s?.line ?? '').trim()
    if (!line) return
    if (row?.itChecks?.[i] === false) dropped.push(line)
    else kept.push(line)
  })
  return { kept, dropped }
}

const estRowLineText = (row) => {
  const { kept, dropped } = estRowLines(row)
  const main = kept.join(' | ')
  if (!dropped.length) return main
  return `${main ? `${main} | ` : ''}KO APP:(${dropped.join(' | ')})`
}

const renderChiTietSc = (v) => {
  const s = String(v ?? '')
  const idx = s.indexOf('KO APP:(')
  if (idx < 0) return s
  return (
    <>
      {s.slice(0, idx)}
      <span style={{ color: 'red', fontWeight: 'bold' }}>{s.slice(idx)}</span>
    </>
  )
}

const BULK_DATE_FIELDS = [
  { key: 'nApr', label: 'N - APR' },
  { key: 'nComplete', label: 'N - COMPLETE' },
  { key: 'nSc', label: 'N - SC' },
]

const EXPORT_COLUMNS = [
  { key: 'containerNo', title: 'CONT', file: 'CONT' },
  { key: 'nBg', title: 'N - BG', file: 'N -BG' },
  { key: 'nApr', title: 'N - APR', file: 'N - APR' },
  { key: 'sztp', title: 'SZTP', file: 'SZTP' },
  { key: 'nComplete', title: 'N - COMPLETE', file: 'N - COMPLETE' },
  { key: 'nSc', title: 'N - SC', file: 'N - SC' },
  { key: 'remark', title: 'REMARK', file: 'REMARK' },
  { key: 'chiTietSc', title: 'CHI TIẾT SC', file: 'CHI TIẾT SC' },
]

const pad = (n) => String(n).padStart(2, '0')

const formatDateValue = (v) => {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) {
    return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return `${pad(d.d)}/${pad(d.m)}/${d.y}`
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = dayjs(s)
    if (d.isValid()) return d.format('DD/MM/YYYY')
  }
  return s
}

const toDayjsValue = (v) => {
  if (v === null || v === undefined || v === '') return null
  if (dayjs.isDayjs(v)) return v
  if (v instanceof Date) return dayjs(v)
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return dayjs(new Date(d.y, d.m - 1, d.d))
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    return dayjs(new Date(y, Number(m[2]) - 1, Number(m[1])))
  }
  const d = dayjs(s)
  return d.isValid() ? d : null
}

const dateValueToText = (v) => {
  if (dayjs.isDayjs(v)) return v.format('DD/MM/YYYY')
  return String(v ?? '').trim()
}

const parseRows = (aoa) => {
  const headerIdx = aoa.findIndex(r =>
    r.some(c => String(c ?? '').replace(/\s+/g, '').toUpperCase() === 'CONT')
  )
  if (headerIdx < 0) throw new Error('Không tìm thấy cột CONT trong file')

  const header = aoa[headerIdx].map(h => String(h ?? '').replace(/\s+/g, '').toUpperCase())
  const findCol = (name) => header.findIndex(h => h === name)

  const nAprCol = findCol('N-APR')
  const idx = {
    containerNo: findCol('CONT'),
    nBg: findCol('N-BG'),
    nApr: nAprCol >= 0 ? nAprCol : (header[3] === '' ? 3 : -1),
    sztp: findCol('SZTP'),
    nComplete: findCol('N-COMPLETE'),
    nSc: findCol('N-SC'),
    remark: findCol('REMARK'),
    chiTietSc: findCol('CHITIETSC'),
  }
  if (idx.containerNo < 0) throw new Error('Không tìm thấy cột CONT trong file')

  const get = (row, i) => (i >= 0 ? row[i] : '')

  return aoa.slice(headerIdx + 1)
    .filter(r => r && String(get(r, idx.containerNo) ?? '').trim() !== '')
    .map(r => ({
      containerNo: String(get(r, idx.containerNo) ?? '').trim().toUpperCase(),
      nBg: formatDateValue(get(r, idx.nBg)),
      nApr: formatDateValue(get(r, idx.nApr)),
      sztp: String(get(r, idx.sztp) ?? '').trim(),
      nComplete: formatDateValue(get(r, idx.nComplete)),
      nSc: formatDateValue(get(r, idx.nSc)),
      remark: String(get(r, idx.remark) ?? '').trim(),
      chiTietSc: String(get(r, idx.chiTietSc) ?? '').trim(),
    }))
}

const tableColumns = (onEdit, onDelete) => [
  { title: 'STT', key: 'stt', width: 60, fixed: 'left', render: (_, __, i) => i + 1 },
  { title: 'CONT', dataIndex: 'containerNo', key: 'containerNo', width: 160, fixed: 'left' },
  { title: 'N - BG', dataIndex: 'nBg', key: 'nBg', width: 110, align: 'center' },
  { title: 'N - APR', dataIndex: 'nApr', key: 'nApr', width: 110, align: 'center' },
  { title: 'SZTP', dataIndex: 'sztp', key: 'sztp', width: 90, align: 'center' },
  { title: 'N - COMPLETE', dataIndex: 'nComplete', key: 'nComplete', width: 130, align: 'center' },
  { title: 'N - SC', dataIndex: 'nSc', key: 'nSc', width: 120, align: 'center' },
  { title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 100, ellipsis: true },
  { title: 'CHI TIẾT SC', dataIndex: 'chiTietSc', key: 'chiTietSc', width: 600, render: renderChiTietSc },
  {
    title: 'Hành động', key: 'action', width: 100, fixed: 'right',
    render: (_, record) => (
      <Space size={0}>
        <Tooltip title="Sửa">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
        </Tooltip>
        <Popconfirm title="Xóa dòng này?" onConfirm={() => onDelete(record._id)} okText="Xóa" cancelText="Hủy">
          <Tooltip title="Xóa">
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Tooltip>
        </Popconfirm>
      </Space>
    ),
  },
]

function SanLuongHT() {
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [completeRange, setCompleteRange] = useState(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [activeView, setActiveView] = useState('all')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkInfo, setBulkInfo] = useState({})
  const [bulkSwitches, setBulkSwitches] = useState({})
  const [estOpen, setEstOpen] = useState(false)
  const [estSearch, setEstSearch] = useState('')
  const [estRows, setEstRows] = useState([])
  const [estSelected, setEstSelected] = useState([])
  const [estSaving, setEstSaving] = useState(false)
  const [estUploading, setEstUploading] = useState(false)
  const [estFileName, setEstFileName] = useState('')
  const [estItContainer, setEstItContainer] = useState(null)
  const [estItChecks, setEstItChecks] = useState({})
  const [form] = Form.useForm()
  const [bulkForm] = Form.useForm()

  const fetchItems = () => {
    queueMicrotask(() => setLoading(true))
    return api.get('/sanluong-ht')
      .then(res => setItems(res.data || []))
      .catch(e => message.error(e.response?.data?.message || 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchItems() }, [])

  const handleUpload = async (file) => {
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
      const rows = parseRows(aoa)
      if (!rows.length) throw new Error('File không có dòng dữ liệu nào')
      const estMap = new Map(estRows.map(r => [r.container, r]))
      let matched = 0
      const enriched = rows.map(r => {
        const line = estRowLineText(estMap.get(r.containerNo))
        if (line) matched++
        return { ...r, chiTietSc: line || r.chiTietSc || '' }
      })
      const res = await api.post('/sanluong-ht/import', { items: enriched })
      setItems(res.data.items || [])
      setSelectedRowKeys([])
      setFileName(file.name)
      message.success(
        `Đã lưu ${res.data.imported} container từ ${file.name}` +
        (matched ? `, ${matched} dòng có chi tiết SC từ EST` : '')
      )
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Lỗi đọc file Excel')
    } finally {
      setUploading(false)
    }
    return false
  }

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    const [from, to] = completeRange || []
    return items.filter(i => {
      if (from && to) {
        const d = toDayjsValue(i.nComplete)
        if (!d || d.isBefore(from, 'day') || d.isAfter(to, 'day')) return false
      }
      if (!q) return true
      return String(i.containerNo || '').toUpperCase().includes(q) ||
        String(i.remark || '').toUpperCase().includes(q)
    })
  }, [items, search, completeRange])

  const incompleteItems = useMemo(
    () => items.filter(i => !String(i.nComplete || '').trim() && !String(i.nSc || '').trim()),
    [items]
  )

  const filteredIncomplete = useMemo(
    () => filtered.filter(i => !String(i.nComplete || '').trim() && !String(i.nSc || '').trim()),
    [filtered]
  )

  const visibleItems = activeView === 'incomplete' ? filteredIncomplete : filtered

  const selectedItems = useMemo(
    () => items.filter(i => selectedRowKeys.includes(i._id)),
    [items, selectedRowKeys]
  )

  const existingConts = useMemo(
    () => new Set(items.map(i => String(i.containerNo || '').toUpperCase())),
    [items]
  )

  const estFiltered = useMemo(() => {
    const q = estSearch.trim().toUpperCase()
    if (!q) return estRows
    return estRows.filter(r =>
      String(r.container || '').includes(q) ||
      String(r.line || '').toUpperCase().includes(q)
    )
  }, [estRows, estSearch])

  const updateEstRow = (container, patch) => {
    setEstRows(prev => prev.map(r => (r.container === container ? { ...r, ...patch } : r)))
  }

  const estItRow = estRows.find(r => r.container === estItContainer)
  const estItSubs = estItRow?.subs?.length
    ? estItRow.subs
    : (estItRow ? [{ it: estItRow.it, line: estItRow.line }] : [])

  const openEstIt = (r) => {
    setEstItContainer(r.container)
    setEstItChecks(r.itChecks || {})
  }

  const applyEstIt = () => {
    if (estItContainer) updateEstRow(estItContainer, { itChecks: estItChecks })
    setEstItContainer(null)
  }

  const estColumns = [
    { title: 'CONT', dataIndex: 'container', key: 'container', width: 150, fixed: 'left' },
    { title: 'SIZE', dataIndex: 'size', key: 'size', width: 80, align: 'center' },
    {
      title: 'NGÀY VÀO', dataIndex: 'dateInYard', key: 'dateInYard', width: 150, align: 'center',
      render: (v, r) => (
        <DatePicker
          size="small"
          format="DD/MM/YYYY"
          value={toDayjsValue(v)}
          onChange={d => updateEstRow(r.container, { dateInYard: d ? d.format('DD/MM/YYYY') : '' })}
          style={{ width: '100%' }}
          allowClear
        />
      ),
    },
    {
      title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 130,
      render: (v, r) => (
        <Select
          size="small"
          value={v || DEFAULT_EST_REMARK}
          options={EST_REMARK_OPTIONS.map(x => ({ value: x, label: x }))}
          onChange={val => updateEstRow(r.container, { remark: val })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'CHI TIẾT SC', dataIndex: 'line', key: 'line', width: 420,
      render: (_, r) => {
        const { kept, dropped } = estRowLines(r)
        return (
          <div style={{ cursor: 'pointer' }} title="Bấm để chọn IT" onClick={() => openEstIt(r)}>
            <span>{kept.join(' | ')}</span>
            {dropped.length > 0 && (
              <span style={{ color: 'red', fontWeight: 'bold' }}>
                {kept.length ? ' | ' : ''}KO APP:({dropped.join(' | ')})
              </span>
            )}
            <Tag color="blue" style={{ marginLeft: 4 }}>{(r.subs?.length || 1)} IT</Tag>
          </div>
        )
      },
    },
    {
      title: 'TT', key: 'status', width: 150, align: 'center',
      render: (_, r) => (existingConts.has(r.container)
        ? (
          <Space size={4}>
            <Switch
              size="small"
              checked={r.updateExisting !== false}
              onChange={checked => updateEstRow(r.container, { updateExisting: checked })}
            />
            <span style={{ fontSize: 12 }}>
              {r.updateExisting !== false ? 'Cập nhật' : 'Thêm mới'}
            </span>
          </Space>
        )
        : <Tag color="green">Mới</Tag>),
    },
  ]

  const openEstLookup = () => {
    setEstSearch('')
    setEstSelected([])
    setEstOpen(true)
  }

  const handleEstUpload = async (file) => {
    setEstUploading(true)
    try {
      const { converted } = await convertEstFile(file, loadEstSettings())
      const rows = aggregateEstResults(converted)
        .map(r => ({ ...r, remark: DEFAULT_EST_REMARK, updateExisting: true }))
      setEstRows(rows)
      setEstSelected([])
      setEstSearch('')
      setEstFileName(file.name)
      message.success(`Đã chuyển đổi ${rows.length} container từ ${file.name}`)
    } catch (e) {
      message.error(e.message || 'Lỗi chuyển đổi file EST')
    } finally {
      setEstUploading(false)
    }
    return false
  }

  const handleAddFromEst = async () => {
    if (!estSelected.length) return
    const byCont = new Map(items.map(i => [String(i.containerNo || '').toUpperCase(), i]))
    const updates = []
    const inserts = []
    estRows
      .filter(r => estSelected.includes(r.container))
      .forEach(r => {
        const existing = byCont.get(r.container)
        const nBg = formatDateValue(r.dateInYard)
        const base = {
          containerNo: r.container,
          nBg,
          sztp: String(r.size ?? '').trim(),
          remark: r.remark || '',
          chiTietSc: estRowLineText(r),
        }
        if (existing && r.updateExisting !== false) {
          updates.push({
            ...base,
            nBg: base.nBg || existing.nBg || '',
            sztp: base.sztp || existing.sztp || '',
            remark: base.remark || existing.remark || '',
            chiTietSc: base.chiTietSc || existing.chiTietSc || '',
            nApr: existing.nApr || '',
            nComplete: existing.nComplete || '',
            nSc: existing.nSc || '',
          })
        } else {
          inserts.push(base)
        }
      })
    setEstSaving(true)
    try {
      let allItems = items
      let updated = 0
      let inserted = 0
      if (updates.length) {
        const res = await api.post('/sanluong-ht/import', { items: updates })
        allItems = res.data.items || allItems
        updated = res.data.imported || 0
      }
      if (inserts.length) {
        const res = await api.post('/sanluong-ht/insert-many', { items: inserts })
        allItems = res.data.items || allItems
        inserted = res.data.inserted || 0
      }
      setItems(allItems)
      setSelectedRowKeys([])
      setEstOpen(false)
      setEstSelected([])
      setEstRows([])
      setEstSearch('')
      setEstFileName('')
      const parts = []
      if (updated) parts.push(`cập nhật ${updated}`)
      if (inserted) parts.push(`thêm mới ${inserted}`)
      message.success(`Đã ${parts.join(', ')} container từ kết quả EST`)
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi thêm từ EST')
    } finally {
      setEstSaving(false)
    }
  }

  const openAdd = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record) => {
    setEditing(record)
    form.setFieldsValue({
      ...record,
      nBg: toDayjsValue(record.nBg),
      nApr: toDayjsValue(record.nApr),
      nComplete: toDayjsValue(record.nComplete),
      nSc: toDayjsValue(record.nSc),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        containerNo: String(values.containerNo || '').trim().toUpperCase(),
        nBg: dateValueToText(values.nBg),
        nApr: dateValueToText(values.nApr),
        sztp: String(values.sztp || '').trim(),
        nComplete: dateValueToText(values.nComplete),
        nSc: dateValueToText(values.nSc),
        remark: String(values.remark || '').trim(),
        chiTietSc: String(values.chiTietSc || '').trim(),
      }
      setSaving(true)
      if (editing) {
        const res = await api.put(`/sanluong-ht/${editing._id}`, payload)
        setItems(prev => prev.map(i => (i._id === editing._id ? res.data : i)))
        message.success('Đã cập nhật container')
      } else {
        const res = await api.post('/sanluong-ht', payload)
        setItems(prev => [...prev, res.data])
        message.success('Đã thêm container')
      }
      setModalOpen(false)
      setEditing(null)
    } catch (e) {
      if (e.response) message.error(e.response.data?.message || 'Lỗi lưu dữ liệu')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/sanluong-ht/${id}`)
      setItems(prev => prev.filter(i => i._id !== id))
      setSelectedRowKeys(prev => prev.filter(k => k !== id))
      message.success('Đã xóa')
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa')
    }
  }

  const handleDeleteMany = async () => {
    if (!selectedRowKeys.length) return
    try {
      const res = await api.post('/sanluong-ht/delete-many', { ids: selectedRowKeys })
      const removed = new Set(selectedRowKeys)
      setItems(prev => prev.filter(i => !removed.has(i._id)))
      setSelectedRowKeys([])
      message.success(`Đã xóa ${res.data.deleted} dòng`)
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa')
    }
  }

  const openBulkDates = () => {
    const rows = items.filter(i => selectedRowKeys.includes(i._id))
    const info = {}
    const switches = {}
    for (const f of BULK_DATE_FIELDS) {
      const vals = rows
        .map(r => String(formatDateValue(r[f.key]) || '').trim())
        .filter(Boolean)
      const unique = [...new Set(vals)]
      const hasData = unique.length > 0
      info[f.key] = {
        hasData,
        mixed: unique.length > 1,
        value: unique.length === 1 ? toDayjsValue(unique[0]) : null,
      }
      switches[f.key] = !hasData
    }
    setBulkInfo(info)
    setBulkSwitches(switches)
    bulkForm.resetFields()
    bulkForm.setFieldsValue(Object.fromEntries(
      BULK_DATE_FIELDS.map(f => [f.key, info[f.key].value])
    ))
    setBulkOpen(true)
  }

  const handleBulkDates = async () => {
    if (!selectedRowKeys.length) return
    const fields = BULK_DATE_FIELDS.filter(f => {
      const info = bulkInfo[f.key] || {}
      return !info.hasData || bulkSwitches[f.key]
    })
    if (!fields.length) {
      message.warning('Bật ít nhất một trường để cập nhật')
      return
    }
    try {
      const values = await bulkForm.validateFields()
      setBulkSaving(true)
      const payload = { ids: selectedRowKeys }
      fields.forEach(f => { payload[f.key] = dateValueToText(values[f.key]) })
      const res = await api.post('/sanluong-ht/update-many', payload)
      setItems(res.data.items || [])
      setSelectedRowKeys([])
      setBulkOpen(false)
      message.success(`Đã cập nhật ${res.data.updated} dòng`)
    } catch (e) {
      if (e.response) message.error(e.response.data?.message || 'Lỗi cập nhật')
    } finally {
      setBulkSaving(false)
    }
  }

  const copySelected = async () => {
    if (!selectedItems.length) return
    const header = ['STT', ...EXPORT_COLUMNS.map(c => c.title)].join('\t')
    const lines = selectedItems.map((r, i) => [
      i + 1,
      r.containerNo || '',
      r.nBg || '',
      r.nApr || '',
      r.sztp || '',
      r.nComplete || '',
      r.nSc || '',
      r.remark || '',
      r.chiTietSc || '',
    ].join('\t'))
    try {
      await navigator.clipboard.writeText([header, ...lines].join('\n'))
      message.success(`Đã copy ${selectedItems.length} dòng`)
    } catch {
      message.error('Lỗi copy')
    }
  }

  const exportExcel = () => {
    const rows = selectedItems.length > 0 ? selectedItems : items
    if (!rows.length) {
      message.warning('Chưa có dữ liệu để xuất')
      return
    }
    const header = ['STT', ...EXPORT_COLUMNS.map(c => c.file), '']
    const body = rows.map((i, idx) => [
      idx + 1,
      i.containerNo || '',
      i.nBg || '',
      i.nApr || '',
      i.sztp || '',
      i.nComplete || '',
      i.nSc || '',
      i.remark || '',
      i.chiTietSc || '',
      '',
    ])
    const aoa = [
      ['BÁO CÁO WHL 2026', '', '', '', '', '', '', '', '', ''],
      header,
      ...body,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }]
    ws['!cols'] = [
      { wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 60 }, { wch: 4 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `TONG WHL 2026 ${dayjs().format('DD.MM.YYYY')}.xlsx`)
    message.success(`Xuất Excel thành công (${rows.length} dòng)`)
  }

  const renderTable = (data, emptyText) => (
    <Table
      rowKey="_id"
      columns={tableColumns(openEdit, handleDelete)}
      dataSource={data}
      loading={loading}
      size="small"
      bordered
      scroll={{ x: 1400 }}
      rowSelection={{
        selectedRowKeys,
        onChange: setSelectedRowKeys,
        preserveSelectedRowKeys: true,
      }}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        showTotal: t => `Tổng ${t} container`,
        pageSizeOptions: [20, 50, 100, 500],
      }}
      locale={{ emptyText }}
    />
  )

  return (
    <Space direction="vertical" size="middle" className="w-full">
      <Card
        title={<Space><FileExcelOutlined style={{ color: '#08979c' }} /><span>Sản lượng HT</span></Space>}
        extra={fileName ? <Tag color="cyan">{fileName}</Tag> : null}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={9}>
            <Upload.Dragger
              accept=".xlsx,.xls"
              showUploadList={false}
              beforeUpload={handleUpload}
              disabled={uploading}
            >
              <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}><UploadOutlined /></p>
              <p className="ant-upload-text" style={{ marginBottom: 0 }}>
                Click hoặc kéo thả file Excel TONG WHL
              </p>
            </Upload.Dragger>
          </Col>
          <Col xs={24} md={15}>
            <Space wrap className="w-full">
              <Input
                placeholder="Tìm theo CONT hoặc REMARK..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear
                style={{ width: 300 }}
              />
              <DatePicker.RangePicker
                format="DD/MM/YYYY"
                placeholder={['N - COMPLETE từ', 'đến']}
                value={completeRange}
                onChange={setCompleteRange}
                allowClear
                style={{ width: 290 }}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                Thêm dòng
              </Button>
              <Button
                icon={<TranslationOutlined />}
                onClick={openEstLookup}
                style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}
              >
                Tra EST
              </Button>
              <Button
                icon={<ExportOutlined />}
                onClick={exportExcel}
                disabled={!items.length}
                style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
              >
                Xuất Excel{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
              </Button>
            </Space>
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <Tag color="cyan">Tổng: {items.length}</Tag>
              <Tag color="blue">Hiển thị: {visibleItems.length}</Tag>
              <Tag color="orange">Chưa hoàn tất: {incompleteItems.length}</Tag>
              {selectedRowKeys.length > 0 && (
                <>
                  <Tag color="orange">Đã chọn: {selectedRowKeys.length}</Tag>
                  <Button size="small" type="primary" icon={<CalendarOutlined />} onClick={openBulkDates}>
                    Cập nhật ngày
                  </Button>
                  <Button size="small" icon={<CopyOutlined />} onClick={copySelected}>
                    Copy {selectedRowKeys.length} dòng
                  </Button>
                  <Popconfirm
                    title={`Xóa ${selectedRowKeys.length} dòng đã chọn?`}
                    onConfirm={handleDeleteMany}
                    okText="Xóa"
                    cancelText="Hủy"
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Xóa {selectedRowKeys.length} dòng
                    </Button>
                  </Popconfirm>
                  <Button size="small" onClick={() => setSelectedRowKeys([])}>Bỏ chọn</Button>
                </>
              )}
            </div>
          </Col>
        </Row>
        {uploading && <Alert className="mt-3" type="info" showIcon message="Đang đọc và lưu dữ liệu..." />}
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        <Tabs
          activeKey={activeView}
          onChange={key => { setActiveView(key); setSelectedRowKeys([]) }}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
          items={[
            {
              key: 'all',
              label: `TỔNG SẢN LƯỢNG (${items.length})`,
              children: renderTable(filtered, 'Chưa có dữ liệu. Tải file Excel TONG WHL để bắt đầu.'),
            },
            {
              key: 'incomplete',
              label: `CHƯA HOÀN TẤT (${incompleteItems.length})`,
              children: renderTable(filteredIncomplete, 'Không có container chưa hoàn tất.'),
            },
          ]}
        />
      </Card>

      <Modal
        title={`Cập nhật ngày cho ${selectedRowKeys.length} dòng`}
        open={bulkOpen}
        onOk={handleBulkDates}
        onCancel={() => setBulkOpen(false)}
        okText="Cập nhật"
        cancelText="Hủy"
        confirmLoading={bulkSaving}
        okButtonProps={{ icon: <SaveOutlined /> }}
        destroyOnHidden
        width={520}
      >
        <Form form={bulkForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            className="mb-3"
            message="Switch tắt: giữ nguyên ngày hiện có. Switch bật: cập nhật ngày cho tất cả dòng đã chọn (để trống = xóa ngày)."
          />
          <Row gutter={12}>
            {BULK_DATE_FIELDS.map(f => {
              const info = bulkInfo[f.key] || {}
              const enabled = !info.hasData || !!bulkSwitches[f.key]
              return (
                <Col span={8} key={f.key}>
                  <Form.Item
                    name={f.key}
                    label={
                      <Space size={6}>
                        <span>{f.label}</span>
                        {info.hasData && (
                          <Switch
                            size="small"
                            checked={!!bulkSwitches[f.key]}
                            onChange={v => setBulkSwitches(p => ({ ...p, [f.key]: v }))}
                          />
                        )}
                      </Space>
                    }
                  >
                    <DatePicker
                      format="DD/MM/YYYY"
                      style={{ width: '100%' }}
                      allowClear
                      disabled={!enabled}
                      placeholder={info.mixed ? 'Nhiều giá trị' : 'Chọn ngày'}
                    />
                  </Form.Item>
                </Col>
              )
            })}
          </Row>
        </Form>
      </Modal>

      <Modal
        title={<Space><TranslationOutlined style={{ color: '#722ed1' }} /><span>Tra kết quả chuyển EST</span></Space>}
        open={estOpen}
        onCancel={() => { setEstOpen(false); setEstSelected([]) }}
        width={1000}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => { setEstOpen(false); setEstSelected([]) }}>Hủy</Button>,
          <Button
            key="add"
            type="primary"
            icon={<PlusOutlined />}
            disabled={!estSelected.length}
            loading={estSaving}
            onClick={handleAddFromEst}
          >
            Thêm {estSelected.length || ''} container vào sản lượng
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message="Tải file EST ngay tại đây để chuyển đổi. Kết quả dùng để tra cứu và thêm vào sản lượng, không phụ thuộc tab Chuyển EST."
        />
        <Upload.Dragger
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={handleEstUpload}
          disabled={estUploading}
          className="mb-3"
        >
          <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}><UploadOutlined /></p>
          <p className="ant-upload-text" style={{ marginBottom: 0 }}>
            Click hoặc kéo thả file EST để chuyển đổi
          </p>
          <p className="ant-upload-hint" style={{ marginBottom: 0 }}>
            Dùng quy tắc và template đã cấu hình ở tab Chuyển EST
          </p>
        </Upload.Dragger>
        {estUploading && <Alert className="mb-3" type="info" showIcon message="Đang chuyển đổi EST..." />}
        {estFileName && (
          <Tag color="purple" className="mb-3">
            {estFileName} - {estRows.length} container
          </Tag>
        )}
        {!estRows.length && (
          <Alert
            type="warning"
            showIcon
            className="mb-3"
            message="Chưa có kết quả EST"
            description="Tải file EST ở trên để chuyển đổi trước khi tra cứu."
          />
        )}
        <Input
          placeholder="Tìm theo CONT hoặc nội dung chuyển ngữ..."
          prefix={<SearchOutlined />}
          value={estSearch}
          onChange={e => setEstSearch(e.target.value)}
          allowClear
          className="mb-3"
        />
        <Table
          rowKey="container"
          size="small"
          bordered
          columns={estColumns}
          dataSource={estFiltered}
          scroll={{ x: 1120, y: 400 }}
          rowSelection={{
            selectedRowKeys: estSelected,
            onChange: setEstSelected,
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: t => `Tổng ${t} container`,
            pageSizeOptions: [10, 20, 50, 100],
          }}
          locale={{ emptyText: 'Không có kết quả EST phù hợp' }}
        />
      </Modal>

      <Modal
        open={estItContainer !== null}
        title={
          <Space>
            <span>Chọn IT — {estItRow?.container}</span>
            <Tag color="blue">{estItSubs.length} IT</Tag>
          </Space>
        }
        width={560}
        onCancel={applyEstIt}
        footer={[
          <Space key="d">
            <Button onClick={() => setEstItChecks(Object.fromEntries(estItSubs.map((_, i) => [i, true])))}>
              Chọn tất cả
            </Button>
            <Button onClick={() => setEstItChecks(Object.fromEntries(estItSubs.map((_, i) => [i, false])))}>
              Bỏ chọn
            </Button>
            <Button type="primary" onClick={applyEstIt}>Xong</Button>
          </Space>,
        ]}
        destroyOnHidden
      >
        <Row gutter={[8, 8]}>
          <Col span={10}>
            <div className="flex flex-col gap-1 max-h-[320px] overflow-auto pr-2">
              {estItSubs.map((s, i) => (
                <Checkbox
                  key={i}
                  checked={estItChecks[i] !== false}
                  onChange={e => setEstItChecks(prev => ({ ...prev, [i]: e.target.checked }))}
                >
                  <span>IT {s.it || i + 1}</span>
                </Checkbox>
              ))}
            </div>
          </Col>
          <Col span={14}>
            <span style={{ fontSize: 12, color: '#888' }}>Xem trước dòng:</span>
            <div
              style={{
                background: '#fafafa', padding: 8, marginTop: 4,
                fontFamily: 'Consolas, monospace', fontSize: 12,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                maxHeight: 320, overflow: 'auto',
              }}
            >
              {(() => {
                const kept = estItSubs.filter((_, i) => estItChecks[i] !== false).map(s => s.line)
                const dropped = estItSubs.filter((_, i) => estItChecks[i] === false).map(s => s.line)
                return (
                  <>
                    {kept.join(' | ')}
                    {dropped.length > 0 && (
                      <>
                        {kept.length > 0 ? ' | ' : ''}
                        <span style={{ color: 'red', fontWeight: 'bold' }}>
                          KO APP:({dropped.join(' | ')})
                        </span>
                      </>
                    )}
                  </>
                )
              })()}
            </div>
          </Col>
        </Row>
      </Modal>

      <Modal
        title={editing ? 'Sửa container' : 'Thêm container'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null) }}
        okText={editing ? 'Cập nhật' : 'Thêm'}
        cancelText="Hủy"
        confirmLoading={saving}
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={700}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="containerNo" label="CONT" rules={[{ required: true, message: 'Nhập số container' }]}>
                <Input placeholder="VD: WHSU2013282" onInput={e => { e.target.value = e.target.value.toUpperCase() }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sztp" label="SZTP">
                <Input placeholder="VD: 2200" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item name="nBg" label="N - BG">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="nApr" label="N - APR">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="nComplete" label="N - COMPLETE">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="nSc" label="N - SC">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="REMARK">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Ghi chú / VS / SC ..." />
          </Form.Item>
          <Form.Item name="chiTietSc" label="CHI TIẾT SC">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Chi tiết SC (lấy từ kết quả chuyển EST)" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}

export default SanLuongHT
