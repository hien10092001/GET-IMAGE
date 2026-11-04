import { useState, useEffect, useRef } from 'react'
import { Table, Button, Input, Select, AutoComplete, Space, Tag, Modal, Form, Row, Col, Card, DatePicker, Radio, Divider, Popconfirm, message, Tooltip, Upload, Tabs, Checkbox, Popover, Spin } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeOutlined, LockOutlined, UploadOutlined, UnlockOutlined, SearchOutlined, CopyOutlined, CheckCircleOutlined, FilterOutlined, SaveOutlined, ContainerOutlined, ShopOutlined, FileExcelOutlined, DownloadOutlined, MailOutlined } from '@ant-design/icons'
const XLSX = window.XLSX
import dayjs from 'dayjs'
import api from '../services/api'
import * as XLSXStyle from 'xlsx-js-style'
import dailyClassifyFileUrl from '../file/FILE PHAN LOẠI CẢNG DAILY 19.10.xlsx?url'
import recapMnrFileUrl from '../file/RECAP-MNR CANG 19.10.xlsx?url'

const productionFiles = [
  { name: 'FILE PHAN LOẠI CẢNG DAILY 19.10.xlsx', url: dailyClassifyFileUrl },
  { name: 'RECAP-MNR CANG 19.10.xlsx', url: recapMnrFileUrl },
]

const EMAIL_TEMPLATE_STORAGE_KEY = 'recapEmailTemplates'
const EMAIL_CC_STORAGE_KEY = 'recapEmailCc'
const EMAIL_ATTACHMENT_KEYS = ['daily', 'recap']
const DEFAULT_EMAIL_TEMPLATES = {
  dailySubject: 'FILE PHAN LOAI CANG DAILY {shortDate}',
  dailyBody: 'Gửi file báo cáo sản lượng ngày {date}.',
  recapSubject: 'RECAP-MNR CANG {shortDate}',
  recapBody: 'Gửi file báo cáo sản lượng ngày {date}.',
  bothSubject: 'BÁO CÁO SẢN LƯỢNG {shortDate}',
  bothBody: 'Gửi file báo cáo sản lượng ngày {date} gồm:\n- FILE PHAN LOAI CANG DAILY\n- RECAP-MNR CANG',
  signature: '',
}

const formatEmailTemplate = (template, values) =>
  String(template || '')
    .replace(/\{shortDate\}/g, values.shortDate || '')
    .replace(/\{date\}/g, values.date || '')
    .replace(/\{file\}/g, values.file || '')
    .replace(/\{type\}/g, values.type || '')

const workbookToBase64 = (wb) => {
  const arrayBuffer = XLSXStyle.write(wb, { type: 'array', bookType: 'xlsx' })
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const plainTextToHtml = (value) =>
  String(value || '')
    .split('\n')
    .map((line) => `<div>${escapeHtml(line) || '<br>'}</div>`)
    .join('')

const ensureHtml = (value) => {
  const text = String(value || '')
  if (!text.trim()) return ''
  return /<[a-z][\s\S]*>/i.test(text) ? text : plainTextToHtml(text)
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const inlineEditorImages = async (root) => {
  if (!root) return false
  let changed = false
  const images = [...root.querySelectorAll('img')]
  for (const image of images) {
    const rawSrc = image.getAttribute('src') || ''
    if (!rawSrc || /^data:/i.test(rawSrc) || /^cid:/i.test(rawSrc)) continue
    const src = rawSrc.startsWith('//') ? `https:${rawSrc}` : rawSrc
    try {
      const response = await fetch(src)
      if (!response.ok) continue
      const blob = await response.blob()
      if (!/^image\//i.test(blob.type)) continue
      image.setAttribute('src', await blobToDataUrl(blob))
      changed = true
    } catch {
      // cross-origin or auth-protected images cannot be read here
    }
  }
  return changed
}

const inlineHtmlBlobImages = async (html) => {
  if (!html || !/<img/i.test(html)) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const changed = await inlineEditorImages(doc.body)
  return changed ? doc.body.innerHTML : html
}

const RichTextEditor = ({ value, onChange, minHeight = 140 }) => {
  const ref = useRef(null)
  const fileInputRef = useRef(null)
  const selectedImageRef = useRef(null)
  const savedRangeRef = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || '')) {
      ref.current.innerHTML = value || ''
      selectedImageRef.current = null
      savedRangeRef.current = null
    }
  }, [value])
  const sync = () => onChange?.(ref.current?.innerHTML || '')
  const saveSelection = () => {
    const root = ref.current
    const selection = window.getSelection()
    if (!root || !selection || !selection.rangeCount) return
    const range = selection.getRangeAt(0)
    if (root.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange()
    }
  }
  const selectImage = (image) => {
    const current = selectedImageRef.current
    if (current && current !== image) current.style.outline = ''
    selectedImageRef.current = image || null
    if (image) image.style.outline = '2px solid #1677ff'
  }
  const insertImage = (src) => {
    const root = ref.current
    if (!root) return
    const image = document.createElement('img')
    image.setAttribute('src', src)
    const selection = window.getSelection()
    let range = savedRangeRef.current
    if (!range || !root.contains(range.commonAncestorContainer)) {
      range = null
      if (selection && selection.rangeCount && root.contains(selection.anchorNode)) {
        range = selection.getRangeAt(0).cloneRange()
      }
    }
    root.focus()
    if (range) {
      range.deleteContents()
      range.insertNode(image)
      const after = document.createRange()
      after.setStartAfter(image)
      after.collapse(true)
      if (selection) {
        selection.removeAllRanges()
        selection.addRange(after)
      }
      savedRangeRef.current = after.cloneRange()
    } else {
      root.appendChild(image)
    }
    sync()
  }
  const handlePickImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const target = selectedImageRef.current
      if (target && ref.current?.contains(target)) {
        target.setAttribute('src', reader.result)
        target.style.outline = ''
        selectedImageRef.current = null
        sync()
      } else {
        insertImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }
  const handleEditorClick = (e) => {
    if (e.target?.tagName === 'IMG') selectImage(e.target)
    else selectImage(null)
    saveSelection()
  }
  const handleEditorDoubleClick = (e) => {
    if (e.target?.tagName === 'IMG') {
      selectImage(e.target)
      handlePickImageFile()
    }
  }
  const handlePickImageFile = () => fileInputRef.current?.click()
  const handlePaste = (e) => {
    const items = [...(e.clipboardData?.items || [])]
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean)
    if (imageFiles.length) {
      e.preventDefault()
      imageFiles.forEach((file) => {
        const reader = new FileReader()
        reader.onload = () => {
          document.execCommand('insertImage', false, reader.result)
          sync()
        }
        reader.readAsDataURL(file)
      })
      return
    }
    setTimeout(async () => {
      if (await inlineEditorImages(ref.current)) sync()
    }, 0)
  }
  const hasSelectedImage = Boolean(selectedImageRef.current)
  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-1">
        <span className="text-xs text-gray-500">
          {hasSelectedImage ? 'Bấm nút để thay ảnh đang chọn' : 'Dán chữ ký, hoặc chèn ảnh/logo'}
        </span>
        <Button size="small" icon={<UploadOutlined />} onMouseDown={(e) => e.preventDefault()} onClick={handlePickImageFile}>
          {hasSelectedImage ? 'Thay ảnh/logo' : 'Chèn ảnh/logo'}
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickImage} />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onPaste={handlePaste}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        onClick={handleEditorClick}
        onDoubleClick={handleEditorDoubleClick}
        className="border rounded px-3 py-2 bg-white"
        style={{ minHeight, outline: 'none' }}
      />
    </div>
  )
}

