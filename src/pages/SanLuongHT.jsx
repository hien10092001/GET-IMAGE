import { useEffect, useMemo, useState } from 'react'
import { Table, Button, Input, Space, Tag, Modal, Form, Row, Col, Card, Upload, Popconfirm, message, Tooltip, Alert, DatePicker, Select, Tabs, Switch, Checkbox } from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined,
  UploadOutlined, SearchOutlined, FileExcelOutlined, SaveOutlined, CopyOutlined,
  TranslationOutlined, CalendarOutlined, DollarOutlined, CheckSquareOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../services/api'
import { aggregateEstResults, convertEstFile, loadEstSettings } from '../services/estConvert'
import { copyTable } from '../services/clipboard'

const XLSX = window.XLSX

const REMARK_OPTIONS = ['VS PAD', 'SC PAD', 'VS PAP', 'SC PAP']
const DEFAULT_REMARK = REMARK_OPTIONS[0]

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
  { key: 'tienApr', title: 'TIEN - APR', file: 'TIEN - APR' },
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

const normalizeHeader = (v) => String(v ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[\s.]/g, '')
  .toUpperCase()

const normalizeRemark = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return DEFAULT_REMARK
  const h = normalizeHeader(raw)
  const hit = REMARK_OPTIONS.find(o => normalizeHeader(o) === h)
  if (hit) return hit
  if (h.startsWith('VS')) return h.includes('PAP') ? 'VS PAP' : 'VS PAD'
  if (h.startsWith('SC')) return h.includes('PAP') ? 'SC PAP' : 'SC PAD'
  return DEFAULT_REMARK
}

const REMARK_SELECT_OPTIONS = REMARK_OPTIONS.map(v => ({ value: v, label: v }))

const exportRowValues = (r) => EXPORT_COLUMNS.map(c => (
  c.key === 'remark' ? normalizeRemark(r.remark) : (r[c.key] ?? '')
))

const isContHeader = (v) => {
  const h = normalizeHeader(v)
  if (!h) return false
  return h === 'CONT' || h === 'CONTNO' || h === 'CONTAINER' || h === 'CONTAINERNO' ||
    h === 'SOCONT' || h === 'SOCONTAINER' || (h.startsWith('CONT') && h.length <= 15)
}

const WHL_HEADER_NAMES = [
  'N-BG', 'NBG', 'NGAYBG', 'NGBG',
  'N-COMPLETE', 'NCOMPLETE', 'COMPLETE', 'NGAYCOMPLETE', 'NGAYHOANTAT',
  'N-SC', 'NSC', 'NGAYSC',
]

