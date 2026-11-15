import { useEffect, useMemo, useState } from 'react'
import {
  Table, Button, Input, Space, Tag, Card, Upload, Popconfirm, message, Tooltip,
  Alert, Select, Row, Col, Statistic, Modal, Switch, InputNumber, DatePicker, Form,
  Empty, Spin,
} from 'antd'
import {
  UploadOutlined, DownloadOutlined, DeleteOutlined, SearchOutlined,
  DollarOutlined, FileExcelOutlined, SaveOutlined, EditOutlined, HistoryOutlined,
  CopyOutlined, CheckSquareOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSXStyle from 'xlsx-js-style'
import api from '../services/api'

const XLSX = window.XLSX

const removeDiacritics = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')

const normalizeHeader = (value = '') =>
  removeDiacritics(value).replace(/\s+/g, '').toUpperCase()

const pad = (n) => String(n).padStart(2, '0')

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value instanceof Date || typeof value === 'object') return 0
  let text = String(value ?? '').trim()
  if (!text) return 0
  text = text.replace(/[^\d,.-]/g, '')
  if (!text) return 0
  const hasDot = text.includes('.')
  const hasComma = text.includes(',')
  if (hasDot && hasComma) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.')
    } else {
      text = text.replace(/,/g, '')
    }
  } else if (hasComma) {
    const parts = text.split(',')
    text = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0].replace(/\./g, '')}.${parts[1]}`
      : text.replace(/,/g, '')
  } else if (hasDot) {
    const parts = text.split('.')
    if (parts.length > 2) {
      text = text.replace(/\./g, '')
    }
  }
  const num = Number.parseFloat(text)
  return Number.isFinite(num) ? num : 0
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

const formatNumber = (value) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(value) || 0)

const THIN_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
}

const YELLOW_FILL = { patternType: 'solid', fgColor: { rgb: 'FFFF00' } }

const styleSheet = (ws, { yellowRows = [], rightCols = [] } = {}) => {
  if (!ws || !ws['!ref']) return
  const range = XLSXStyle.utils.decode_range(ws['!ref'])
  const yellow = new Set(yellowRows)
  const right = new Set(rightCols)
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSXStyle.utils.encode_cell({ r, c })
      if (!ws[addr]) ws[addr] = { t: 's', v: '' }
      const style = {
        border: THIN_BORDER,
        alignment: {
          vertical: 'center',
          wrapText: true,
          horizontal: right.has(c) ? 'right' : 'center',
        },
      }
      if (yellow.has(r)) {
        style.fill = YELLOW_FILL
        style.font = { bold: true }
      }
      ws[addr].s = style
    }
  }
  ws['!rows'] = ws['!rows'] || []
  ws['!rows'][0] = { hpt: 24 }
}

const excelSerialToDate = (serial) => {
  const code = XLSX.SSF.parse_date_code(serial)
  if (!code) return null
  return dayjs(new Date(code.y, code.m - 1, code.d))
}

const parseDateCell = (value) => {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date) return dayjs(value).format('DD/MM/YYYY')
  if (typeof value === 'number') {
    if (value > 20000 && value < 80000) {
      const d = excelSerialToDate(value)
      if (d) return d.format('DD/MM/YYYY')
    }
    return String(value)
  }
  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{5}$/.test(text)) {
    const d = excelSerialToDate(Number(text))
    if (d) return d.format('DD/MM/YYYY')
  }
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (dmy) {
    let year = Number(dmy[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    return `${pad(Number(dmy[1]))}/${pad(Number(dmy[2]))}/${year}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const d = dayjs(text)
    if (d.isValid()) return d.format('DD/MM/YYYY')
  }
  return text
}

const dateToDayjs = (value) => {
  const text = parseDateCell(value)
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = dayjs(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  return d.isValid() ? d : null
}

const rowKeyOf = (item) => `${item.line || ''}|${item.containerNo || ''}`

const isContHeader = (value) => {
  const h = normalizeHeader(value)
  return h === 'CONT' || h === 'SOCONT' || h === 'CONTNO' ||
    h === 'CONTAINER' || h === 'CONTAINERNO' || h === 'SOCONTAINER'
}

const parseWorkbook = async (file) => {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const items = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true })
    const headerIdx = aoa.findIndex(row => row.some(isContHeader))
    if (headerIdx < 0) continue

    const header = aoa[headerIdx].map(cell => normalizeHeader(cell))
    const findIdx = (predicate) => header.findIndex(predicate)
    const contIdx = findIdx(isContHeader)
    if (contIdx < 0) continue
    const lineIdx = findIdx(h => h === 'LINE')
    const sztpIdx = findIdx(h => h === 'SZTP' || h === 'SIZE' || h === 'TYPE' || h.includes('SZTP'))
    const isDateHeader = h => h === 'DATE' || h.startsWith('DATE') || h.includes('NGAY') || h.includes('THOIGIAN')
    const dateIdx = findIdx(isDateHeader)
    const remarkIdx = findIdx(h => h === 'REMARK' || h === 'GHICHU' || h === 'NOTE' || h === 'CHITIET')
    const isHungHeader = h => h.includes('HUNGTHINH') || (h.includes('HUNG') && h.includes('THINH'))
    const hungIdx = findIdx(isHungHeader)
    const moneyMatchers = [
      h => !isHungHeader(h) && (h.includes('HANGTAU') || h.includes('TENHANGTAU')) && h.includes('TIEN'),
      h => !isHungHeader(h) && (h.includes('SOTIEN') || h.includes('THANHTIEN') || h.includes('TIEN') || h.includes('CUOC')) && !h.includes('VAT'),
      h => !isHungHeader(h) && (h.includes('SOTIEN') || h.includes('TIEN') || h.includes('CUOC')),
    ]
    let moneyIdx = -1
    for (const match of moneyMatchers) {
      moneyIdx = findIdx(match)
      if (moneyIdx >= 0) break
    }
    const hungCol = hungIdx

    for (const row of aoa.slice(headerIdx + 1)) {
      if (!row) continue
      const rawCont = String(row[contIdx] ?? '').trim()
      const normCont = normalizeHeader(rawCont)
      if (!rawCont || normCont === 'TONG' || normCont.startsWith('TONG')) continue

      const rawLine = lineIdx >= 0 ? String(row[lineIdx] ?? '').trim() : ''
      const line = (rawLine || String(sheetName).trim()).toUpperCase()
      items.push({
        line,
        containerNo: rawCont.toUpperCase(),
        sztp: sztpIdx >= 0 ? String(row[sztpIdx] ?? '').trim() : '',
        ngaySc: dateIdx >= 0 ? parseDateCell(row[dateIdx]) : '',
        tienHang: moneyIdx >= 0 ? round2(toNumber(row[moneyIdx])) : 0,
        tienHungThinh: hungCol >= 0 ? round2(toNumber(row[hungCol])) : 0,
        hasTienHang: moneyIdx >= 0,
        hasTienHungThinh: hungCol >= 0,
        remark: remarkIdx >= 0 ? String(row[remarkIdx] ?? '').trim() : '',
      })
    }
  }

  return items
}