const BORDER_THIN = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
}

const HEADER_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } },
  border: BORDER_THIN,
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}

const SECTION_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } },
  border: BORDER_THIN,
  alignment: { horizontal: 'left', vertical: 'center' },
}

const TITLE_STYLE = {
  font: { bold: true, sz: 13 },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } },
  alignment: { horizontal: 'center', vertical: 'center' },
}

const TOTAL_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'FFE699' } },
  border: BORDER_THIN,
  alignment: { horizontal: 'center', vertical: 'center' },
}

const BODY_STYLE = { border: BORDER_THIN, alignment: { vertical: 'center' } }
const CENTER_BODY_STYLE = { border: BORDER_THIN, alignment: { horizontal: 'center', vertical: 'center' } }

const styleRange = (ws, r0, c0, r1, c1, cb) => {
  for (let R = r0; R <= r1; R++) {
    ws['!rows'] = ws['!rows'] || []
    for (let C = c0; C <= c1; C++) {
      const addr = XLSXStyle.utils.encode_cell({ r: R, c: C })
      const existing = ws[addr]
      const value = cb ? cb(R, C, existing) : undefined
      const hasValue = existing && existing.v !== undefined && existing.v !== ''
      if (!hasValue && value === undefined) {
        ws[addr] = { t: 's', v: '' }
      }
      const target = ws[addr] || (ws[addr] = { t: 's', v: '' })
      const style = (typeof value === 'object' ? value : null)
      target.s = style
    }
  }
}

const RECAP_SIZE_COLS = ['20DC', '22RF', '40DC', '45RF']
const RECAP_SECTIONS = ['SURVEY', 'SURVEY + VỆ SINH', 'VỆ SINH', 'SỬA CHỮA']
const RECAP_VS_SURVEY_KEYWORDS = ['DVS', 'VS - DVS', 'DVSXB']

const resolveRecapLine = (item, remark) => {
  const line = String(item.shippingLine || '').toUpperCase().trim()
  if (/GDL/.test(normalizeForMatch(remark))) return 'GDL'
  return line
}

const remarkMatchesAnyExact = (remark, keys) => {
  const rem = normalizeForMatch(remark)
  return keys.some(k => normalizeForMatch(k) === rem)
}

const resolveRecapSection = (cls, remark, keywords) => {
  const repair = !!(cls.dsc || cls.choHtxnDvs || cls.sc) || remarkMatchesAnyLoose(remark, keywords.dsc)
  const vs = !!cls.vsDvs || remarkMatchesAnyLoose(remark, keywords.vs)
  const xuLi = !!cls.xuLiLai || remarkMatchesAnyLoose(remark, keywords.xuLi)
  const vsSurvey = remarkMatchesAnyExact(remark, RECAP_VS_SURVEY_KEYWORDS)
  const vsOnly = vs && !vsSurvey
  let section
  if (repair) section = vs || vsSurvey ? 'SURVEY + VỆ SINH' : 'SỬA CHỮA'
  else if (vsSurvey) section = 'SURVEY + VỆ SINH'
  else if (vsOnly) section = 'VỆ SINH'
  else section = 'SURVEY'
  if (/GDL/.test(normalizeForMatch(remark))) section = 'SURVEY'
  return { section, xuLi }
}

const RECAP_SIZE_OVERRIDES = {
  '22G1': '20DC',
  '22G0': '20DC',
  '2200': '20DC',
  '2230': '22RF',
  '22RF': '22RF',
  '4500': '40DC',
  '45G1': '40DC',
  '45G0': '40DC',
  '45RF': '45RF',
  '4530': '45RF',
}

const sizeGroupOf = (size) => {
  const s = String(size || '').toUpperCase().trim()
  const override = RECAP_SIZE_OVERRIDES[s]
  if (override) return override
  if (s.startsWith('45')) return '45RF'
  if (s.startsWith('40')) return '40DC'
  if (s.startsWith('22')) return '22RF'
  if (s.startsWith('2')) return '20DC'
  return ''
}

const buildRecapData = (items, classifyMap, keywords) => {
  const bucket = {}
  const lines = {}
  items.forEach(i => {
    const cn = String(i.containerNo || '').toUpperCase().trim()
    const cls = classifyMap[cn] || {}
    const remark = i.remark || cls.remark || ''
    const { section, xuLi } = resolveRecapSection(cls, remark, keywords)
    const line = resolveRecapLine(i, remark)
    const grp = sizeGroupOf(i.size)
    if (!line || !grp) return
    if (!lines[section]) lines[section] = []
    if (!lines[section].includes(line)) lines[section].push(line)
    const k = `${section}|${line}`
    if (!bucket[k]) bucket[k] = { counts: { '20DC': 0, '22RF': 0, '40DC': 0, '45RF': 0 }, xuLi: 0 }
    bucket[k].counts[grp] += 1
    if (xuLi) bucket[k].xuLi += 1
  })
  return { bucket, lines }
}

const insertSheetRows = (ws, at, count) => {
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.e.r; R >= at; R--) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const from = XLSX.utils.encode_cell({ r: R, c: C })
      const to = XLSX.utils.encode_cell({ r: R + count, c: C })
      if (ws[from]) ws[to] = ws[from]
      else delete ws[to]
    }
  }
  for (let R = at; R < at + count; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      delete ws[XLSX.utils.encode_cell({ r: R, c: C })]
    }
  }
  range.e.r += count
  ws['!ref'] = XLSX.utils.encode_range(range)
  if (ws['!merges']) {
    ws['!merges'] = ws['!merges'].map(m => {
      if (m.s.r >= at) return { s: { ...m.s, r: m.s.r + count }, e: { ...m.e, r: m.e.r + count } }
      if (m.e.r >= at) return { s: m.s, e: { ...m.e, r: m.e.r + count } }
      return m
    })
  }
  if (ws['!rows']) {
    const rows = ws['!rows']
    for (let i = rows.length - 1; i >= at; i--) rows[i + count] = rows[i]
    for (let i = at; i < at + count; i++) rows[i] = {}
  }
}

const addMissingRecapLines = (ws, aoa, titleRows, shiftData, classifyMap, keywords) => {
  for (let bi = titleRows.length - 1; bi >= 0; bi--) {
    const start = titleRows[bi]
    const end = bi < titleRows.length - 1 ? titleRows[bi + 1] - 1 : aoa.length - 1
    const items = shiftData[bi]?.items || shiftData[0]?.items || []
    const { lines } = buildRecapData(items, classifyMap, keywords)
    for (let R = end; R >= start; R--) {
      const label = String(aoa[R]?.[0] || '').trim().toUpperCase()
      if (!RECAP_SECTIONS.includes(label)) continue
      const needed = lines[label] || []
      if (!needed.length) continue
      let lastLine = R
      const existing = new Set()
      for (let R2 = R + 1; R2 <= end; R2++) {
        const lineName = String(aoa[R2]?.[0] || '').trim()
        const upper = lineName.toUpperCase()
        if (!lineName || RECAP_SECTIONS.includes(upper) || upper === 'TOTAL') break
        existing.add(upper)
        lastLine = R2
      }
      const missing = needed.filter(l => !existing.has(String(l).toUpperCase()))
      if (!missing.length) continue
      const insertAt = lastLine + 1
      insertSheetRows(ws, insertAt, missing.length)
      missing.forEach((name, i) => {
        ws[XLSX.utils.encode_cell({ r: insertAt + i, c: 0 })] = { t: 's', v: name }
      })
    }
  }
}