const parseRows = (aoa) => {
  const headerIdx = aoa.findIndex(r => r && r.some(c => isContHeader(c)))
  if (headerIdx < 0) throw new Error('Không tìm thấy cột CONT trong file')

  const header = aoa[headerIdx].map(normalizeHeader)
  const pickCol = (names, prefix = false) => {
    for (const name of names) {
      const index = header.indexOf(name)
      if (index >= 0) return index
    }
    if (prefix) {
      for (let i = 0; i < header.length; i++) {
        if (names.some(name => header[i].startsWith(name))) return i
      }
    }
    return -1
  }

  const contCol = header.findIndex(h => isContHeader(h))
  const nAprCol = pickCol(['N-APR', 'NAPR', 'NGAYAPR'])
  const idx = {
    containerNo: contCol,
    nBg: pickCol(['N-BG', 'NBG', 'NGAYBG', 'NGBG', 'NGB'], true),
    nApr: nAprCol >= 0 ? nAprCol : (header[3] === '' ? 3 : -1),
    sztp: pickCol(['SZTP', 'SIZE', 'SZ'], true),
    nComplete: pickCol(['N-COMPLETE', 'NCOMPLETE', 'COMPLETE', 'NGAYCOMPLETE', 'NGAYHOANTAT'], true),
    nSc: pickCol(['N-SC', 'NSC', 'NGAYSC'], true),
    remark: pickCol(['REMARK', 'GHICHU', 'NOTE'], true),
    chiTietSc: pickCol(['CHITIETSC', 'CHITIET', 'SCDETAIL'], true),
  }
  if (idx.containerNo < 0) throw new Error('Không tìm thấy cột CONT trong file')

  const get = (row, i) => (i >= 0 ? row[i] : '')
  const totalLabels = /^(TONG|TOTAL|CONG)$/

  return aoa.slice(headerIdx + 1)
    .filter(r => {
      if (!r) return false
      const value = String(get(r, idx.containerNo) ?? '').trim()
      if (!value) return false
      if (totalLabels.test(normalizeHeader(value))) return false
      return true
    })
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
  { title: 'STT', key: 'stt', width: 50, fixed: 'left', render: (_, __, i) => i + 1 },
  { title: 'CONT', dataIndex: 'containerNo', key: 'containerNo', width: 100, fixed: 'left' },
  { title: 'N - BG', dataIndex: 'nBg', key: 'nBg', width: 110, align: 'center' },
  { title: 'N - APR', dataIndex: 'nApr', key: 'nApr', width: 110, align: 'center' },
  { title: 'SZTP', dataIndex: 'sztp', key: 'sztp', width: 90, align: 'center' },
  { title: 'N - COMPLETE', dataIndex: 'nComplete', key: 'nComplete', width: 130, align: 'center' },
  { title: 'N - SC', dataIndex: 'nSc', key: 'nSc', width: 120, align: 'center' },
  { title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 100, ellipsis: true, render: v => (v ? normalizeRemark(v) : '-') },
  { title: 'TIEN - APR', dataIndex: 'tienApr', key: 'tienApr', width: 130, align: 'right', render: v => v || '-' },
  { title: 'CHI TIẾT SC', dataIndex: 'chiTietSc', key: 'chiTietSc', width: 800, render: renderChiTietSc },
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
  const [remarkFilter, setRemarkFilter] = useState([])
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
  const [tienBulkOpen, setTienBulkOpen] = useState(false)
  const [tienBulkValue, setTienBulkValue] = useState('')
  const [tienBulkSaving, setTienBulkSaving] = useState(false)
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState([])
  const [previewSelectedKeys, setPreviewSelectedKeys] = useState([])
  const [previewSearch, setPreviewSearch] = useState('')
  const [previewFileName, setPreviewFileName] = useState('')
  const [previewSaving, setPreviewSaving] = useState(false)
  const [previewItKey, setPreviewItKey] = useState(null)
  const [previewItChecks, setPreviewItChecks] = useState({})
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
      const isEstFile = wb.SheetNames.some(name => {
        const ws = wb.Sheets[name]
        if (!ws) return false
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
        return aoa.some(r => {
          if (!r) return false
          const header = r.map(normalizeHeader)
          return header.includes('CONTAINER') &&
            (header.includes('COMPONENTSDETAILS') || header.includes('COMCODE') || header.includes('DATEOFEST'))
        })
      })
      let rows = []
      if (isEstFile) {
        const { converted } = await convertEstFile(file, loadEstSettings())
        rows = aggregateEstResults(converted)
          .map(r => ({
            containerNo: String(r.container || '').trim().toUpperCase(),
            nBg: formatDateValue(r.dateInYard),
            nApr: '',
            sztp: String(r.size ?? '').trim(),
            nComplete: '',
            nSc: '',
            remark: DEFAULT_REMARK,
            chiTietSc: estRowLineText(r),
            subs: r.subs || [],
            itChecks: {},
          }))
          .filter(r => r.containerNo)
      } else {
        const candidates = []
        const sheetErrors = []
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name]
          if (!ws) continue
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
          try {
            const parsed = parseRows(aoa)
            if (!parsed.length) {
              sheetErrors.push(`${name}: không có dòng dữ liệu`)
              continue
            }
            const headerIdx = aoa.findIndex(r => r && r.some(c => isContHeader(c)))
            const header = headerIdx >= 0 ? aoa[headerIdx].map(normalizeHeader) : []
            const score = header.filter(h => WHL_HEADER_NAMES.includes(h)).length
            candidates.push({ name, parsed, score })
          } catch (err) {
            sheetErrors.push(`${name}: ${err.message}`)
          }
        }
        if (!candidates.length) {
          throw new Error(`Không đọc được dữ liệu CONT. ${sheetErrors.join('; ') || 'File không có sheet dữ liệu'}`)
        }
        candidates.sort((a, b) => (b.score - a.score) || (b.parsed.length - a.parsed.length))
        const bestScore = candidates[0].score
        const chosenSheets = bestScore > 0
          ? candidates.filter(c => c.score === bestScore)
          : [candidates[0]]
        const rowMap = new Map()
        for (const sheet of chosenSheets) {
          for (const row of sheet.parsed) {
            const key = row.containerNo
            const prev = rowMap.get(key)
            if (!prev) {
              rowMap.set(key, row)
              continue
            }
            const merged = { ...prev }
            for (const [field, value] of Object.entries(row)) {
              if (field === 'containerNo') continue
              if (String(value ?? '').trim()) merged[field] = value
            }
            rowMap.set(key, merged)
          }
        }
        rows = [...rowMap.values()]
      }
      if (!rows.length) throw new Error('File không có dòng dữ liệu nào')
      const estMap = new Map(estRows.map(r => [r.container, r]))
      const existingMap = new Map(items.map(i => [String(i.containerNo || '').toUpperCase(), i]))
      const stamp = Date.now()
      const previewData = rows.map((r, index) => {
        const estRow = estMap.get(r.containerNo)
        const subs = r.subs?.length ? r.subs : (estRow?.subs || [])
        const itChecks = r.itChecks || estRow?.itChecks || {}
        const line = estRowLineText({ subs, itChecks })
        const existing = existingMap.get(r.containerNo) || {}
        return {
          ...r,
          _key: `${stamp}-${index}`,
          updateExisting: true,
          nBg: r.nBg || existing.nBg || '',
          nApr: r.nApr || existing.nApr || '',
          sztp: r.sztp || existing.sztp || '',
          nComplete: r.nComplete || existing.nComplete || '',
          nSc: r.nSc || existing.nSc || '',
          remark: normalizeRemark(r.remark || existing.remark),
          chiTietSc: line || r.chiTietSc || existing.chiTietSc || '',
          subs,
          itChecks,
        }
      })
      setPreviewRows(previewData)
      setPreviewSelectedKeys(previewData.map(r => r._key))
      setPreviewSearch('')
      setPreviewFileName(file.name)
      setPreviewOpen(true)
      message.success(`Đã đọc ${previewData.length} container. Kiểm tra bảng xem trước rồi bấm Lưu.`)
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
      if (remarkFilter.length && !remarkFilter.includes(normalizeRemark(i.remark))) return false
      if (!q) return true
      return String(i.containerNo || '').toUpperCase().includes(q) ||
        String(i.remark || '').toUpperCase().includes(q) ||
        String(i.chiTietSc || '').toUpperCase().includes(q)
    })
  }, [items, search, completeRange, remarkFilter])

  const remarkOptions = useMemo(() => {
    const set = new Set(REMARK_OPTIONS)
    items.forEach(i => {
      const r = normalizeRemark(i.remark)
      if (r) set.add(r)
    })
    return [...set].sort().map(v => ({ value: v, label: v }))
  }, [items])

  const incompleteItems = useMemo(
    () => items.filter(i => !String(i.nComplete || '').trim() && !String(i.nSc || '').trim()),
    [items]
  )

  const filteredIncomplete = useMemo(
    () => filtered.filter(i => !String(i.nComplete || '').trim() && !String(i.nSc || '').trim()),
    [filtered]
  )

  const visibleItems = activeView === 'incomplete' ? filteredIncomplete : filtered

  const allVisibleSelected = useMemo(
    () => visibleItems.length > 0 && visibleItems.every(i => selectedRowKeys.includes(i._id)),
    [visibleItems, selectedRowKeys]
  )

  const selectedItems = useMemo(
    () => items.filter(i => selectedRowKeys.includes(i._id)),
    [items, selectedRowKeys]
  )

  const existingConts = useMemo(
    () => new Set(items.map(i => String(i.containerNo || '').toUpperCase())),
    [items]
  )

  const previewFiltered = useMemo(() => {
    const q = previewSearch.trim().toUpperCase()
    if (!q) return previewRows
    return previewRows.filter(r =>
      String(r.containerNo || '').toUpperCase().includes(q) ||
      String(r.remark || '').toUpperCase().includes(q) ||
      String(r.chiTietSc || '').toUpperCase().includes(q)
    )
  }, [previewRows, previewSearch])

  const previewStats = useMemo(() => {
    let existing = 0
    let fresh = 0
    let selected = 0
    let saveCount = 0
    const selectedSet = new Set(previewSelectedKeys)
    for (const row of previewRows) {
      const isExisting = existingConts.has(String(row.containerNo || '').toUpperCase())
      if (isExisting) existing++
      else fresh++
      if (selectedSet.has(row._key)) {
        selected++
        if (!isExisting || row.updateExisting !== false) saveCount++
      }
    }
    return { total: previewRows.length, existing, fresh, selected, saveCount }
  }, [previewRows, previewSelectedKeys, existingConts])

  const updatePreviewRow = (key, patch) => {
    setPreviewRows(prev => prev.map(row => (row._key === key ? { ...row, ...patch } : row)))
  }

  const removePreviewRow = (key) => {
    setPreviewRows(prev => prev.filter(row => row._key !== key))
    setPreviewSelectedKeys(prev => prev.filter(item => item !== key))
  }

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewRows([])
    setPreviewSelectedKeys([])
    setPreviewSearch('')
    setPreviewFileName('')
    setPreviewItKey(null)
  }

  const previewItRow = previewRows.find(r => r._key === previewItKey)
  const previewItSubs = previewItRow?.subs?.length ? previewItRow.subs : []

  const openPreviewIt = (row) => {
    if (!row?.subs?.length) return
    setPreviewItKey(row._key)
    setPreviewItChecks(row.itChecks || {})
  }

  const applyPreviewIt = () => {
    if (previewItRow?.subs?.length) {
      updatePreviewRow(previewItKey, {
        itChecks: previewItChecks,
        chiTietSc: estRowLineText({ subs: previewItRow.subs, itChecks: previewItChecks }),
      })
    }
    setPreviewItKey(null)
  }

  const savePreviewImport = async () => {
    if (!previewRows.length) return
    const selectedSet = new Set(previewSelectedKeys)
    const rowsToSave = previewRows
      .filter(row => selectedSet.has(row._key))
      .filter(row => !existingConts.has(String(row.containerNo || '').toUpperCase()) || row.updateExisting !== false)
    if (!rowsToSave.length) {
      message.warning('Không có dòng nào cần lưu')
      return
    }
    setPreviewSaving(true)
    try {
      const res = await api.post('/sanluong-ht/import', {
        items: rowsToSave.map(row => ({
          containerNo: row.containerNo,
          nBg: row.nBg,
          nApr: row.nApr,
          sztp: row.sztp,
          nComplete: row.nComplete,
          nSc: row.nSc,
          remark: normalizeRemark(row.remark),
          chiTietSc: row.chiTietSc,
        })),
      })
      setItems(res.data.items || [])
      setSelectedRowKeys([])
      setFileName(previewFileName)
      message.success(`Đã lưu ${res.data.imported} container từ ${previewFileName}`)
      closePreview()
    } catch (e) {
      message.error(e.response?.data?.message || e.message || 'Lỗi lưu dữ liệu')
    } finally {
      setPreviewSaving(false)
    }
  }

  const previewColumns = [
    {
      title: 'CONT', dataIndex: 'containerNo', key: 'containerNo', width: 150, fixed: 'left',
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={e => updatePreviewRow(row._key, { containerNo: e.target.value.toUpperCase() })}
        />
      ),
    },
    {
      title: 'N - BG', dataIndex: 'nBg', key: 'nBg', width: 105,
      render: (v, row) => (
        <Input size="small" value={v} onChange={e => updatePreviewRow(row._key, { nBg: e.target.value })} />
      ),
    },
    {
      title: 'N - APR', dataIndex: 'nApr', key: 'nApr', width: 105,
      render: (v, row) => (
        <Input size="small" value={v} onChange={e => updatePreviewRow(row._key, { nApr: e.target.value })} />
      ),
    },
    {
      title: 'SZTP', dataIndex: 'sztp', key: 'sztp', width: 80,
      render: (v, row) => (
        <Input size="small" value={v} onChange={e => updatePreviewRow(row._key, { sztp: e.target.value })} />
      ),
    },
    {
      title: 'N - COMPLETE', dataIndex: 'nComplete', key: 'nComplete', width: 120,
      render: (v, row) => (
        <Input size="small" value={v} onChange={e => updatePreviewRow(row._key, { nComplete: e.target.value })} />
      ),
    },
    {
      title: 'N - SC', dataIndex: 'nSc', key: 'nSc', width: 110,
      render: (v, row) => (
        <Input size="small" value={v} onChange={e => updatePreviewRow(row._key, { nSc: e.target.value })} />
      ),
    },
    {
      title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 130,
      render: (v, row) => (
        <Select
          size="small"
          value={normalizeRemark(v)}
          options={REMARK_SELECT_OPTIONS}
          onChange={val => updatePreviewRow(row._key, { remark: val })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'CHI TIẾT SC', dataIndex: 'chiTietSc', key: 'chiTietSc', width: 360,
      render: (v, row) => (
        <Space direction="vertical" size={2} style={{ width: '100%' }}>
          <Input size="small" value={v} onChange={e => updatePreviewRow(row._key, { chiTietSc: e.target.value })} />
          {row.subs?.length ? (
            <Button
              type="link"
              size="small"
              icon={<TranslationOutlined />}
              onClick={() => openPreviewIt(row)}
              style={{ padding: 0, height: 'auto', alignSelf: 'flex-start' }}
            >
              Chọn IT ({row.subs.length})
            </Button>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'TRẠNG THÁI', key: 'status', width: 140, align: 'center',
      render: (_, row) => (existingConts.has(String(row.containerNo || '').toUpperCase())
        ? (
          <Space size={4}>
            <Switch
              size="small"
              checked={row.updateExisting !== false}
              onChange={checked => updatePreviewRow(row._key, { updateExisting: checked })}
            />
            <span style={{ fontSize: 12 }}>
              {row.updateExisting !== false ? 'Cập nhật' : 'Bỏ qua'}
            </span>
          </Space>
        )
        : <Tag color="green">Mới</Tag>),
    },
    {
      title: '', key: 'action', width: 50, align: 'center',
      render: (_, row) => (
        <Tooltip title="Xóa khỏi xem trước">
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removePreviewRow(row._key)} />
        </Tooltip>
      ),
    },
  ]

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
          value={v || DEFAULT_REMARK}
          options={REMARK_SELECT_OPTIONS}
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
        .map(r => ({ ...r, remark: DEFAULT_REMARK, updateExisting: true }))
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
          remark: normalizeRemark(r.remark),
          chiTietSc: estRowLineText(r),
        }
        if (existing && r.updateExisting !== false) {
          updates.push({
            ...base,
            nBg: base.nBg || existing.nBg || '',
            sztp: base.sztp || existing.sztp || '',
            remark: normalizeRemark(base.remark || existing.remark),
            chiTietSc: base.chiTietSc || existing.chiTietSc || '',
            tienApr: existing.tienApr || '',
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
      remark: normalizeRemark(record.remark),
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
        remark: normalizeRemark(values.remark),
        tienApr: String(values.tienApr || '').trim(),
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

  const openBulkTienApr = () => {
    setTienBulkValue('')
    setTienBulkOpen(true)
  }

  const handleBulkTienApr = async () => {
    if (!selectedRowKeys.length) return
    try {
      setTienBulkSaving(true)
      const res = await api.post('/sanluong-ht/update-many', {
        ids: selectedRowKeys,
        tienApr: tienBulkValue,
      })
      setItems(res.data.items || [])
      setSelectedRowKeys([])
      setTienBulkOpen(false)
      message.success(`Đã cập nhật TIEN - APR cho ${res.data.updated} dòng`)
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi cập nhật TIEN - APR')
    } finally {
      setTienBulkSaving(false)
    }
  }

  const handleSelectAllVisible = () => {
    setSelectedRowKeys(visibleItems.map(i => i._id))
  }

  const copySelected = async () => {
    if (!selectedItems.length) return
    const header = ['STT', ...EXPORT_COLUMNS.map(c => c.title)]
    const rows = selectedItems.map((r, i) => [i + 1, ...exportRowValues(r)])
    try {
      await copyTable(rows, header)
      message.success(`Đã copy ${selectedItems.length} dòng`)
    } catch {
      message.error('Lỗi copy')
    }
  }

  const exportExcel = () => {
    const rows = selectedItems.length > 0 ? selectedItems : visibleItems
    if (!rows.length) {
      message.warning('Chưa có dữ liệu để xuất')
      return
    }
    const header = ['STT', ...EXPORT_COLUMNS.map(c => c.file), '']
    const body = rows.map((i, idx) => [idx + 1, ...exportRowValues(i), ''])
    const aoa = [
      ['BÁO CÁO WHL 2026', '', '', '', '', '', '', '', '', '', ''],
      header,
      ...body,
    ]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }]
    ws['!cols'] = [
      { wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 36 }, { wch: 14 }, { wch: 60 }, { wch: 4 },
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
      scroll={{ x: 1540 }}
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
              accept=".xlsx,.xls,.xlsm,.csv"
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
                placeholder="Tìm theo CONT, REMARK hoặc CHI TIẾT SC..."
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
              <Select
                mode="multiple"
                allowClear
                placeholder="Lọc REMARK"
                value={remarkFilter}
                onChange={setRemarkFilter}
                options={remarkOptions}
                maxTagCount="responsive"
                style={{ minWidth: 200, maxWidth: 320 }}
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
              <Button
                size="small"
                icon={<CheckSquareOutlined />}
                onClick={handleSelectAllVisible}
                disabled={!visibleItems.length || allVisibleSelected}
              >
                Chọn tất cả ({visibleItems.length})
              </Button>
              {selectedRowKeys.length > 0 && (
                <>
                  <Tag color="orange">Đã chọn: {selectedRowKeys.length}</Tag>
                  <Button size="small" type="primary" icon={<CalendarOutlined />} onClick={openBulkDates}>
                    Cập nhật ngày
                  </Button>
                  <Button size="small" icon={<DollarOutlined />} onClick={openBulkTienApr}>
                    TIEN - APR
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
        {uploading && <Alert className="mt-3" type="info" showIcon message="Đang đọc file Excel..." />}
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
        title={`Cập nhật TIEN - APR cho ${selectedRowKeys.length} dòng`}
        open={tienBulkOpen}
        onOk={handleBulkTienApr}
        onCancel={() => setTienBulkOpen(false)}
        okText="Cập nhật"
        cancelText="Hủy"
        confirmLoading={tienBulkSaving}
        okButtonProps={{ icon: <SaveOutlined /> }}
        destroyOnHidden
        width={420}
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message="Giá trị này sẽ áp dụng cho tất cả dòng đã chọn (để trống = xóa TIEN - APR)."
        />
        <Input
          value={tienBulkValue}
          onChange={e => setTienBulkValue(e.target.value)}
          placeholder="Nhập TIEN - APR"
          allowClear
        />
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
        open={previewItKey !== null}
        title={
          <Space>
            <span>Chọn IT — {previewItRow?.containerNo}</span>
            <Tag color="blue">{previewItSubs.length} IT</Tag>
          </Space>
        }
        width={560}
        onCancel={() => setPreviewItKey(null)}
        footer={[
          <Space key="d">
            <Button onClick={() => setPreviewItChecks(Object.fromEntries(previewItSubs.map((_, i) => [i, true])))}>
              Chọn tất cả
            </Button>
            <Button onClick={() => setPreviewItChecks(Object.fromEntries(previewItSubs.map((_, i) => [i, false])))}>
              Bỏ chọn
            </Button>
            <Button type="primary" onClick={applyPreviewIt}>Xong</Button>
          </Space>,
        ]}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message="Bỏ chọn IT sẽ đưa dòng đó vào phần KO APP trong CHI TIẾT SC."
        />
        <Row gutter={[8, 8]}>
          <Col span={10}>
            <div className="flex flex-col gap-1 max-h-[320px] overflow-auto pr-2">
              {previewItSubs.map((s, i) => (
                <Checkbox
                  key={i}
                  checked={previewItChecks[i] !== false}
                  onChange={e => setPreviewItChecks(prev => ({ ...prev, [i]: e.target.checked }))}
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
                const kept = previewItSubs.filter((_, i) => previewItChecks[i] !== false).map(s => s.line)
                const dropped = previewItSubs.filter((_, i) => previewItChecks[i] === false).map(s => s.line)
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
        title={<Space><FileExcelOutlined style={{ color: '#08979c' }} /><span>Xem trước import{previewFileName ? ` - ${previewFileName}` : ''}</span></Space>}
        open={previewOpen}
        onCancel={closePreview}
        width={1320}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={closePreview}>Hủy</Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            loading={previewSaving}
            disabled={!previewStats.saveCount}
            onClick={savePreviewImport}
          >
            Lưu {previewStats.saveCount} container
          </Button>,
        ]}
      >
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <Input
            placeholder="Tìm CONT / REMARK / CHI TIẾT SC..."
            prefix={<SearchOutlined />}
            value={previewSearch}
            onChange={e => setPreviewSearch(e.target.value)}
            allowClear
            style={{ width: 300 }}
          />
          <Tag color="cyan">Tổng: {previewStats.total}</Tag>
          <Tag color="green">Mới: {previewStats.fresh}</Tag>
          <Tag color="orange">Đã có: {previewStats.existing}</Tag>
          <Tag color="blue">Đã chọn: {previewStats.selected}</Tag>
          <Button size="small" onClick={() => setPreviewSelectedKeys(previewFiltered.map(row => row._key))}>
            Chọn tất cả
          </Button>
          <Button size="small" onClick={() => setPreviewSelectedKeys([])}>Bỏ chọn</Button>
        </div>
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message="Có thể sửa trực tiếp từng ô, xóa dòng, bỏ chọn dòng. Dòng 'Đã có' tắt switch sẽ giữ nguyên dữ liệu cũ. TIEN - APR luôn được giữ nguyên khi import."
        />
        <Table
          rowKey="_key"
          size="small"
          bordered
          columns={previewColumns}
          dataSource={previewFiltered}
          scroll={{ x: 1300, y: 420 }}
          rowSelection={{
            selectedRowKeys: previewSelectedKeys,
            onChange: setPreviewSelectedKeys,
            preserveSelectedRowKeys: true,
          }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: t => `Tổng ${t} dòng`,
            pageSizeOptions: [20, 50, 100, 500],
          }}
        />
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
          <Form.Item name="remark" label="REMARK" initialValue={DEFAULT_REMARK}>
            <Select options={REMARK_SELECT_OPTIONS} placeholder="Chọn REMARK" />
          </Form.Item>
          <Form.Item name="tienApr" label="TIEN - APR">
            <Input placeholder="VD: 1.250.000" />
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