const derivePeriod = (items) => {
  const dates = items
    .map(item => dateToDayjs(item.ngaySc))
    .filter(Boolean)
    .sort((a, b) => a.valueOf() - b.valueOf())
  if (!dates.length) return dayjs().format('DD.MM')
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.isSame(last, 'day')) return first.format('DD.MM')
  return `${first.format('DD.MM')} - ${last.format('DD.MM')}`
}

const safeSheetName = (name) => {
  const cleaned = String(name || 'KHAC').replace(/[\\/?*[\]:]/g, '').trim()
  return (cleaned || 'KHAC').slice(0, 31)
}

function SlScPad() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState('')
  const [search, setSearch] = useState('')
  const [lineFilter, setLineFilter] = useState([])
  const [dateRange, setDateRange] = useState(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState([])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState([])
  const [previewSelectedKeys, setPreviewSelectedKeys] = useState([])
  const [previewFileName, setPreviewFileName] = useState('')
  const [previewSaving, setPreviewSaving] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm] = Form.useForm()

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDetail, setHistoryDetail] = useState(null)
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState(null)
  const [creatingOutput, setCreatingOutput] = useState(false)
  const [producedMap, setProducedMap] = useState(() => new Map())

  const [periodOpen, setPeriodOpen] = useState(false)
  const [periodSearch, setPeriodSearch] = useState('')
  const [periodDirty, setPeriodDirty] = useState(false)
  const [periodSaving, setPeriodSaving] = useState(false)
  const [periodDeleting, setPeriodDeleting] = useState(false)
  const [itemEditOpen, setItemEditOpen] = useState(false)
  const [itemEditIndex, setItemEditIndex] = useState(null)
  const [itemEditForm] = Form.useForm()

  const fetchItems = () => {
    queueMicrotask(() => setLoading(true))
    return api.get('/sl-sc-pad')
      .then(res => setItems(res.data || []))
      .catch(e => message.error(e.response?.data?.message || 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false))
  }

  const fetchHistory = () => {
    queueMicrotask(() => setHistoryLoading(true))
    return api.get('/sl-sc-pad/history')
      .then(res => setHistoryList(res.data || []))
      .catch(e => message.error(e.response?.data?.message || 'Lỗi tải lịch sử sản lượng'))
      .finally(() => setHistoryLoading(false))
  }

  const fetchProduced = () => {
    return api.get('/sl-sc-pad/produced')
      .then(res => {
        const map = new Map()
        for (const row of res.data || []) {
          map.set(`${row.line || ''}|${row.containerNo || ''}`, row)
        }
        setProducedMap(map)
      })
      .catch(e => message.error(e.response?.data?.message || 'Lỗi tải sản lượng trước'))
  }

  const loadHistoryDetail = (id) => {
    if (!id) return
    setSelectedHistoryId(id)
    setHistoryDetail(null)
    setHistoryDetailLoading(true)
    api.get(`/sl-sc-pad/history/${id}`)
      .then(res => setHistoryDetail(res.data))
      .catch(e => message.error(e.response?.data?.message || 'Lỗi tải chi tiết sản lượng'))
      .finally(() => setHistoryDetailLoading(false))
  }

  const openPeriod = (id) => {
    if (!id) return
    setPeriodOpen(true)
    setPeriodSearch('')
    setPeriodDirty(false)
    loadHistoryDetail(id)
  }

  const closePeriod = () => {
    setPeriodOpen(false)
    setItemEditOpen(false)
    setItemEditIndex(null)
    setHistoryDetail(null)
    setHistoryDetailLoading(false)
    setPeriodDirty(false)
  }

  useEffect(() => { fetchItems(); fetchHistory(); fetchProduced() }, [])

  const existingSet = useMemo(
    () => new Set(items.map(item => rowKeyOf(item))),
    [items]
  )

  const existingMap = useMemo(
    () => new Map(items.map(item => [rowKeyOf(item), item])),
    [items]
  )

  const handleUpload = async (file) => {
    setUploading(true)
    try {
      const parsed = await parseWorkbook(file)
      if (!parsed.length) throw new Error('Không tìm thấy dữ liệu CONT trong file')
      const stamp = Date.now()
      const rows = parsed.map((item, index) => {
        const current = existingMap.get(rowKeyOf(item)) || producedMap.get(rowKeyOf(item))
        const hasTienHang = item.hasTienHang === true
        const hasTienHungThinh = item.hasTienHungThinh === true
        return {
          ...item,
          _key: `${stamp}-${index}`,
          tienHang: hasTienHang ? item.tienHang : (Number(current?.tienHang) || 0),
          tienHungThinh: hasTienHungThinh ? item.tienHungThinh : (Number(current?.tienHungThinh) || 0),
          hasTienHang,
          hasTienHungThinh,
          fileHasMoney: hasTienHang || hasTienHungThinh,
          oldTienHang: current ? Number(current.tienHang) || 0 : null,
          oldTienHungThinh: current ? Number(current.tienHungThinh) || 0 : null,
          updateTienHang: true,
          updateTienHungThinh: true,
          updateExisting: true,
          duplicateMode: 'new',
          updateMoney: hasTienHang || hasTienHungThinh,
        }
      })
      setPreviewRows(rows)
      setPreviewSelectedKeys(rows.map(row => row._key))
      setPreviewFileName(file.name)
      await fetchProduced()
      setPreviewOpen(true)
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Lỗi đọc file Excel')
    } finally {
      setUploading(false)
    }
    return false
  }

  const closePreview = () => {
    setPreviewOpen(false)
    setPreviewRows([])
    setPreviewSelectedKeys([])
    setPreviewFileName('')
  }

  const updatePreviewRow = (key, patch) => {
    setPreviewRows(prev => prev.map(row => (row._key === key ? { ...row, ...patch } : row)))
  }

  const removePreviewRow = (key) => {
    setPreviewRows(prev => prev.filter(row => row._key !== key))
    setPreviewSelectedKeys(prev => prev.filter(item => item !== key))
  }

  const isRowExisting = (row) => existingSet.has(rowKeyOf(row))
  const isRowProduced = (row) => producedMap.has(rowKeyOf(row))
  const producedInfoOf = (row) => producedMap.get(rowKeyOf(row))

  const previewStats = useMemo(() => {
    let existing = 0
    let produced = 0
    let fresh = 0
    let selected = 0
    let saveCount = 0
    for (const row of previewRows) {
      const isExisting = existingSet.has(rowKeyOf(row))
      const isProduced = producedMap.has(rowKeyOf(row))
      if (isProduced) produced++
      else if (isExisting) existing++
      else fresh++
      if (previewSelectedKeys.includes(row._key)) {
        selected++
        if (isProduced) {
          if (row.duplicateMode !== 'skip') saveCount++
        } else if (!isExisting || row.updateExisting !== false) {
          saveCount++
        }
      }
    }
    return { total: previewRows.length, existing, produced, fresh, selected, saveCount }
  }, [previewRows, previewSelectedKeys, existingSet, producedMap])

  const previewNoMoney = useMemo(
    () => previewRows.length > 0 && previewRows.every(row => row.fileHasMoney === false),
    [previewRows]
  )

  const savePreview = async () => {
    if (!previewRows.length) return
    const selectedRows = previewRows.filter(row => previewSelectedKeys.includes(row._key))
    const rowsToSave = selectedRows.filter(row => {
      if (isRowProduced(row)) return row.duplicateMode !== 'skip'
      if (isRowExisting(row)) return row.updateExisting !== false
      return true
    })
    if (!rowsToSave.length) {
      message.warning('Không có dòng nào cần lưu')
      return
    }
    setPreviewSaving(true)
    try {
      const res = await api.post('/sl-sc-pad/import', {
        items: rowsToSave.map(row => ({
          line: row.line,
          containerNo: row.containerNo,
          sztp: row.sztp,
          ngaySc: row.ngaySc,
          tienHang: row.tienHang,
          tienHungThinh: row.tienHungThinh,
          remark: row.remark,
          mode: isRowProduced(row) ? row.duplicateMode : 'new',
          updateMoney: row.fileHasMoney !== false,
          updateTienHang: row.hasTienHang !== false && row.updateTienHang !== false,
          updateTienHungThinh: row.hasTienHungThinh !== false && row.updateTienHungThinh !== false,
        })),
      })
      setItems(res.data.items || [])
      setSelectedRowKeys([])
      setFileName(previewFileName)
      fetchProduced()
      const parts = [`thêm mới ${res.data.inserted || 0}`, `cập nhật ${res.data.updated || 0}`]
      if (res.data.producedNew) parts.push(`đưa lại ${res.data.producedNew} cont vào danh sách`)
      if (res.data.producedUpdated) parts.push(`cập nhật kỳ cũ ${res.data.producedUpdated}`)
      message.success(`Đã lưu ${rowsToSave.length} dòng: ${parts.join(', ')}`)
      closePreview()
    } catch (err) {
      message.error(err.response?.data?.message || err.message || 'Lỗi lưu dữ liệu')
    } finally {
      setPreviewSaving(false)
    }
  }

  const lineOptions = useMemo(() => {
    const set = new Set(items.map(i => String(i.line || '').trim()).filter(Boolean))
    return [...set].sort().map(v => ({ value: v, label: v }))
  }, [items])

  const rangeRows = useMemo(() => {
    const [from, to] = dateRange || []
    if (!from || !to) return items
    return items.filter(i => {
      const d = dateToDayjs(i.ngaySc)
      return !!d && !d.isBefore(from, 'day') && !d.isAfter(to, 'day')
    })
  }, [items, dateRange])

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase()
    return rangeRows.filter(i => {
      if (lineFilter.length && !lineFilter.includes(String(i.line || '').trim())) return false
      if (!q) return true
      return String(i.containerNo || '').toUpperCase().includes(q) ||
        String(i.line || '').toUpperCase().includes(q) ||
        String(i.sztp || '').toUpperCase().includes(q)
    })
  }, [rangeRows, search, lineFilter])

  const totals = useMemo(() => filtered.reduce((acc, item) => {
    acc.tienHang += Number(item.tienHang) || 0
    acc.tienHungThinh += Number(item.tienHungThinh) || 0
    return acc
  }, { tienHang: 0, tienHungThinh: 0 }), [filtered])

  const rangeLabel = dateRange && dateRange[0] && dateRange[1]
    ? `${dateRange[0].format('DD.MM.YYYY')} - ${dateRange[1].format('DD.MM.YYYY')}`
    : ''

  const handleDelete = async (id) => {
    try {
      await api.delete(`/sl-sc-pad/${id}`)
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
      const res = await api.post('/sl-sc-pad/delete-many', { ids: selectedRowKeys })
      const removed = new Set(selectedRowKeys)
      setItems(prev => prev.filter(i => !removed.has(i._id)))
      setSelectedRowKeys([])
      message.success(`Đã xóa ${res.data.deleted} dòng`)
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa')
    }
  }

  const openEdit = (record) => {
    setEditing(record)
    editForm.setFieldsValue({
      containerNo: record.containerNo || '',
      line: record.line || '',
      sztp: record.sztp || '',
      ngaySc: dateToDayjs(record.ngaySc),
      tienHang: Number(record.tienHang) || 0,
      tienHungThinh: Number(record.tienHungThinh) || 0,
      remark: record.remark || '',
    })
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    try {
      const values = await editForm.validateFields()
      const payload = {
        containerNo: String(values.containerNo || '').trim().toUpperCase(),
        line: String(values.line || '').trim().toUpperCase(),
        sztp: String(values.sztp || '').trim(),
        ngaySc: values.ngaySc ? values.ngaySc.format('DD/MM/YYYY') : '',
        tienHang: Number(values.tienHang) || 0,
        tienHungThinh: Number(values.tienHungThinh) || 0,
        remark: String(values.remark || '').trim(),
      }
      setEditSaving(true)
      const res = await api.put(`/sl-sc-pad/${editing._id}`, payload)
      setItems(prev => prev.map(i => (i._id === editing._id ? res.data : i)))
      message.success('Đã cập nhật chi tiết container')
      setEditOpen(false)
      setEditing(null)
    } catch (e) {
      if (e.response) message.error(e.response.data?.message || 'Lỗi lưu dữ liệu')
    } finally {
      setEditSaving(false)
    }
  }

  const buildWorkbook = (rows, period) => {
    const lineNames = []
    const grouped = new Map()
    for (const item of rows) {
      const line = String(item.line || 'KHÁC').trim().toUpperCase() || 'KHÁC'
      if (!grouped.has(line)) {
        grouped.set(line, [])
        lineNames.push(line)
      }
      grouped.get(line).push(item)
    }

    const wb = XLSXStyle.utils.book_new()
    let grandHang = 0
    let grandHung = 0
    let grandCount = 0

    for (const line of lineNames) {
      const lineRows = grouped.get(line).slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      const totalHang = round2(lineRows.reduce((s, r) => s + (Number(r.tienHang) || 0), 0))
      const totalHung = round2(lineRows.reduce((s, r) => s + (Number(r.tienHungThinh) || 0), 0))
      grandHang += totalHang
      grandHung += totalHung
      grandCount += lineRows.length

      const aoa = [
        [` BÁO CÁO SC ${period}`],
        ['STT', 'CONT', 'LINE', 'SZTP', 'NGÀY SC', `SỐ TIỀN ${line} - PAD`, 'SỐ TIỀN HƯNG THỊNH - PAD             (-VAT)', 'REMARK'],
        ...lineRows.map((r, idx) => [
          idx + 1,
          r.containerNo || '',
          r.line || '',
          r.sztp || '',
          r.ngaySc || '',
          round2(r.tienHang),
          round2(r.tienHungThinh),
          r.remark || '',
        ]),
        ['TỔNG', '', '', '', '', totalHang, totalHung, ''],
      ]
      const ws = XLSXStyle.utils.aoa_to_sheet(aoa)
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 4 } },
      ]
      ws['!cols'] = [
        { wch: 6 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
        { wch: 14 }, { wch: 20 }, { wch: 34 }, { wch: 30 },
      ]
      styleSheet(ws, { yellowRows: [0, 1, aoa.length - 1], rightCols: [5, 6] })
      XLSXStyle.utils.book_append_sheet(wb, ws, safeSheetName(line))
    }

    const summaryAoa = [
      ['TỔNG HỢP SẢN LƯỢNG SC PAD'],
      [],
      ['Doanh thu và chi phí MNR'],
      ['Khoản mục', '', 'Giá trị', 'Ghi chú'],
      ['Thu từ hãng tàu', '', round2(grandHang)],
      ['Trả cho Hưng Thịnh', '', round2(grandHung)],
      ['Chi phí nhân công vệ sinh và survey', '', 22500000],
      ['Lợi nhuận MNR', '', ''],
      [],
      ['Sản lượng, năng suất, chi phí mỗi cont'],
      ['Chỉ tiêu', '', 'Giá trị', 'Ghi chú'],
      ['Số cont sửa', '', grandCount],
      ['Năng suất ngày (cont/ngày)', '', grandCount ? Math.trunc(grandCount / 7) : 0],
      ['Chi phí bình quân/cont', '', grandCount ? round2(grandHang / grandCount) : 0],
    ]
    const summaryWs = XLSXStyle.utils.aoa_to_sheet(summaryAoa)
    summaryWs['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: 9, c: 0 }, e: { r: 9, c: 3 } },
    ]
    summaryWs['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 18 }, { wch: 24 }]
    styleSheet(summaryWs, { yellowRows: [0, 3, 7, 10], rightCols: [2] })
    XLSXStyle.utils.book_append_sheet(wb, summaryWs, 'TỔNG')

    return wb
  }

  const createOutput = async () => {
    const chosen = selectedRowKeys.length
      ? items.filter(i => selectedRowKeys.includes(i._id))
      : (rangeLabel ? rangeRows : filtered)
    if (!chosen.length) {
      message.warning('Chưa có dữ liệu để tạo sản lượng')
      return
    }
    const period = rangeLabel
      ? `${dateRange[0].format('DD.MM')} - ${dateRange[1].format('DD.MM')}`
      : derivePeriod(chosen)

    setCreatingOutput(true)
    try {
      const res = await api.post('/sl-sc-pad/output', {
        ids: chosen.map(item => item._id),
        period,
      })
      const producedIds = new Set(chosen.map(item => item._id))
      setItems(prev => prev.filter(item => !producedIds.has(item._id)))
      setSelectedRowKeys([])
      setHistoryDetail(res.data)
      setSelectedHistoryId(res.data._id)
      setPeriodSearch('')
      setPeriodDirty(false)
      setPeriodOpen(true)
      fetchHistory()
      fetchProduced()
      message.success(`Đã tạo sản lượng ${res.data.count} container và lưu vào lịch sử`)
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi tạo sản lượng')
    } finally {
      setCreatingOutput(false)
    }
  }

  const openHistory = () => {
    setHistoryOpen(true)
    fetchHistory()
  }

  const downloadHistory = () => {
    if (!historyDetail?.items?.length) return
    const period = historyDetail.period || derivePeriod(historyDetail.items)
    const wb = buildWorkbook(historyDetail.items, period)
    XLSXStyle.writeFile(wb, `TH BÁO CÁO SC TUAN DEPOT ${period}.xlsx`)
    message.success(`Đã tải file sản lượng (${historyDetail.items.length} dòng)`)
  }

  const periodTotals = useMemo(() => {
    const list = historyDetail?.items || []
    return list.reduce((acc, item) => {
      acc.tienHang += Number(item.tienHang) || 0
      acc.tienHungThinh += Number(item.tienHungThinh) || 0
      return acc
    }, { tienHang: 0, tienHungThinh: 0 })
  }, [historyDetail])

  const periodFiltered = useMemo(() => {
    const list = historyDetail?.items || []
    const q = periodSearch.trim().toUpperCase()
    const indexed = list.map((item, index) => ({ ...item, _index: index }))
    if (!q) return indexed
    return indexed.filter(item =>
      String(item.containerNo || '').toUpperCase().includes(q) ||
      String(item.line || '').toUpperCase().includes(q) ||
      String(item.sztp || '').toUpperCase().includes(q) ||
      String(item.remark || '').toUpperCase().includes(q)
    )
  }, [historyDetail, periodSearch])

  const openItemEdit = (record) => {
    setItemEditIndex(record._index)
    itemEditForm.setFieldsValue({
      containerNo: record.containerNo || '',
      line: record.line || '',
      sztp: record.sztp || '',
      ngaySc: dateToDayjs(record.ngaySc),
      tienHang: Number(record.tienHang) || 0,
      tienHungThinh: Number(record.tienHungThinh) || 0,
      remark: record.remark || '',
    })
    setItemEditOpen(true)
  }

  const handleSaveItemEdit = async () => {
    if (itemEditIndex === null) return
    try {
      const values = await itemEditForm.validateFields()
      const nextItem = {
        containerNo: String(values.containerNo || '').trim().toUpperCase(),
        line: String(values.line || '').trim().toUpperCase(),
        sztp: String(values.sztp || '').trim(),
        ngaySc: values.ngaySc ? values.ngaySc.format('DD/MM/YYYY') : '',
        tienHang: Number(values.tienHang) || 0,
        tienHungThinh: Number(values.tienHungThinh) || 0,
        remark: String(values.remark || '').trim(),
      }
      setHistoryDetail(prev => {
        if (!prev) return prev
        const items = [...(prev.items || [])]
        items[itemEditIndex] = nextItem
        return { ...prev, items }
      })
      setPeriodDirty(true)
      setItemEditOpen(false)
      setItemEditIndex(null)
    } catch (e) {
      if (e.response) message.error(e.response.data?.message || 'Lỗi lưu dữ liệu')
    }
  }

  const handleRemoveItem = (index) => {
    setHistoryDetail(prev => {
      if (!prev) return prev
      return { ...prev, items: (prev.items || []).filter((_, i) => i !== index) }
    })
    setPeriodDirty(true)
  }

  const savePeriodChanges = async () => {
    if (!historyDetail?._id) return
    setPeriodSaving(true)
    try {
      const res = await api.put(`/sl-sc-pad/history/${historyDetail._id}`, {
        items: historyDetail.items || [],
        period: historyDetail.period || '',
      })
      setHistoryDetail(res.data)
      setPeriodDirty(false)
      fetchHistory()
      message.success('Đã cập nhật kỳ sản lượng')
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi lưu kỳ sản lượng')
    } finally {
      setPeriodSaving(false)
    }
  }

  const handleDeletePeriod = async () => {
    if (!historyDetail?._id) return
    setPeriodDeleting(true)
    try {
      await api.delete(`/sl-sc-pad/history/${historyDetail._id}`)
      message.success('Đã xóa kỳ sản lượng. Các container được trả về danh sách SC PAD.')
      closePeriod()
      setSelectedHistoryId(null)
      fetchHistory()
      fetchItems()
      fetchProduced()
    } catch (e) {
      message.error(e.response?.data?.message || 'Lỗi xóa kỳ sản lượng')
    } finally {
      setPeriodDeleting(false)
    }
  }

  const renderPreviewMoney = (row, field, updateField, oldField, hasField) => {
    const value = Number(row[field]) || 0
    const oldValue = row[oldField]
    const changed = hasField && oldValue !== null && oldValue !== undefined &&
      Math.abs(value - oldValue) > 0.004
    return (
      <div>
        <InputNumber
          size="small"
          min={0}
          step={0.01}
          value={value}
          disabled={!hasField}
          onChange={val => updatePreviewRow(row._key, { [field]: Number(val) || 0, [updateField]: true })}
          style={{ width: '100%' }}
        />
        {changed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>Cũ: {formatNumber(oldValue)}</Tag>
            <Switch
              size="small"
              checked={row[updateField] !== false}
              onChange={checked => updatePreviewRow(row._key, { [updateField]: checked })}
            />
            <span style={{ fontSize: 11 }}>{row[updateField] !== false ? 'Cập nhật' : 'Giữ cũ'}</span>
          </div>
        )}
      </div>
    )
  }

  const previewColumns = [
    { title: 'STT', key: 'stt', width: 55, render: (_, __, i) => i + 1 },
    {
      title: 'CONT', dataIndex: 'containerNo', key: 'containerNo', width: 150,
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={e => updatePreviewRow(row._key, { containerNo: e.target.value.toUpperCase() })}
        />
      ),
    },
    {
      title: 'LINE', dataIndex: 'line', key: 'line', width: 90,
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={e => updatePreviewRow(row._key, { line: e.target.value.toUpperCase() })}
        />
      ),
    },
    {
      title: 'SZTP', dataIndex: 'sztp', key: 'sztp', width: 90,
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={e => updatePreviewRow(row._key, { sztp: e.target.value })}
        />
      ),
    },
    {
      title: 'NGÀY SC', dataIndex: 'ngaySc', key: 'ngaySc', width: 140,
      render: (v, row) => (
        <DatePicker
          size="small"
          format="DD/MM/YYYY"
          value={dateToDayjs(v)}
          onChange={d => updatePreviewRow(row._key, { ngaySc: d ? d.format('DD/MM/YYYY') : '' })}
          style={{ width: '100%' }}
          allowClear
        />
      ),
    },
    {
      title: 'TIỀN HÃNG TÀU - PAD', dataIndex: 'tienHang', key: 'tienHang', width: 200,
      onCell: row => ({ className: Number(row.tienHang) === 0 ? 'slscpad-zero-cell' : '' }),
      render: (_, row) => renderPreviewMoney(row, 'tienHang', 'updateTienHang', 'oldTienHang', row.hasTienHang !== false),
    },
    {
      title: 'TIỀN HƯNG THỊNH - PAD', dataIndex: 'tienHungThinh', key: 'tienHungThinh', width: 220,
      onCell: row => ({ className: Number(row.tienHungThinh) === 0 ? 'slscpad-zero-cell' : '' }),
      render: (_, row) => renderPreviewMoney(row, 'tienHungThinh', 'updateTienHungThinh', 'oldTienHungThinh', row.hasTienHungThinh !== false),
    },
    {
      title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 180,
      render: (v, row) => (
        <Input
          size="small"
          value={v}
          onChange={e => updatePreviewRow(row._key, { remark: e.target.value })}
        />
      ),
    },
    {
      title: 'TRẠNG THÁI', key: 'status', width: 240, align: 'center',
      render: (_, row) => {
        const noMoneyNote = row.fileHasMoney === false ? (
          <Tag color="default" style={{ margin: 0 }}>File không có cột tiền - giữ tiền cũ</Tag>
        ) : null
        if (isRowProduced(row)) {
          const info = producedInfoOf(row)
          return (
            <Space direction="vertical" size={4}>
              <Tag color="purple" style={{ margin: 0 }}>Đã có trong sản lượng trước</Tag>
              <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                Kỳ: {info?.period || '-'}
              </span>
              <Select
                size="small"
                value={row.duplicateMode || 'new'}
                onChange={val => updatePreviewRow(row._key, { duplicateMode: val })}
                options={[
                  { value: 'new', label: 'Tạo mới (đưa vào kỳ mới)' },
                  { value: 'update', label: 'Cập nhật kỳ cũ' },
                  { value: 'skip', label: 'Bỏ qua' },
                ]}
                style={{ width: 190 }}
              />
              {noMoneyNote}
            </Space>
          )
        }
        if (isRowExisting(row)) {
          return (
            <Space direction="vertical" size={2}>
              <Tag color="orange" style={{ margin: 0 }}>Đã có trong báo cáo</Tag>
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
              {row.updateExisting !== false && noMoneyNote}
            </Space>
          )
        }
        return (
          <Space direction="vertical" size={2}>
            <Tag color="green">Mới</Tag>
            {noMoneyNote}
          </Space>
        )
      },
    },
    {
      title: '', key: 'action', width: 55, align: 'center',
      render: (_, row) => (
        <Tooltip title="Xóa khỏi bản xem trước">
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => removePreviewRow(row._key)}
          />
        </Tooltip>
      ),
    },
  ]

  const columns = [
    { title: 'STT', key: 'stt', width: 60, fixed: 'left', render: (_, __, i) => i + 1 },
    { title: 'CONT', dataIndex: 'containerNo', key: 'containerNo', width: 150, fixed: 'left' },
    {
      title: 'LINE', dataIndex: 'line', key: 'line', width: 90, align: 'center',
      render: v => (v ? <Tag color="blue">{v}</Tag> : '-'),
    },
    { title: 'SZTP', dataIndex: 'sztp', key: 'sztp', width: 90, align: 'center' },
    { title: 'NGÀY SC', dataIndex: 'ngaySc', key: 'ngaySc', width: 120, align: 'center' },
    {
      title: 'SỐ TIỀN HÃNG TÀU - PAD', dataIndex: 'tienHang', key: 'tienHang',
      width: 180, align: 'right',
      onCell: record => ({ className: Number(record.tienHang) === 0 ? 'slscpad-zero-cell' : '' }),
      render: v => formatNumber(v),
    },
    {
      title: 'SỐ TIỀN HƯNG THỊNH - PAD (-VAT)', dataIndex: 'tienHungThinh', key: 'tienHungThinh',
      width: 220, align: 'right',
      onCell: record => ({ className: Number(record.tienHungThinh) === 0 ? 'slscpad-zero-cell' : '' }),
      render: v => formatNumber(v),
    },
    {
      title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 220,
      ellipsis: true, render: v => (v ? <Tooltip title={v}>{v}</Tooltip> : '-'),
    },
    {
      title: 'Hành động', key: 'action', width: 90, fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Tooltip title="Sửa chi tiết">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Xóa dòng này?"
            onConfirm={() => handleDelete(record._id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Tooltip title="Xóa">
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const outputColumns = [
    { title: 'STT', key: 'stt', width: 55, render: (_, record, i) => record._index + 1 || i + 1 },
    { title: 'CONT', dataIndex: 'containerNo', key: 'containerNo', width: 140 },
    {
      title: 'LINE', dataIndex: 'line', key: 'line', width: 80, align: 'center',
      render: v => (v ? <Tag color="blue">{v}</Tag> : '-'),
    },
    { title: 'SZTP', dataIndex: 'sztp', key: 'sztp', width: 80, align: 'center' },
    { title: 'NGÀY SC', dataIndex: 'ngaySc', key: 'ngaySc', width: 110, align: 'center' },
    {
      title: 'TIỀN HÃNG TÀU - PAD', dataIndex: 'tienHang', key: 'tienHang',
      width: 150, align: 'right', render: v => formatNumber(v),
    },
    {
      title: 'TIỀN HƯNG THỊNH - PAD', dataIndex: 'tienHungThinh', key: 'tienHungThinh',
      width: 170, align: 'right', render: v => formatNumber(v),
    },
    {
      title: 'REMARK', dataIndex: 'remark', key: 'remark', width: 200,
      ellipsis: true, render: v => (v ? <Tooltip title={v}>{v}</Tooltip> : '-'),
    },
    {
      title: 'Hành động', key: 'action', width: 90, fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Tooltip title="Sửa CONT">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openItemEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="Xóa dòng này khỏi kỳ?"
            onConfirm={() => handleRemoveItem(record._index)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Tooltip title="Xóa dòng">
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const exportCount = selectedRowKeys.length || (rangeLabel ? rangeRows.length : filtered.length)

  const listSource = useMemo(() => {
    if (selectedRowKeys.length) {
      const selectedSet = new Set(selectedRowKeys)
      return items.filter(item => selectedSet.has(item._id))
    }
    return filtered
  }, [items, filtered, selectedRowKeys])

  const buildListClipboard = (rows) => {
    const header = ['STT', 'CONT', 'LINE', 'SZTP', 'NGÀY SC', 'TIỀN HÃNG TÀU - PAD', 'TIỀN HƯNG THỊNH - PAD', 'REMARK']
    const lines = [header.join('\t')]
    rows.forEach((row, index) => {
      lines.push([
        index + 1,
        row.containerNo || '',
        row.line || '',
        row.sztp || '',
        row.ngaySc || '',
        Number(row.tienHang) || 0,
        Number(row.tienHungThinh) || 0,
        row.remark || '',
      ].join('\t'))
    })
    return lines.join('\n')
  }

  const handleCopyList = async () => {
    if (!listSource.length) {
      message.warning('Không có dữ liệu để copy')
      return
    }
    const text = buildListClipboard(listSource)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    message.success(`Đã copy ${listSource.length} dòng`)
  }

  const handleSelectAllFiltered = () => {
    setSelectedRowKeys(filtered.map(item => item._id))
  }

  const handleExportList = () => {
    if (!listSource.length) {
      message.warning('Không có dữ liệu để xuất Excel')
      return
    }
    const totalHang = round2(listSource.reduce((sum, row) => sum + (Number(row.tienHang) || 0), 0))
    const totalHung = round2(listSource.reduce((sum, row) => sum + (Number(row.tienHungThinh) || 0), 0))
    const aoa = [
      ['DANH SÁCH SC PAD'],
      ['STT', 'CONT', 'LINE', 'SZTP', 'NGÀY SC', 'TIỀN HÃNG TÀU - PAD', 'TIỀN HƯNG THỊNH - PAD', 'REMARK'],
      ...listSource.map((row, index) => [
        index + 1,
        row.containerNo || '',
        row.line || '',
        row.sztp || '',
        row.ngaySc || '',
        round2(row.tienHang),
        round2(row.tienHungThinh),
        row.remark || '',
      ]),
      ['TỔNG', '', '', '', '', totalHang, totalHung, ''],
    ]
    const ws = XLSXStyle.utils.aoa_to_sheet(aoa)
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 4 } },
    ]
    ws['!cols'] = [
      { wch: 6 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 20 }, { wch: 34 }, { wch: 30 },
    ]
    styleSheet(ws, { yellowRows: [0, 1, aoa.length - 1], rightCols: [5, 6] })
    const wb = XLSXStyle.utils.book_new()
    XLSXStyle.utils.book_append_sheet(wb, ws, 'SC PAD')
    XLSXStyle.writeFile(wb, `DANH SACH SC PAD ${dayjs().format('DD.MM.YYYY_HHmm')}.xlsx`)
    message.success(`Đã xuất Excel ${listSource.length} dòng`)
  }

  return (
    <Space direction="vertical" size="middle" className="w-full">
      {!historyOpen && (
        <>
      <Card
        title={<Space><DollarOutlined style={{ color: '#fa8c16' }} /><span>SL SC PAD</span></Space>}
        extra={fileName ? <Tag color="orange">{fileName}</Tag> : null}
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
                Click hoặc kéo thả file báo cáo SC
              </p>
              <p className="ant-upload-hint" style={{ marginBottom: 0 }}>
                Có bản xem trước — kiểm tra CONT đã có và chọn cập nhật
              </p>
            </Upload.Dragger>
          </Col>
          <Col xs={24} md={15}>
            <Space wrap className="w-full">
              <Input
                placeholder="Tìm theo CONT, LINE hoặc SZTP..."
                prefix={<SearchOutlined />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear
                style={{ width: 280 }}
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="Lọc LINE"
                value={lineFilter}
                onChange={setLineFilter}
                options={lineOptions}
                maxTagCount="responsive"
                style={{ minWidth: 160, maxWidth: 280 }}
              />
              <DatePicker.RangePicker
                format="DD/MM/YYYY"
                placeholder={['NGÀY SC từ', 'đến']}
                value={dateRange}
                onChange={setDateRange}
                allowClear
                style={{ width: 280 }}
              />
              <Button
                icon={<DownloadOutlined />}
                onClick={createOutput}
                disabled={!exportCount}
                loading={creatingOutput}
                style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
              >
                Tạo sản lượng ({exportCount})
              </Button>
              <Button icon={<HistoryOutlined />} onClick={openHistory}>
                Lịch sử ({historyList.length})
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={handleCopyList}
                disabled={!listSource.length}
              >
                Copy ({listSource.length})
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportList}
                disabled={!listSource.length}
              >
                Xuất Excel ({listSource.length})
              </Button>
              <Button
                icon={<CheckSquareOutlined />}
                onClick={handleSelectAllFiltered}
                disabled={!filtered.length}
              >
                Chọn tất cả ({filtered.length})
              </Button>
              {selectedRowKeys.length > 0 && (
                <>
                  <Tag color="orange">Đã chọn: {selectedRowKeys.length}</Tag>
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
            </Space>
            <Row gutter={16} className="mt-3">
              <Col span={8}>
                <Statistic title="Số container" value={filtered.length} />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Tiền hãng tàu - PAD"
                  value={round2(totals.tienHang)}
                  formatter={v => formatNumber(v)}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Tiền Hưng Thịnh - PAD"
                  value={round2(totals.tienHungThinh)}
                  formatter={v => formatNumber(v)}
                />
              </Col>
            </Row>
            {rangeLabel && (
              <Alert
                className="mt-3"
                type="success"
                showIcon
                message={`Khung ${rangeLabel}: ${rangeRows.length} container sẽ được tạo sản lượng và chuyển vào lịch sử khi bấm "Tạo sản lượng".`}
              />
            )}
          </Col>
        </Row>
        {uploading && <Alert className="mt-3" type="info" showIcon message="Đang đọc file..." />}
      </Card>

      <Card
        title={<Space><FileExcelOutlined style={{ color: '#fa8c16' }} /><span>Danh sách SC PAD</span></Space>}
        extra={<Tag color="cyan">Tổng: {items.length}</Tag>}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          size="small"
          bordered
          scroll={{ x: 1320 }}
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
          locale={{ emptyText: 'Chưa có dữ liệu. Tải file báo cáo SC để bắt đầu.' }}
        />
      </Card>
        </>
      )}

      <Modal
        title={<Space><FileExcelOutlined style={{ color: '#fa8c16' }} /><span>Xem trước: {previewFileName}</span></Space>}
        open={previewOpen}
        onCancel={closePreview}
        width="100vw"
        className="slscpad-preview-modal"
        style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
        styles={{ body: { height: 'calc(100vh - 130px)', overflowY: 'auto' } }}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={closePreview}>Hủy</Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            loading={previewSaving}
            disabled={!previewStats.saveCount}
            onClick={savePreview}
          >
            Lưu {previewStats.saveCount} dòng vào báo cáo
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          icon={<EditOutlined />}
          className="mb-3"
          message="Có thể sửa trực tiếp CONT, LINE, SZTP, NGÀY SC, số tiền và REMARK. Nếu tiền trong file khác tiền cũ, ngay dưới ô tiền sẽ hiện giá trị cũ kèm nút Cập nhật/Giữ cũ. Dòng đã có trong báo cáo hiện màu cam; dòng đã nằm trong kỳ sản lượng trước hiện màu tím — chọn Tạo mới, Cập nhật kỳ cũ hoặc Bỏ qua."
        />
        {previewNoMoney && (
          <Alert
            type="warning"
            showIcon
            className="mb-3"
            message="File không có 2 cột tiền (TIỀN HÃNG TÀU - PAD / TIỀN HƯNG THỊNH - PAD)"
            description="Hai cột tiền sẽ giữ nguyên giá trị hiện có; dòng mới sẽ lưu với giá trị 0. File cập nhật có 2 cột tiền sẽ tự động bật lại ô nhập và hiện nút cập nhật ở từng cột tiền."
          />
        )}
        <Space wrap className="mb-3">
          <Tag>File: {previewStats.total}</Tag>
          <Tag color="green">Mới: {previewStats.fresh}</Tag>
          <Tag color="orange">Đã có trong báo cáo: {previewStats.existing}</Tag>
          <Tag color="purple">Đã có trong kỳ trước: {previewStats.produced}</Tag>
          <Tag color="blue">Đã chọn: {previewStats.selected}</Tag>
          <Tag color="cyan">Sẽ lưu: {previewStats.saveCount}</Tag>
        </Space>
        <Table
          rowKey="_key"
          columns={previewColumns}
          dataSource={previewRows}
          size="small"
          bordered
          scroll={{ x: 1500, y: 'max(240px, calc(100vh - 430px))' }}
          rowSelection={{
            selectedRowKeys: previewSelectedKeys,
            onChange: setPreviewSelectedKeys,
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
        title={<Space><EditOutlined style={{ color: '#fa8c16' }} /><span>Sửa chi tiết container{editing ? ` — ${editing.containerNo}` : ''}</span></Space>}
        open={editOpen}
        onCancel={() => { setEditOpen(false); setEditing(null) }}
        onOk={handleSaveEdit}
        okText="Cập nhật"
        cancelText="Hủy"
        confirmLoading={editSaving}
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={640}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="containerNo" label="CONT" rules={[{ required: true, message: 'Nhập số container' }]}>
                <Input placeholder="VD: MEDU8605069" onInput={e => { e.target.value = e.target.value.toUpperCase() }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="line" label="LINE">
                <Input placeholder="VD: MSC" onInput={e => { e.target.value = e.target.value.toUpperCase() }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="sztp" label="SZTP">
                <Input placeholder="VD: 45G1" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ngaySc" label="NGÀY SC">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tienHang" label="TIỀN HÃNG TÀU - PAD">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="tienHungThinh" label="TIỀN HƯNG THỊNH - PAD">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="remark" label="REMARK">
                <Input placeholder="Ghi chú..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={
          <div className="flex items-center" style={{ gap: 8 }}>
            <HistoryOutlined style={{ color: '#fa8c16', fontSize: 20 }} />
            <span style={{ fontWeight: 600 }}>CÁC KỲ ĐÃ TẠO</span>
            <Tag color="orange" style={{ margin: 0 }}>{historyList.length} kỳ</Tag>
          </div>
        }
        open={historyOpen}
        onCancel={() => setHistoryOpen(false)}
        width={980}
        centered
        destroyOnHidden
        footer={<Button onClick={() => setHistoryOpen(false)}>Đóng</Button>}
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto', paddingTop: 8 } }}
      >
        <Alert
          type="info"
          showIcon
          className="mb-3"
          message="Nhấn vào một kỳ để mở chi tiết. Trong chi tiết có thể tìm số CONT, sửa CONT và xóa kỳ đã tạo."
        />
        {historyLoading ? (
          <div className="text-center" style={{ padding: '40px 0' }}><Spin /></div>
        ) : historyList.length ? (
          <Row gutter={[12, 12]}>
            {historyList.map(item => {
              const active = item._id === selectedHistoryId
              return (
                <Col xs={24} md={12} xl={8} key={item._id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openPeriod(item._id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') openPeriod(item._id)
                    }}
                    style={{
                      border: `1px solid ${active ? '#fa8c16' : '#f0f0f0'}`,
                      background: active ? '#fff7e6' : '#fff',
                      borderRadius: 10,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: active ? '0 2px 10px rgba(250,140,22,0.18)' : 'none',
                      height: '100%',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ fontWeight: 600, color: active ? '#d46b08' : '#262626' }}>
                        {item.period || 'Không rõ kỳ'}
                      </span>
                      <Tag color={active ? 'orange' : 'blue'} style={{ margin: 0 }}>
                        {item.count} cont
                      </Tag>
                    </div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                      {item.createdAt ? dayjs(item.createdAt).format('HH:mm DD/MM/YYYY') : '-'}
                    </div>
                    <div className="flex flex-wrap" style={{ gap: 10, marginTop: 6, fontSize: 12 }}>
                      <span style={{ color: '#595959' }}>
                        Hãng: <b style={{ color: '#389e0d' }}>{formatNumber(item.totalHang)}</b>
                      </span>
                      <span style={{ color: '#595959' }}>
                        HT: <b style={{ color: '#531dab' }}>{formatNumber(item.totalHung)}</b>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: active ? '#d46b08' : '#1677ff', marginTop: 8, fontWeight: 500 }}>
                      Xem chi tiết →
                    </div>
                  </div>
                </Col>
              )
            })}
          </Row>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có kỳ sản lượng nào" />
        )}
      </Modal>

      <Modal
        title={
          <div className="flex items-center" style={{ gap: 8 }}>
            <FileExcelOutlined style={{ color: '#fa8c16', fontSize: 20 }} />
            <span style={{ fontWeight: 600 }}>
              CHI TIẾT KỲ {historyDetail?.period || ''}
            </span>
            <Tag color="orange" style={{ margin: 0 }}>
              {(historyDetail?.items || []).length} cont
            </Tag>
          </div>
        }
        open={periodOpen}
        onCancel={closePeriod}
        width={1240}
        centered
        destroyOnHidden
        footer={[
          <Button key="close" onClick={closePeriod}>Đóng</Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            loading={periodSaving}
            disabled={!periodDirty}
            onClick={savePeriodChanges}
          >
            Lưu thay đổi
          </Button>,
        ]}
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto', paddingTop: 8 } }}
      >
        {historyDetailLoading ? (
          <div className="flex items-center justify-center" style={{ minHeight: 300 }}>
            <Spin size="large" />
          </div>
        ) : historyDetail ? (
          <div>
            <div
              style={{
                background: 'linear-gradient(135deg, #fff7e6 0%, #fff1f0 100%)',
                border: '1px solid #ffe7ba',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: 0.5, color: '#8c8c8c', fontWeight: 600 }}>
                    KỲ SẢN LƯỢNG
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#d46b08', lineHeight: 1.3 }}>
                    {historyDetail.period || '-'}
                  </div>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                    Tạo lúc {historyDetail.createdAt ? dayjs(historyDetail.createdAt).format('HH:mm DD/MM/YYYY') : '-'}
                  </div>
                </div>
                <Space wrap>
                  <Button
                    icon={<DownloadOutlined />}
                    onClick={downloadHistory}
                    style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
                  >
                    Tải Excel
                  </Button>
                  <Popconfirm
                    title="Xóa kỳ sản lượng này?"
                    description="Các container trong kỳ sẽ được trả về danh sách SC PAD."
                    onConfirm={handleDeletePeriod}
                    okText="Xóa kỳ"
                    okButtonProps={{ danger: true, loading: periodDeleting }}
                    cancelText="Hủy"
                  >
                    <Button danger icon={<DeleteOutlined />}>Xóa kỳ</Button>
                  </Popconfirm>
                </Space>
              </div>
              <Row gutter={12} style={{ marginTop: 16 }}>
                <Col span={8}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>Số container</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#1677ff' }}>
                      {(historyDetail.items || []).length}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>Tiền hãng tàu</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#389e0d' }}>
                      {formatNumber(periodTotals.tienHang)}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>Tiền Hưng Thịnh</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: '#531dab' }}>
                      {formatNumber(periodTotals.tienHungThinh)}
                    </div>
                  </div>
                </Col>
              </Row>
            </div>

            <Space wrap className="mt-3 mb-3" style={{ marginTop: 12 }}>
              <Input
                placeholder="Tìm số CONT, LINE, SZTP..."
                prefix={<SearchOutlined />}
                value={periodSearch}
                onChange={e => setPeriodSearch(e.target.value)}
                allowClear
                style={{ width: 300 }}
              />
              <Tag color="blue">Hiển thị: {periodFiltered.length}/{(historyDetail.items || []).length}</Tag>
              {periodDirty && <Tag color="red">Có thay đổi chưa lưu</Tag>}
            </Space>

            <Table
              rowKey={record => `${record.line}|${record.containerNo}|${record._index}`}
              columns={outputColumns}
              dataSource={periodFiltered}
              size="small"
              bordered
              rowClassName={record => (Number(record.tienHang) === 0 ? 'slscpad-zero-row' : '')}
              scroll={{ x: 1100, y: 360 }}
              pagination={{
                pageSize: 10,
                size: 'small',
                showSizeChanger: true,
                showTotal: t => `Tổng ${t} container`,
                pageSizeOptions: [10, 20, 50, 100],
              }}
              locale={{ emptyText: periodSearch ? 'Không tìm thấy container phù hợp' : 'Kỳ này không có dữ liệu' }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center" style={{ minHeight: 300 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tải được dữ liệu kỳ" />
          </div>
        )}
      </Modal>

      <Modal
        title={<Space><EditOutlined style={{ color: '#fa8c16' }} /><span>Sửa CONT trong kỳ</span></Space>}
        open={itemEditOpen}
        onCancel={() => { setItemEditOpen(false); setItemEditIndex(null) }}
        onOk={handleSaveItemEdit}
        okText="Cập nhật"
        cancelText="Hủy"
        okButtonProps={{ icon: <SaveOutlined /> }}
        width={640}
        destroyOnHidden
      >
        <Form form={itemEditForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="containerNo" label="CONT" rules={[{ required: true, message: 'Nhập số container' }]}>
                <Input placeholder="VD: MEDU8605069" onInput={e => { e.target.value = e.target.value.toUpperCase() }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="line" label="LINE">
                <Input placeholder="VD: MSC" onInput={e => { e.target.value = e.target.value.toUpperCase() }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="sztp" label="SZTP">
                <Input placeholder="VD: 45G1" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ngaySc" label="NGÀY SC">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="tienHang" label="TIỀN HÃNG TÀU - PAD">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="tienHungThinh" label="TIỀN HƯNG THỊNH - PAD">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="remark" label="REMARK">
                <Input placeholder="Ghi chú..." />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Space>
  )
}

export default SlScPad