const normalizeForMatch = (str) => String(str || '').toUpperCase().trim().replace(/[.,;:!?()\-_]+/g, ' ').replace(/\s+/g, ' ')

const remarkMatchesAnyLoose = (remark, keys) => {
  if (!keys || !keys.length) return false
  const rem = normalizeForMatch(remark)
  if (!rem) return false
  const remTokens = rem.split(' ').filter(Boolean)
  const kwTokens = new Set()
  for (const k of keys) {
    const kw = normalizeForMatch(k)
    if (!kw) continue
    if (rem.includes(kw)) return true
    kw.split(' ').filter(Boolean).forEach(t => kwTokens.add(t))
  }
  return remTokens.every(t => kwTokens.has(t))
}

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
  const [lockType, setLockType] = useState('container')
  const [sanLuongTab, setSanLuongTab] = useState('san-luong-container')
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
  const [classifyOpen, setClassifyOpen] = useState(false)
  const [fileViewOpen, setFileViewOpen] = useState(false)
  const [fileViewLoading, setFileViewLoading] = useState(false)
  const [fileViewData, setFileViewData] = useState([])
  const [fileFillDate, setFileFillDate] = useState(dayjs())
  const fileViewDate = fileFillDate.format('DD.MM')
  const [fileFilling, setFileFilling] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailFile, setEmailFile] = useState(null)
  const [emailForm] = Form.useForm()
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false)
  const [emailTemplateForm] = Form.useForm()
  const [emailTemplates, setEmailTemplates] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EMAIL_TEMPLATE_STORAGE_KEY) || '{}')
      return { ...DEFAULT_EMAIL_TEMPLATES, ...saved }
    } catch {
      return DEFAULT_EMAIL_TEMPLATES
    }
  })
  const emailAttachmentKeys = EMAIL_ATTACHMENT_KEYS
  const [fileFillCounts, setFileFillCounts] = useState({ sang: null, toi: null })
  const [keywordsDsc, setKeywordsDsc] = useState([])
  const [keywordsXuLi, setKeywordsXuLi] = useState([])
  const [keywordsVs, setKeywordsVs] = useState([])
  const [kwInputDsc, setKwInputDsc] = useState('')
  const [kwInputXuLi, setKwInputXuLi] = useState('')
  const [kwInputVs, setKwInputVs] = useState('')
  const [classifySubmitting, setClassifySubmitting] = useState(false)
  const [savingKeywords, setSavingKeywords] = useState(false)
  const [selectedExportFields, setSelectedExportFields] = useState({
    containerNo: true,
    shippingLine: false,
    size: false,
    location: true,
    remark: true,
    bay: false,
    createdAt: false,
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
    params.type = lockType
    api.get('/locks', { params }).then(res => {
      setLocks(res.data)
    }).catch(() => {
      message.error('Lỗi tải dữ liệu')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchLocks() }, [search, filterDateRange, filterShift, filterShippingLine, filterSize, lockType])

  const handleLock = async () => {
    try {
      const existing = locks.find(l => l.date === lockDate && l.shift === lockShift)
      if (existing) {
        setCurrentLock(existing)
        setDetailOpen(true)
        return
      }
      const res = await api.post('/locks', { date: lockDate, shift: lockShift, items: [], type: lockType })
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

  const buildSheetPreview = (ws) => {
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    let rows = aoa.filter(r => r.some(c => String(c ?? '').trim() !== ''))
    let hi = rows.findIndex(r => r.filter(c => String(c ?? '').trim() !== '').length >= 2)
    if (hi < 0) hi = 0
    const header = rows[hi] || []
    let lastCol = header.length - 1
    while (lastCol >= 0 && String(header[lastCol] ?? '').trim() === '') lastCol--
    const cut = lastCol + 1
    const body = rows.slice(hi + 1).map(r => r.slice(0, cut))
    return {
      title: hi > 0 ? String(rows[0]?.[0] ?? '').trim() : '',
      header: header.slice(0, cut),
      body,
    }
  }

  const loadFileViewData = async (dateStr, isCancelled) => {
    setFileViewLoading(true)
    setFileFillCounts({ sang: null, toi: null })
    try {
      const [sang, toi] = await Promise.all([
        fetchFileItemsByShift(dateStr, 'sáng'),
        fetchFileItemsByShift(dateStr, 'tối'),
      ])
      if (isCancelled?.()) return
      setFileFillCounts({ sang: sang.length, toi: toi.length })
      let classifyInfo = { map: {}, keywords: { dsc: [], xuLi: [], vs: [] } }
      try { classifyInfo = await fetchClassifyInfo() } catch { classifyInfo = { map: {}, keywords: { dsc: [], xuLi: [], vs: [] } } }
      if (isCancelled?.()) return
      const dateLabel = dayjs(dateStr).format('DD/MM/YYYY')
      const data = []
      for (const f of productionFiles) {
        const res = await fetch(f.url)
        if (!res.ok) throw new Error(`Không tải được ${f.name}`)
        const wb = XLSXStyle.read(await res.arrayBuffer(), { type: 'array' })
        fillWorkbook(wb, f, sang, toi, classifyInfo, dateLabel)
        data.push({ ...f, sheets: wb.SheetNames.map(sn => ({ name: sn, ...buildSheetPreview(wb.Sheets[sn]) })) })
      }
      if (isCancelled?.()) return
      setFileViewData(data)
    } catch (e) {
      if (!isCancelled?.()) {
        message.error(e.message || 'Lỗi đọc file')
        setFileViewData([])
      }
    } finally {
      if (!isCancelled?.()) setFileViewLoading(false)
    }
  }

  const openFileView = (record) => {
    if (record?.date) setFileFillDate(dayjs(record.date))
    else {
      const latest = locks.find(l => l.items?.length)?.date || locks[0]?.date
      if (latest) setFileFillDate(dayjs(latest))
    }
    setFileViewOpen(true)
  }

  const renderFileSheetTable = (sheet, fileKey) => {
    const columns = sheet.header.map((h, i) => ({
      title: h === '' ? (i === 0 ? 'STT' : `C${i + 1}`) : String(h),
      dataIndex: i,
      key: `${fileKey}-${sheet.name}-${i}`,
      width: 140,
      ellipsis: true,
    }))
    const dataSource = sheet.body.map((r, ri) => {
      const row = { key: `${fileKey}-${sheet.name}-row-${ri}` }
      r.forEach((c, ci) => { row[ci] = c instanceof Date ? dayjs(c).format('DD/MM/YYYY HH:mm') : String(c ?? '') })
      return row
    })
    return (
      <div>
        {sheet.title ? (
          <div className="text-center font-semibold bg-yellow-200 border border-gray-400 py-2 mb-2">{sheet.title}</div>
        ) : null}
        <Table
          columns={columns}
          dataSource={dataSource}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content', y: 420 }}
          bordered
        />
      </div>
    )
  }

  const openFileDownload = (file) => {
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const fetchFileItemsByShift = async (dateStr, shift) => {
    const res = await api.get('/locks', { params: { dateFrom: dateStr, dateTo: dateStr, shift, type: lockType } })
    const locksOfShift = Array.isArray(res.data) ? res.data : [res.data]
    const items = locksOfShift.flatMap(l => l.items || [])
    const containerNos = [...new Set(items.map(i => i.containerNo).filter(Boolean))]
    let createdMap = {}
    if (containerNos.length) {
      try {
        const cres = await api.post('/containers/by-nos', { containerNos })
        ;(cres.data || []).forEach(c => {
          if (c.containerNo && c.createdAt) createdMap[c.containerNo] = c.createdAt
        })
      } catch {
        createdMap = {}
      }
    }
    return items.map(i => ({ ...i, _createdAt: createdMap[i.containerNo] || null }))
  }

  const fetchClassifyInfo = async () => {
    const [slRes, clsRes] = await Promise.all([
      api.get('/shipping-lists'),
      api.get('/classification').catch(() => ({ data: {} })),
    ])
    const map = {}
    flattenSlItems(slRes.data || []).forEach(i => {
      if (i.containerNo) map[String(i.containerNo).toUpperCase().trim()] = i
    })
    return {
      map,
      keywords: { dsc: clsRes.data?.dsc || [], xuLi: clsRes.data?.xuLi || [], vs: clsRes.data?.vs || [] },
    }
  }

  const clearSheetBody = (ws, fromRow) => {
    const range = XLSX.utils.decode_range(ws['!ref'])
    for (let R = fromRow; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        delete ws[XLSX.utils.encode_cell({ r: R, c: C })]
      }
    }
  }

  const fillRecapBlock = (ws, aoa, startRow, endRow, items, classifyMap, keywords, dateLabel, timeLabel) => {
    for (let R = startRow; R <= Math.min(startRow + 3, endRow); R++) {
      if (String(aoa[R]?.[0] || '').trim().startsWith('NGÀY')) {
        ws[XLSX.utils.encode_cell({ r: R, c: 0 })] = { t: 's', v: `NGÀY ${dateLabel} ${timeLabel}` }
        break
      }
    }
    const { bucket } = buildRecapData(items, classifyMap, keywords)
    const sizeColTotals = { '20DC': 0, '22RF': 0, '40DC': 0, '45RF': 0 }
    for (let R = startRow; R <= endRow; R++) {
      const label = String(aoa[R]?.[0] || '').trim().toUpperCase()
      if (label === 'TOTAL') {
        RECAP_SIZE_COLS.forEach((g, gi) => {
          const tv = sizeColTotals[g]
          ws[XLSX.utils.encode_cell({ r: R, c: 1 + gi })] = tv ? { t: 'n', v: tv } : { t: 's', v: '' }
        })
        continue
      }
      if (!RECAP_SECTIONS.includes(label)) continue
      const sizeColIdx = {}
      let remarkCol = -1
      for (let C = 1; C < (aoa[R]?.length || 0); C++) {
        const h = String(aoa[R][C]).trim().toUpperCase()
        if (RECAP_SIZE_COLS.includes(h)) sizeColIdx[h] = C
        else if (h === '' && remarkCol < 0 && Object.keys(sizeColIdx).length === RECAP_SIZE_COLS.length) remarkCol = C
      }
      if (remarkCol < 0) remarkCol = (Math.max(...Object.values(sizeColIdx)) ?? 0) + 1
      for (let R2 = R + 1; R2 <= endRow; R2++) {
        const lineName = String(aoa[R2]?.[0] || '').trim()
        const upper = lineName.toUpperCase()
        if (!lineName || RECAP_SECTIONS.includes(upper) || upper === 'TOTAL') break
        const entry = bucket[`${label}|${upper}`]
        RECAP_SIZE_COLS.forEach(g => {
          const c = sizeColIdx[g]
          if (c == null) return
          const addr = XLSX.utils.encode_cell({ r: R2, c })
          const v = entry ? entry.counts[g] : 0
          if (v) ws[addr] = { t: 'n', v }
          else ws[addr] = { t: 's', v: '' }
          if (entry && upper !== 'GDL') sizeColTotals[g] += entry.counts[g]
        })
        const rAddr = XLSX.utils.encode_cell({ r: R2, c: remarkCol })
        const rv = entry && entry.xuLi ? `${entry.xuLi} XU LI` : ''
        ws[rAddr] = { t: 's', v: rv }
      }
    }
  }

  const fillWorkbook = (wb, file, sang, toi, { map: classifyMap, keywords }, dateLabel) => {
    if (file.name.includes('PHAN LOẠI')) {
      const setupSheet = (sheetName, title, items) => {
        const ws = wb.Sheets[sheetName]
        if (!ws) return
        ws['A1'] = { t: 's', v: title }
        clearSheetBody(ws, 2)
        const rows = items.map((it, idx) => [
          idx + 1,
          it.containerNo || '',
          it.shippingLine || '',
          it.size || '',
          it._createdAt ? dayjs(it._createdAt).format('DD/MM/YYYY') : dateLabel,
          it.location || '',
          it.remark || '',
        ])
        XLSX.utils.sheet_add_aoa(ws, rows, { origin: { r: 2, c: 0 } })
        const lastRow = Math.max(2, 1 + rows.length)
        styleRange(ws, 0, 0, 0, 6, () => TITLE_STYLE)
        styleRange(ws, 1, 0, 1, 6, () => HEADER_STYLE)
        styleRange(ws, 2, 0, lastRow, 6, (R, C, cell) => (C === 0 || (cell && cell.t === 'n') ? CENTER_BODY_STYLE : BODY_STYLE))
        ws['!rows'] = ws['!rows'] || []
        ws['!rows'][0] = { ...(ws['!rows'][0] || {}), hpt: 24 }
        ws['!rows'][1] = { ...(ws['!rows'][1] || {}), hpt: 22 }
        ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 10 }, { wch: 24 }]
      }
      setupSheet('CA SANG', `TỪ 06H00 NGÀY ${dateLabel}`, sang)
      setupSheet('CA TOI', `TỪ 18H00 NGÀY ${dateLabel}`, toi)
    } else {
      const ws = wb.Sheets['RECAP']
      if (!ws) throw new Error('Không tìm thấy sheet RECAP')
      let aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const findTitleRows = () => {
        const rows = []
        aoa.forEach((r, i) => {
          if (String(r?.[0] || '').trim().toUpperCase().startsWith('BÁO CÁO')) rows.push(i)
        })
        return rows
      }
      let titleRows = findTitleRows()
      if (!titleRows.length) throw new Error('Không tìm thấy cấu trúc RECAP')
      const shiftData = [
        { items: sang, timeLabel: 'TỪ 06H00' },
        { items: toi, timeLabel: 'TỪ 18H00' },
      ]
      addMissingRecapLines(ws, aoa, titleRows, shiftData, classifyMap, keywords)
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      titleRows = findTitleRows()
      const headerRows = new Set()
      const totalRows = new Set()
      titleRows.forEach((start, idx) => {
        const end = idx < titleRows.length - 1 ? titleRows[idx + 1] - 1 : aoa.length - 1
        const sd = shiftData[idx] || shiftData[0]
        fillRecapBlock(ws, aoa, start, end, sd.items, classifyMap, keywords, dateLabel, sd.timeLabel)
        for (let R = start; R <= end; R++) {
          const label = String(aoa[R]?.[0] || '').trim().toUpperCase()
          if (RECAP_SECTIONS.includes(label)) headerRows.add(R)
          else if (label === 'TOTAL') totalRows.add(R)
        }
      })
      const range = XLSXStyle.utils.decode_range(ws['!ref'])
      ws['!rows'] = ws['!rows'] || []
      for (let R = range.s.r; R <= range.e.r; R++) {
        const firstLabel = String(aoa[R]?.[0] || '').trim().toUpperCase()
        const isTitleRow = firstLabel.startsWith('BÁO CÁO') || firstLabel.startsWith('NGÀY')
        const isBodyRow = !isTitleRow && (headerRows.has(R) || totalRows.has(R) ||
          (R > 0 && aoa[R] && aoa[R].some((c, ci) => ci === 0 && String(c || '').trim() !== '')))
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSXStyle.utils.encode_cell({ r: R, c: C })
          if (headerRows.has(R)) {
            ws[addr] = ws[addr] || { t: 's', v: '' }
            ws[addr].s = C === 0 ? SECTION_STYLE : HEADER_STYLE
          } else if (totalRows.has(R)) {
            ws[addr] = ws[addr] || { t: 's', v: '' }
            ws[addr].s = C === 0 ? { ...TOTAL_STYLE, alignment: { horizontal: 'left', vertical: 'center' } } : TOTAL_STYLE
          } else if (isBodyRow) {
            const existing = ws[addr]
            if (!existing) ws[addr] = { t: 's', v: '' }
            ws[addr].s = C === 0 ? { ...BODY_STYLE, font: { bold: false }, alignment: { horizontal: 'left', vertical: 'center' } } : CENTER_BODY_STYLE
          } else if (isTitleRow) {
            ws[addr] = ws[addr] || { t: 's', v: '' }
            ws[addr].s = TITLE_STYLE
          }
        }
        if (headerRows.has(R) || totalRows.has(R)) ws['!rows'][R] = { ...(ws['!rows'][R] || {}), hpt: 20 }
        else if (isTitleRow) ws['!rows'][R] = { ...(ws['!rows'][R] || {}), hpt: 22 }
      }
      ws['!cols'] = [{ wch: 18 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 14 }]
    }
  }

  const buildFilledFile = async (file) => {
    const dateStr = fileFillDate.format('YYYY-MM-DD')
    const dateLabel = fileFillDate.format('DD/MM/YYYY')
    const isDaily = file.name.includes('PHAN LOẠI')
    const [sang, toi] = await Promise.all([
      fetchFileItemsByShift(dateStr, 'sáng'),
      fetchFileItemsByShift(dateStr, 'tối'),
    ])
    if (!sang.length && !toi.length) {
      message.warning(`Không có phiếu sản lượng nào ngày ${dateLabel}`)
      return null
    }
    let classifyInfo = { map: {}, keywords: { dsc: [], xuLi: [], vs: [] } }
    if (!isDaily) {
      try { classifyInfo = await fetchClassifyInfo() } catch { classifyInfo = { map: {}, keywords: { dsc: [], xuLi: [], vs: [] } } }
    }
    const res = await fetch(file.url)
    if (!res.ok) throw new Error('Không tải được template')
    const wb = XLSXStyle.read(await res.arrayBuffer(), { type: 'array' })
    fillWorkbook(wb, file, sang, toi, classifyInfo, dateLabel)
    return {
      wb,
      sang,
      toi,
      isDaily,
      filename: isDaily
        ? `FILE PHAN LOAI CANG DAILY ${fileFillDate.format('DD.MM')}.xlsx`
        : `RECAP-MNR CANG ${fileFillDate.format('DD.MM')}.xlsx`,
    }
  }

  const downloadFilledFile = async (file) => {
    setFileFilling(true)
    try {
      const built = await buildFilledFile(file)
      if (!built) return
      XLSXStyle.writeFile(built.wb, built.filename)
      message.success(`Đã điền ${built.sang.length} container ca sáng, ${built.toi.length} ca tối`)
    } catch (e) {
      message.error(e.message || 'Lỗi điền dữ liệu')
    } finally {
      setFileFilling(false)
    }
  }

  const getEmailFile = (key) =>
    productionFiles.find((file) => key === 'daily' ? file.name.includes('PHAN LOẠI') : file.name.includes('RECAP'))

  const getEmailFiles = (keys) => keys.map(getEmailFile).filter(Boolean)

  const getEmailTemplateValues = (keys) => {
    const files = getEmailFiles(keys)
    const filenames = files.map((file) => file.name.replace(/\d{2}\.\d{2}/, fileViewDate))
    const type = files.map((file) => file.name.includes('PHAN LOẠI') ? 'FILE PHAN LOAI CANG DAILY' : 'RECAP-MNR CANG').join(' + ')
    return {
      shortDate: fileViewDate,
      date: fileFillDate.format('DD/MM/YYYY'),
      file: filenames.join(', '),
      type,
    }
  }

  const applyEmailTemplates = (keys, templates = emailTemplates) => {
    const values = getEmailTemplateValues(keys)
    const both = keys.includes('daily') && keys.includes('recap')
    const subjectTemplate = both
      ? templates.bothSubject
      : keys.includes('daily') ? templates.dailySubject : templates.recapSubject
    const bodyTemplate = both
      ? templates.bothBody
      : keys.includes('daily') ? templates.dailyBody : templates.recapBody
    const bodyHtml = ensureHtml(formatEmailTemplate(bodyTemplate, values))
    const signatureHtml = ensureHtml(formatEmailTemplate(templates.signature || '', values))
    emailForm.setFieldsValue({
      subject: formatEmailTemplate(subjectTemplate, values),
      text: signatureHtml ? `${bodyHtml}<br><br>${signatureHtml}` : bodyHtml,
    })
  }

  const openEmailModal = (file) => {
    setEmailFile(file)
    emailForm.setFieldsValue({
      to: localStorage.getItem('recapEmailTo') || '',
      cc: localStorage.getItem(EMAIL_CC_STORAGE_KEY) || '',
    })
    applyEmailTemplates(EMAIL_ATTACHMENT_KEYS)
    setEmailOpen(true)
  }

  const openEmailTemplateModal = () => {
    emailTemplateForm.setFieldsValue(emailTemplates)
    setEmailTemplateOpen(true)
  }

  const saveEmailTemplates = async () => {
    try {
      const values = await emailTemplateForm.validateFields()
      const next = { ...emailTemplates, ...values }
      setEmailTemplates(next)
      localStorage.setItem(EMAIL_TEMPLATE_STORAGE_KEY, JSON.stringify(next))
      if (emailFile) applyEmailTemplates(EMAIL_ATTACHMENT_KEYS, next)
      setEmailTemplateOpen(false)
      message.success('Đã lưu mẫu email')
    } catch (e) {
      if (e?.errorFields) return
      message.error(e.message || 'Lỗi lưu mẫu email')
    }
  }

  const sendEmail = async () => {
    try {
      const values = await emailForm.validateFields()
      const files = getEmailFiles(EMAIL_ATTACHMENT_KEYS)
      if (!files.length) {
        message.warning('Chọn ít nhất 1 file đính kèm')
        return
      }
      setEmailSending(true)
      const attachments = []
      for (const file of files) {
        const built = await buildFilledFile(file)
        if (!built) throw new Error(`Không có dữ liệu cho ${file.name}`)
        attachments.push({
          filename: built.filename,
          contentBase64: workbookToBase64(built.wb),
        })
      }
      const res = await api.post('/email/send-recap', {
        to: values.to,
        cc: values.cc,
        subject: values.subject,
        html: await inlineHtmlBlobImages(values.text),
        attachments,
      })
      if (values.to?.trim()) localStorage.setItem('recapEmailTo', values.to.trim())
      localStorage.setItem(EMAIL_CC_STORAGE_KEY, values.cc?.trim() || '')
      message.success(`Đã gửi email kèm ${attachments.map((attachment) => attachment.filename).join(', ')}`)
      if (res.data?.warnings?.length) {
        message.warning(`Logo/chữ ký có ${res.data.warnings.length} ảnh không nhúng được: ${res.data.warnings[0]}. Dùng nút "Chèn ảnh/logo" để chọn lại ảnh.`, 8)
      }
      setEmailOpen(false)
    } catch (e) {
      if (e?.errorFields) return
      message.error(e.response?.data?.message || e.message || 'Lỗi gửi email')
    } finally {
      setEmailSending(false)
    }
  }

  useEffect(() => {
    if (!fileViewOpen) return
    let cancelled = false
    loadFileViewData(fileFillDate.format('YYYY-MM-DD'), () => cancelled)
    return () => { cancelled = true }
  }, [fileViewOpen, fileFillDate, lockType])

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
        source: 'manual',
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
          const res = await api.post('/locks', { date: previewSource.date, shift: previewSource.shift, items: previewItems, type: lockType })
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
      buildExportRow({ ...c, createdAt: currentLock.date, _idx: i }, activeFields)
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

  const flattenSlItems = (lists) => {
    const result = []
    lists.forEach(sl => {
      ;(sl.items || []).forEach(item => {
        result.push({ ...item, _slId: sl._id, _slName: sl.name })
      })
    })
    return result
  }

  const openClassify = async () => {
    try {
      setKwInputDsc('')
      setKwInputXuLi('')
      setKwInputVs('')
      const res = await api.get('/classification')
      setKeywordsDsc(res.data.dsc || [])
      setKeywordsXuLi(res.data.xuLi || [])
      setKeywordsVs(res.data.vs || [])
      setClassifyOpen(true)
    } catch {
      message.error('Lỗi tải từ khóa phân loại')
    }
  }

  const handleSaveKeywords = async () => {
    setSavingKeywords(true)
    try {
      await api.put('/classification', { dsc: keywordsDsc, xuLi: keywordsXuLi, vs: keywordsVs })
      message.success('Đã lưu từ khóa')
    } catch {
      message.error('Lỗi lưu từ khóa')
    } finally {
      setSavingKeywords(false)
    }
  }

  const normalizeText = (str) => ' ' + str.toUpperCase().trim().replace(/[.,;:!?()\/\\\-_]+/g, ' ').replace(/\s+/g, ' ') + ' '

  const remarkMatchesAny = (remark, keys) => {
    if (!keys.length) return false
    const normalized = normalizeText(remark)
    return keys.some(k => {
      const kw = k.toUpperCase().trim()
      if (!kw) return false
      const normalizedKw = normalizeText(kw)
      return normalized.includes(normalizedKw)
    })
  }

  const handleApplyClassify = async () => {
    setClassifySubmitting(true)
    try {
      const slRes = await api.get('/shipping-lists')
      const allItems = flattenSlItems(slRes.data)
      if (!allItems.length) {
        message.warning('Không có shipping list nào để phân loại')
        setClassifySubmitting(false)
        return
      }
      const allContainerNos = [...new Set(allItems.map(i => i.containerNo).filter(Boolean))]
      let remarkMap = {}
      let dateMap = {}
      if (allContainerNos.length) {
        try {
          const containerRes = await api.post('/containers/by-nos', { containerNos: allContainerNos })
          ;(containerRes.data || []).forEach(c => {
            if (c.containerNo && c.remark) remarkMap[c.containerNo] = c.remark
            if (c.containerNo && c.createdAt) dateMap[c.containerNo] = dayjs(c.createdAt).format('YYYY-MM-DD')
          })
        } catch {
          const containerRes = await api.get('/containers/all', { params: { locked: 'all' } })
          ;(containerRes.data || []).forEach(c => {
            if (c.containerNo && c.remark) remarkMap[c.containerNo] = c.remark
            if (c.containerNo && c.createdAt) dateMap[c.containerNo] = dayjs(c.createdAt).format('YYYY-MM-DD')
          })
        }
      }
      const today = dayjs().format('YYYY-MM-DD')
      let matchCount = 0
      let remarkCount = 0
      const noDscKeys = !keywordsDsc.length
      const noXuLiKeys = !keywordsXuLi.length
      const noVsKeys = !keywordsVs.length
      const updates = allItems.map(i => {
        const remark = i.remark || remarkMap[i.containerNo] || ''
        if (remark) remarkCount++
        const matchDsc = noDscKeys ? false : remarkMatchesAny(remark, keywordsDsc)
        const matchXuLi = noXuLiKeys ? false : remarkMatchesAny(remark, keywordsXuLi)
        const matchVs = noVsKeys ? false : remarkMatchesAny(remark, keywordsVs)
        if (matchDsc || matchXuLi || matchVs) matchCount++
        const classDate = dateMap[i.containerNo] || today
        const calcField = (current, match, clear) => {
          if (clear) return ''
          if (!match) return current || ''
          if (!current) return classDate
          const dates = current.split(', ').map(d => d.trim())
          if (dates.includes(classDate)) return current
          return current + ', ' + classDate
        }
        const newDsc = calcField(i.dsc || i.choHtxnDvs || i.sc, matchDsc, noDscKeys)
        const newChoHtxnDvs = calcField(i.choHtxnDvs, matchDsc, noDscKeys)
        const newSc = calcField(i.sc, matchDsc, noDscKeys)
        const newXuLi = calcField(i.xuLiLai, matchXuLi, noXuLiKeys)
        const newVs = calcField(i.vsDvs, matchVs, noVsKeys)
        const oldDscVal = i.dsc || i.choHtxnDvs || i.sc || ''
        if (newDsc === oldDscVal && newXuLi === (i.xuLiLai || '') && newVs === (i.vsDvs || '')) return null
        return { _slId: i._slId, _id: i._id, dsc: newDsc, choHtxnDvs: newChoHtxnDvs, sc: newSc, xuLiLai: newXuLi, vsDvs: newVs }
      }).filter(Boolean)
      console.log('=== DEBUG PHAN LOAI ===')
      console.log('Tong items:', allItems.length)
      console.log('Items co remark:', remarkCount)
      console.log('Items match keywords:', matchCount)
      console.log('Updates se gui:', updates.length)
      console.log('Keywords DSC:', keywordsDsc)
      console.log('Keywords XU LI:', keywordsXuLi)
      console.log('Keywords VS:', keywordsVs)
      if (!updates.length && allItems.length) {
        console.log('5 item dau tien:')
        allItems.slice(0, 5).forEach((i, idx) => {
          const remark = i.remark || remarkMap[i.containerNo] || ''
          const classDate = dateMap[i.containerNo] || today
          console.log(`  Item ${idx}: cont=${i.containerNo}, remark="${remark}", classDate="${classDate}", dsc="${i.dsc || i.choHtxnDvs || i.sc}", xuLi="${i.xuLiLai}", vs="${i.vsDvs}"`)
        })
      }
      if (!updates.length) {
        message.warning('Không có thay đổi')
        setClassifySubmitting(false)
        return
      }
      const grouped = {}
      updates.forEach(i => {
        if (!grouped[i._slId]) grouped[i._slId] = []
        grouped[i._slId].push({ _id: i._id, dsc: i.dsc, choHtxnDvs: i.choHtxnDvs, sc: i.sc, xuLiLai: i.xuLiLai, vsDvs: i.vsDvs })
      })
      let total = 0
      for (const [slId, upds] of Object.entries(grouped)) {
        await api.put(`/shipping-lists/${slId}/items`, { updates: upds })
        total += upds.length
      }
      await api.put('/classification', { dsc: keywordsDsc, xuLi: keywordsXuLi, vs: keywordsVs })
      message.success(`Đã cập nhật ${total} container trong ${Object.keys(grouped).length} list`)
      setClassifyOpen(false)
      fetchShippingLists(slDateRange)
    } catch (e) {
      console.error('Apply classify error:', e)
      message.error(e.response?.data?.message || e.message || 'Lỗi cập nhật')
    } finally {
      setClassifySubmitting(false)
    }
  }

  useEffect(() => { fetchShippingLists(slDateRange) }, [slDateRange])

  const columns = [
    { title: 'STT', key: 'stt', width: 60, render: (_, __, i) => i + 1 },
    { title: 'Container No', dataIndex: 'containerNo', key: 'containerNo' },
    { title: 'Hãng tàu', dataIndex: 'shippingLine', key: 'shippingLine', width: 100 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 80 },
    { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 80,
      render: v => {
        if (v === 'depot') return <Tag color="purple">Depot</Tag>
        if (v === 'container') return <Tag color="blue">Container</Tag>
        return <Tag color="default">Manual</Tag>
      },
    },
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
      title: 'Hành động', key: 'action', width: 130,
      render: (_, record) => (
        <Space>
          <Tooltip title="Xem chi tiết">
            <Button type="primary" size="small" icon={<EyeOutlined />} onClick={() => handleViewLock(record)} />
          </Tooltip>
          <Tooltip title="File báo cáo cảng">
            <Button size="small" icon={<FileExcelOutlined />} style={{ color: '#52c41a', borderColor: '#52c41a' }} onClick={() => openFileView(record)} />
          </Tooltip>
        </Space>
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
    { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 80,
      render: v => {
        if (v === 'depot') return <Tag color="purple">Depot</Tag>
        if (v === 'container') return <Tag color="blue">Container</Tag>
        return <Tag color="default">Manual</Tag>
      },
    },
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
          activeKey={sanLuongTab}
          onChange={key => {
            setSanLuongTab(key)
            if (key === 'san-luong-container') setLockType('container')
            else if (key === 'san-luong-depot') setLockType('depot')
          }}
          items={[
            {
              key: 'san-luong-container',
              label: <span><ContainerOutlined /> Sản lượng Container</span>,
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
              key: 'san-luong-depot',
              label: <span><ShopOutlined /> Sản lượng Depot</span>,
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
                <div className="mb-3 flex flex-wrap gap-2 items-center">
                  <DatePicker.RangePicker
                    value={slDateRange}
                    onChange={dates => setSlDateRange(dates)}
                    format="DD/MM/YYYY"
                    placeholder={['Từ ngày', 'Đến ngày']}
                    allowClear
                    onClear={() => setSlDateRange(null)}
                  />
                  <Button icon={<CheckCircleOutlined />} onClick={openClassify}>
                    Phân loại
                  </Button>
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

      <Modal
        title="Phân loại từ ghi chú"
        open={classifyOpen}
        onCancel={() => setClassifyOpen(false)}
        footer={[
          <Button key="save" icon={<SaveOutlined />} onClick={handleSaveKeywords} loading={savingKeywords}>Lưu từ khóa</Button>,
          <Button key="cancel" onClick={() => setClassifyOpen(false)}>Hủy</Button>,
          <Button key="apply" type="primary" icon={<CheckCircleOutlined />} onClick={handleApplyClassify} loading={classifySubmitting}>Áp dụng</Button>,
        ]}
        width={800}
      >
        <Row gutter={[16, 16]}>
          <Col span={8}>
            <div className="border rounded p-3" style={{ minHeight: 300 }}>
              <h4 className="font-medium text-green-700 mb-2">DA SUA CHUA</h4>
              <div className="flex gap-1 mb-2 flex-wrap">
                {keywordsDsc.map((kw, i) => (
                  <Tag key={i} closable onClose={() => setKeywordsDsc(p => p.filter((_, j) => j !== i))} color="green">{kw}</Tag>
                ))}
              </div>
              <Input.Search
                placeholder="Thêm từ khóa..."
                value={kwInputDsc}
                onChange={e => setKwInputDsc(e.target.value)}
                onSearch={v => { if (v.trim()) { setKeywordsDsc(p => [...p, v.trim()]); setKwInputDsc('') } }}
                enterButton={<PlusOutlined />}
                allowClear
                onClear={() => setKwInputDsc('')}
              />
            </div>
          </Col>
          <Col span={8}>
            <div className="border rounded p-3" style={{ minHeight: 300 }}>
              <h4 className="font-medium text-red-700 mb-2">XU LI LAI</h4>
              <div className="flex gap-1 mb-2 flex-wrap">
                {keywordsXuLi.map((kw, i) => (
                  <Tag key={i} closable onClose={() => setKeywordsXuLi(p => p.filter((_, j) => j !== i))} color="red">{kw}</Tag>
                ))}
              </div>
              <Input.Search
                placeholder="Thêm từ khóa..."
                value={kwInputXuLi}
                onChange={e => setKwInputXuLi(e.target.value)}
                onSearch={v => { if (v.trim()) { setKeywordsXuLi(p => [...p, v.trim()]); setKwInputXuLi('') } }}
                enterButton={<PlusOutlined />}
                allowClear
                onClear={() => setKwInputXuLi('')}
              />
            </div>
          </Col>
          <Col span={8}>
            <div className="border rounded p-3" style={{ minHeight: 300 }}>
              <h4 className="font-medium text-blue-700 mb-2">DA VE SINH</h4>
              <div className="flex gap-1 mb-2 flex-wrap">
                {keywordsVs.map((kw, i) => (
                  <Tag key={i} closable onClose={() => setKeywordsVs(p => p.filter((_, j) => j !== i))} color="blue">{kw}</Tag>
                ))}
              </div>
              <Input.Search
                placeholder="Thêm từ khóa..."
                value={kwInputVs}
                onChange={e => setKwInputVs(e.target.value)}
                onSearch={v => { if (v.trim()) { setKeywordsVs(p => [...p, v.trim()]); setKwInputVs('') } }}
                enterButton={<PlusOutlined />}
                allowClear
                onClear={() => setKwInputVs('')}
              />
            </div>
          </Col>
        </Row>
      </Modal>

      <Modal
        title="File báo cáo cảng"
        open={fileViewOpen}
        onCancel={() => setFileViewOpen(false)}
        footer={null}
        width={1200}
      >
        {fileViewLoading ? (
          <div className="flex flex-col justify-center items-center gap-3" style={{ minHeight: 200 }}>
            <Spin size="large" />
            <span className="text-gray-500">Đang đọc file...</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <Space>
                <span>Ngày điền dữ liệu:</span>
                <DatePicker value={fileFillDate} onChange={v => { if (v) { setFileFillDate(v); setFileFillCounts({ sang: null, toi: null }) } }} allowClear={false} />
                <span className="text-gray-500 text-sm">
                  {fileFillCounts.sang === null ? 'Đang đếm...' :
                    fileFillCounts.sang + fileFillCounts.toi === 0 ? <span className="text-red-500">Không có phiếu sản lượng ngày này</span> :
                    <>Có <b>{fileFillCounts.sang}</b> container ca sáng, <b>{fileFillCounts.toi}</b> ca tối</>}
                </span>
              </Space>
              <span className="text-gray-500 text-sm">Xem trước dữ liệu sẽ điền — phiếu sản lượng {lockType === 'depot' ? 'Depot' : 'Container'}</span>
            </div>
            <Tabs
              items={fileViewData.map((file) => ({
                key: file.url,
                label: fileViewDate ? file.name.replace(/\d{2}\.\d{2}/, fileViewDate) : file.name,
                children: (
                  <>
                    <div className="mb-3">
                      <Space wrap>
                        <Button type="primary" icon={<DownloadOutlined />} loading={fileFilling} style={{ background: '#52c41a', borderColor: '#52c41a' }} onClick={() => downloadFilledFile(file)}>
                          Tải file đã điền dữ liệu
                        </Button>
                        <Button icon={<ExportOutlined />} onClick={() => openFileDownload(file)}>
                          Tải file gốc
                        </Button>
                        <Button icon={<MailOutlined />} onClick={() => openEmailModal(file)}>
                          Gửi email tự động
                        </Button>
                      </Space>
                    </div>
                    {file.sheets.length > 1 ? (
                      <Tabs
                        items={file.sheets.map((sheet) => ({
                          key: sheet.name,
                          label: sheet.name.toUpperCase().includes('TOI') ? 'Ca tối' : sheet.name.toUpperCase().includes('SANG') ? 'Ca sáng' : sheet.name,
                          children: renderFileSheetTable(sheet, file.name),
                        }))}
                      />
                    ) : file.sheets[0] ? (
                      renderFileSheetTable(file.sheets[0], file.name)
                    ) : (
                      <span className="text-gray-400">File trống</span>
                    )}
                  </>
                ),
              }))}
            />
          </>
        )}
      </Modal>

      <Modal
        title={<>Gửi email tự động <Button type="link" size="small" onClick={openEmailTemplateModal}>Cài đặt mẫu email</Button></>}
        open={emailOpen}
        onCancel={() => setEmailOpen(false)}
        onOk={sendEmail}
        okText="Gửi email"
        cancelText="Hủy"
        confirmLoading={emailSending}
        okButtonProps={{ icon: <MailOutlined /> }}
        width={620}
      >
        <Form form={emailForm} layout="vertical">
          <Form.Item
            name="to"
            label="Email nhận"
            extra="Để trống để dùng email mặc định trong cấu hình máy chủ."
            rules={[{
              validator: (_, value) => {
                const list = String(value || '').split(/[,;]/).map((v) => v.trim()).filter(Boolean)
                const invalid = list.find((v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
                return invalid ? Promise.reject(new Error(`Email không hợp lệ: ${invalid}`)) : Promise.resolve()
              },
            }]}
          >
            <Input placeholder="nguoinhan@congty.com" />
          </Form.Item>
          <Form.Item
            name="cc"
            label="CC"
            extra="Danh sách CC sẽ được tự động lưu cho lần gửi sau."
            rules={[{
              validator: (_, value) => {
                const list = String(value || '').split(/[,;]/).map((v) => v.trim()).filter(Boolean)
                const invalid = list.find((v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
                return invalid ? Promise.reject(new Error(`Email không hợp lệ: ${invalid}`)) : Promise.resolve()
              },
            }]}
          >
            <Input placeholder="Có thể nhập nhiều email, cách nhau bởi dấu phẩy" />
          </Form.Item>
          <Form.Item
            name="subject" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="text"
            label="Nội dung"
            extra="Có thể dán trực tiếp chữ ký từ Gmail/Outlook; định dạng sẽ được giữ nguyên."
          >
            <RichTextEditor minHeight={180} />
          </Form.Item>
          <div className="text-sm text-gray-500">
            File đính kèm (cả 2 file): <b>{emailAttachmentKeys.map((key) => getEmailFile(key)?.name.replace(/\d{2}\.\d{2}/, fileViewDate)).filter(Boolean).join(', ')}</b>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Cài đặt mẫu email"
        open={emailTemplateOpen}
        onCancel={() => setEmailTemplateOpen(false)}
        onOk={saveEmailTemplates}
        okText="Lưu mẫu"
        cancelText="Hủy"
        width={680}
      >
        <div className="text-sm text-gray-500 mb-3">
          Có thể dùng <code>{'{date}'}</code> = 01/11/2026, <code>{'{shortDate}'}</code> = 01.11,
          <code>{'{file}'}</code> = tên file đính kèm, <code>{'{type}'}</code> = loại báo cáo.
        </div>
        <Form form={emailTemplateForm} layout="vertical">
          <Divider orientation="left" plain>CẢ 2 FILE</Divider>
          <Form.Item name="bothSubject" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bothBody" label="Nội dung">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Divider orientation="left" plain>CHỮ KÝ EMAIL</Divider>
          <Form.Item
            name="signature"
            label="Chữ ký"
            extra="Dán trực tiếp chữ ký từ Gmail/Outlook vào đây. Nếu logo bị lỗi khi người nhận xem, xóa logo đó và bấm nút Chèn ảnh/logo để chọn file ảnh từ máy."
          >
            <RichTextEditor minHeight={160} />
          </Form.Item>
        </Form>
        <Button type="link" size="small" onClick={() => emailTemplateForm.setFieldsValue(DEFAULT_EMAIL_TEMPLATES)}>
          Khôi phục mặc định
        </Button>
      </Modal>
    </div>
  )
}

export default LockProduction
