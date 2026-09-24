import { useState, useRef } from 'react'
import * as XLSX from 'xlsx-js-style'
import {
  Card, Button, Space, Typography, Table, Input, Tag, Divider, Alert, message,
  Upload, Select, Popconfirm, Row, Col, InputNumber, Checkbox, Dropdown, Tooltip,
  Modal,
} from 'antd'
import {
  UploadOutlined, FolderOpenOutlined, TranslationOutlined, TableOutlined,
  DownloadOutlined, PlusOutlined, DeleteOutlined, CopyOutlined,
  FormatPainterOutlined, ReloadOutlined, ExportOutlined,
  SearchOutlined, SettingOutlined,
} from '@ant-design/icons'

const { Dragger } = Upload
const { Text, Title } = Typography

const STORAGE_KEY = 'est_mappings_v2'
const STORAGE_TEMPLATE = 'est_template_v1'
const STORAGE_MIGRATED = 'est_mappings_v1'
const STORAGE_SPLIT_IT = 'est_split_it_v1'
const STORAGE_HIDEVALS = 'est_hidevals_v1'

const DEFAULT_MAPPINGS = {
  COMCODE: [
    { code: 'FWA', word: 'sàn' },
    { code: 'BXXX', word: 'toàn sàn' },
  ],
  LOC: [],
  DMCODE: [],
  RPCODE: [],
  OTHER: [],
}

const MAPPING_GROUPS = [
  { field: 'COMCODE', label: 'COM CODE', color: 'blue', desc: 'Mã COM → tiếng Việt' },
  { field: 'LOC', label: 'LOC', color: 'green', desc: 'Vị trí → tiếng Việt' },
  { field: 'DMCODE', label: 'DM CODE', color: 'orange', desc: 'Mã DM → tiếng Việt' },
  { field: 'RPCODE', label: 'RP CODE', color: 'purple', desc: 'Mã RP → tiếng Việt' },
  { field: 'OTHER', label: 'Khác (SIZE / QTY / ...)', color: 'default', desc: 'Chuyển ngữ cho cột còn lại' },
]

const DEFAULT_TEMPLATE = '{CONTAINER} |\t{COM_CODE} {LTH}x{WDT} ({LOC})'

const DEFAULT_HIDEVALS = { LTH: '0', WDT: '0', QTY: '0' }

const HEADER_ALIASES = [
  { key: 'CONTAINER', aliases: ['container', 'số container', 'cont no', 'container #', 'số cont'] },
  { key: 'SIZE', aliases: ['size', 'cỡ', 'kích thước'] },
  { key: 'DATEINYARD', aliases: ['date in yard', 'ngày vào', 'ngày vào bãi'] },
  { key: 'VESSEL', aliases: ['vessel', 'tàu', 'vessel/voy', 'voy'] },
  { key: 'IT', aliases: ['it', 'số tt', 'stt', 'seq'] },
  { key: 'COMCODE', aliases: ['com code', 'com', 'mã com', 'code'] },
  { key: 'DETAILS', aliases: ['components details', 'details', 'mô tả', 'chi tiết', 'components'] },
  { key: 'LOC', aliases: ['loc', 'vị trí', 'location'] },
  { key: 'DMCODE', aliases: ['dm code', 'dm', 'mã dm'] },
  { key: 'RPCODE', aliases: ['rp code', 'rp', 'mã rp'] },
  { key: 'LTH', aliases: ['lth', 'dài', 'length', 'len'] },
  { key: 'WDT', aliases: ['wdt', 'rộng', 'width', 'w'] },
  { key: 'QTY', aliases: ['qty', 'số lượng', 'sl'] },
]

const TIP_TOKENS = [
  { token: '{CONTAINER}', desc: 'Số container' },
  { token: '{SIZE}', desc: 'Kích thước' },
  { token: '{DATEINYARD}', desc: 'Ngày vào bãi' },
  { token: '{VESSEL}', desc: 'Tàu/Voyage' },
  { token: '{IT}', desc: 'Số thứ tự' },
  { token: '{COM_CODE}', desc: 'Mã COM (chuyển ngữ)' },
  { token: '{DETAILS}', desc: 'Chi tiết linh kiện' },
  { token: '{LOC}', desc: 'Vị trí (chuyển ngữ)' },
  { token: '{DM_CODE}', desc: 'Mã DM (chuyển ngữ)' },
  { token: '{RP_CODE}', desc: 'Mã RP (chuyển ngữ)' },
  { token: '{LTH}', desc: 'Chiều dài' },
  { token: '{WDT}', desc: 'Chiều rộng' },
  { token: '{QTY}', desc: 'Số lượng' },
]

function normalize(s) {
  return String(s == null ? '' : s)
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
}

function hideZeroGlue(parts) {
  let s = parts
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\u0000[ \t]*(?:[x×X/·:*|.,;])?[ \t]*/g, '\u0000')
    s = s.replace(/[ \t]*(?:[x×X/·:*|.,;])?[ \t]*\u0000/g, ' ')
    s = s.replace(/\u0000[ \t]*\([ \t]*\u0000[ \t]*\)/g, '\u0000')
    s = s.replace(/[ \t]{2,}/g, ' ')
  }
  return s.replace(/\u0000+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/([^\s])\(/g, '$1 (')
    .trim()
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i]
    const joined = row.map(c => normalize(c)).join(' ')
    if (joined.includes('container') && (joined.includes('comcode') || joined.includes('com code')
      || joined.includes('components') || joined.includes('loc') || joined.includes('rpcode'))) {
      return i
    }
  }
  return -1
}

function buildColMap(headerRow) {
  const map = {}
  headerRow.forEach((cell, idx) => {
    const n = normalize(cell)
    for (const { key, aliases } of HEADER_ALIASES) {
      if (!map[key] && aliases.some(a => normalize(a) === n || n.includes(normalize(a)))) {
        map[key] = idx
        break
      }
      if (!map[key] && aliases.some(a => normalize(a).includes(n) && n.length >= 2)) {
        map[key] = idx
        break
      }
    }
  })
  return map
}

function loadMappings() {
  try {
    const v1 = localStorage.getItem(STORAGE_MIGRATED)
    if (v1) {
      const old = JSON.parse(v1)
      if (Array.isArray(old)) {
        const merged = { ...DEFAULT_MAPPINGS }
        for (const g of MAPPING_GROUPS) merged[g.field] = merged[g.field].slice()
        merged.OTHER = merged.OTHER.concat(old.filter(m => m && m.code))
        localStorage.removeItem(STORAGE_MIGRATED)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
        return merged
      }
    }
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const merged = { ...DEFAULT_MAPPINGS }
      for (const g of MAPPING_GROUPS) {
        if (Array.isArray(parsed[g.field])) merged[g.field] = parsed[g.field]
        else merged[g.field] = merged[g.field].slice()
      }
      return merged
    }
  } catch { /* ignore */ }
  return { COMCODE: DEFAULT_MAPPINGS.COMCODE.slice(), LOC: [], DMCODE: [], RPCODE: [], OTHER: [] }
}

const DEFAULT_GROUPS = () => ({
  COMCODE: DEFAULT_MAPPINGS.COMCODE.slice(),
  LOC: [],
  DMCODE: [],
  RPCODE: [],
  OTHER: [],
})

function EstTranslator() {
  const [headers, setHeaders] = useState([])
  const [colMap, setColMap] = useState({})
  const [dataRows, setDataRows] = useState([])
  const [mappings, setMappings] = useState(loadMappings)
  const [template, setTemplate] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_TEMPLATE) || DEFAULT_TEMPLATE
    } catch { return DEFAULT_TEMPLATE }
  })
  const [status, setStatus] = useState('')
  const [fileName, setFileName] = useState('')
  const [splitIT, setSplitIT] = useState(() => {
    try { return localStorage.getItem(STORAGE_SPLIT_IT) === '1' }
    catch { return false }
  })
  const applySplitIT = (v) => {
    setSplitIT(v)
    try { localStorage.setItem(STORAGE_SPLIT_IT, v ? '1' : '0') } catch {}
  }

  const [hideVals, setHideVals] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HIDEVALS)
      return raw ? { ...DEFAULT_HIDEVALS, ...JSON.parse(raw) } : DEFAULT_HIDEVALS
    } catch { return DEFAULT_HIDEVALS }
  })
  const applyHideVals = (field, value) => {
    const next = { ...hideVals, [field]: value }
    setHideVals(next)
    try { localStorage.setItem(STORAGE_HIDEVALS, JSON.stringify(next)) } catch {}
  }
  const shouldHideVal = (field, rawVal) => {
    const v = String(rawVal ?? '').trim()
    if (v === '') return true
    const list = String(hideVals[field] || '').split(/[,;\s]+/).filter(Boolean)
    if (list.length === 0) return false
    return list.some(x => Number(x) === Number(v))
  }
  const [hideModalOpen, setHideModalOpen] = useState(false)
  const [resultSearch, setResultSearch] = useState('')
  const [detailKey, setDetailKey] = useState(null)
  const [detailChecks, setDetailChecks] = useState({})
  const [checkedMap, setCheckedMap] = useState({})
  const [excludedSet, setExcludedSet] = useState(() => new Set())

  // --- per-column Modal state ---
  const [modalGroup, setModalGroup] = useState(null)   // field name currently open, null = closed
  const [modalSearch, setModalSearch] = useState('')
  const [modalPaste, setModalPaste] = useState('')
  const [mappingFileName, setMappingFileName] = useState('')
  const [quickCode, setQuickCode] = useState('')
  const [quickWord, setQuickWord] = useState('')
  const quickCodeRef = useRef(null)

  const saveMappings = (next) => {
    setMappings(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const lookup = (code, group = 'OTHER') => {
    const c = normalize(code)
    if (!c) return ''
    const list = (mappings[group] || []).slice().concat(mappings.OTHER || [])
    const hit = list.find(m => m && normalize(m.code) === c)
    return hit && hit.word ? hit.word : code
  }

  const translateRow = (row, tpl = template) => {
    const get = (key) => {
      const idx = colMap[key]
      return idx === undefined ? '' : row[idx]
    }
    const com = normalize(get('COMCODE'))
    const loc = normalize(get('LOC'))

    if (!com && !loc) return null

    const comWord = lookup(get('COMCODE'), 'COMCODE')
    const locWord = lookup(get('LOC'), 'LOC')
    const dmWord = lookup(get('DMCODE'), 'DMCODE')
    const rpWord = lookup(get('RPCODE'), 'RPCODE')
    const lth = get('LTH')
    const wdt = get('WDT')
    const qty = get('QTY')

    const rawIt = String(get('IT') ?? '').trim()
    const itParts = rawIt.split(/[,\s;\|/]+/).map(s => s.trim()).filter(Boolean)
    const its = splitIT ? itParts : [itParts.join(' | ') || rawIt]

    return its.map((itVal) => {
      const parts = tpl.split(/(\{[A-Z_]+\})/g).map(seg => {
        if (!seg.startsWith('{') || !seg.endsWith('}')) return seg
        switch (seg) {
          case '{CONTAINER}': return get('CONTAINER')
          case '{SIZE}': return get('SIZE')
          case '{DATEINYARD}': return get('DATEINYARD')
          case '{VESSEL}': return get('VESSEL')
          case '{IT}': return itVal
          case '{COM_CODE}': return comWord
          case '{DETAILS}': return get('DETAILS')
          case '{LOC}': return locWord
          case '{DM_CODE}': return dmWord
          case '{RP_CODE}': return rpWord
          case '{LTH}': return shouldHideVal('LTH', lth) ? '\u0000' : String(lth ?? '').trim()
          case '{WDT}': return shouldHideVal('WDT', wdt) ? '\u0000' : String(wdt ?? '').trim()
          case '{QTY}': {
            const v = String(qty ?? '').trim()
            if (shouldHideVal('QTY', v)) return '\u0000'
            return v
          }
          default: return seg
        }
      }).join('')

      const qtyVal = String(qty ?? '').trim()
      const showQtySuffix = !tpl.split(/(\{[A-Z_]+\})/g).includes('{QTY}')
      const qtySuffix = showQtySuffix === true && !shouldHideVal('QTY', qtyVal)
        ? qtyVal
        : ''

      return {
        key: `${dataRows.indexOf(row)}-${its.indexOf(itVal)}`,
        container: get('CONTAINER'),
        size: get('SIZE'),
        dateInYard: get('DATEINYARD'),
        vessel: get('VESSEL'),
        it: itVal,
        comCode: get('COMCODE'),
        comWord,
        locCode: get('LOC'),
        locWord,
        dmCode: get('DMCODE'),
        rpCode: get('RPCODE'),
        lth: get('LTH'),
        wdt: get('WDT'),
        qty: get('QTY'),
        line: (hideZeroGlue(parts) + (qtySuffix ? ` | ${qtySuffix}` : ''))
          .replace(/\r?\n/g, ' ')
          .replace(/\t+/g, ' ')
          .replace(/[ ]+/g, ' ')
          .replace(/[ \t]*([|,.:;])\s*/g, '$1 ')
          .trim(),
      }
    })
  }

  const groupKey = (r) => {
    const i = colMap['CONTAINER']
    return i === undefined ? '' : String(r[i] ?? '').trim()
  }

  const tplWithoutContainer = template
    .replace(/\{CONTAINER\}/g, '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim()

  const converted = (() => {
    if (splitIT) {
      return dataRows.flatMap((_, i) => translateRow(dataRows[i])).filter(Boolean)
        .map(r => ({ ...r, subs: [r] }))
    }
    const groups = []
    for (const r of dataRows) {
      const k = groupKey(r)
      if (!k) { groups.push({ k, rows: [r] }); continue }
      const last = groups[groups.length - 1]
      if (last && last.k === k) {
        last.rows.push(r)
      } else {
        groups.push({ k, rows: [r] })
      }
    }
    const out = []
    for (const g of groups) {
      const t0 = translateRow(g.rows[0], template)?.[0]
      if (!t0) continue
      const rest = g.rows.slice(1).map(r => translateRow(r, tplWithoutContainer)?.[0]).filter(Boolean)
      const subs = [t0, ...rest]
      out.push({
        ...t0,
        it: subs.map(x => x.it).join(' | '),
        line: subs.map(x => x.line).filter(Boolean).join(' | '),
        subs,
      })
    }
    return out
  })()

  const handleUpload = async (file) => {
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const hi = findHeaderRow(rows)
      if (hi === -1) {
        setStatus('Không tìm thấy dòng tiêu đề (cần cột CONTAINER / COM CODE / COMPONENTS DETAILS).')
        return
      }
      const headerRow = rows[hi]
      const map = buildColMap(headerRow)
      const val = (r, k) => {
        const idx = map[k]
        return idx === undefined ? '' : (r[idx] === undefined ? '' : r[idx])
      }
      const raw = rows.slice(hi + 1).filter(r => {
        const c = String(val(r, 'CONTAINER')).trim()
        const cc = String(val(r, 'COMCODE')).trim()
        const it = String(val(r, 'IT')).trim()
        return c !== '' || cc !== '' || it !== ''
      })
      const data = []
      const last = {}
      for (const r of raw) {
        const out = [...r]
        const carry = ['CONTAINER', 'SIZE', 'DATEINYARD', 'VESSEL', 'COMCODE', 'DETAILS', 'LOC', 'DMCODE']
        for (const k of carry) {
          const idx = map[k]
          if (idx === undefined) continue
          const v = r[idx]
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            last[k] = v
          } else if (last[k] !== undefined) {
            out[idx] = last[k]
          }
        }
        data.push(out)
      }
      setHeaders(headerRow)
      setColMap(map)
      setDataRows(data)
      setFileName(file.name || '')
      setStatus(`Đã đọc ${data.length} dòng từ "${file.name}". COM CODE → ${headerRow[map.COMCODE] ?? '(chưa map)'}, LOC → ${headerRow[map.LOC] ?? '(chưa map)'}.`)
    } catch (e) {
      setStatus('Lỗi đọc file: ' + e.message)
    }
    return false
  }

  const exportExcel = () => {
    const rows = exportFiltered.map(r => {
      const { main, ko } = rowLineSplit(r)
      return { 'SỐ CONT': r.container, 'Nội dung chuyển ngữ': main, ...(ko ? { 'KO APP': ko } : {}) }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 20 }, { wch: 120 }, { wch: 60 }]
    const redBold = { font: { color: { rgb: 'FFFF0000' }, bold: true } }
    const black = { font: { color: { rgb: 'FF000000' } } }
    for (let i = 0; i < exportFiltered.length; i++) {
      const { ko } = rowLineSplit(exportFiltered[i])
      ws[XLSX.utils.encode_cell({ r: i + 1, c: 0 })].s = black
      ws[XLSX.utils.encode_cell({ r: i + 1, c: 1 })].s = black
      if (ko) ws[XLSX.utils.encode_cell({ r: i + 1, c: 2 })].s = redBold
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    XLSX.writeFile(wb, `chuyen_est_${new Date().toISOString().slice(0, 10)}.xlsx`)
    message.success(`Đã xuất ${rows.length} dòng!`)
  }

  // --- per-column mapping actions (scoped to modalGroup) ---
  const addMapping = () => {
    const g = modalGroup || 'OTHER'
    const next = { ...mappings, [g]: (mappings[g] || []).concat([{ code: '', word: '' }]) }
    saveMappings(next)
  }

  const updateMapping = (i, field, value) => {
    const g = modalGroup || 'OTHER'
    const list = (mappings[g] || []).slice()
    list[i] = { ...list[i], [field]: value }
    saveMappings({ ...mappings, [g]: list })
  }

  const removeMapping = (i) => {
    const g = modalGroup || 'OTHER'
    saveMappings({ ...mappings, [g]: (mappings[g] || []).filter((_, idx) => idx !== i) })
  }

  const addQuick = () => {
    const g = modalGroup || 'OTHER'
    const code = quickCode.trim()
    if (!code) { message.warning('Nhập Mã.'); return }
    saveMappings({ ...mappings, [g]: (mappings[g] || []).concat([{ code, word: quickWord.trim() }]) })
    setQuickCode('')
    setQuickWord('')
    quickCodeRef.current?.focus()
  }

  const addRowsToMappings = (rows) => {
    const g = modalGroup || 'OTHER'
    const added = []
    for (const row of rows) {
      const cells = String(row[0] ?? '').trim()
      const words = String(row[1] ?? '').trim()
      if (!cells) continue
      added.push({ code: cells, word: words })
    }
    if (added.length === 0) { message.warning('Không tìm thấy cột mã hợp lệ.'); return }
    saveMappings({ ...mappings, [g]: (mappings[g] || []).concat(added) })
    message.success(`Đã thêm ${added.length} quy tắc từ Excel!`)
  }

  const pasteMappings = () => {
    const rows = modalPaste.split(/\r?\n/).map(r => r.trim()).filter(Boolean)
    if (rows.length === 0) { message.warning('Chưa có dữ liệu để dán.'); return }
    const parsed = []
    for (const row of rows) {
      const cells = row.split(/[\t,;|]+/).map(c => c.trim()).filter(Boolean)
      if (cells.length === 0) continue
      parsed.push([cells[0], cells.slice(1).join(' ')])
    }
    addRowsToMappings(parsed)
    setModalPaste('')
  }

  const handleMappingFile = (file) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const rows = []
        for (const r of matrix) {
          if (!r || (r[0] ?? '').toString().trim() === '') continue
          if (rows.length === 0 && (r[0] ?? '').toString().toLowerCase().includes('mã')) continue
          rows.push([(r[0] ?? '').toString().trim(), (r[1] ?? '').toString().trim()])
        }
        setMappingFileName(file.name)
        addRowsToMappings(rows)
      } catch (err) {
        message.error('Không đọc được file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    return false
  }

  const copyAll = () => {
    const text = exportFiltered.map(r => `${r.container}\t${rowLine(r)}`).join('\n')
    navigator.clipboard.writeText(text)
    message.success(`Đã copy ${exportFiltered.length} dòng!`)
  }

  const refreshAll = () => {
    setDataRows([])
    setColMap({})
    setHeaders([])
    setFileName('')
    setStatus('')
    setResultSearch('')
    setCheckedMap({})
    setExcludedSet(new Set())
    setDetailKey(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    message.success('Đã làm mới!')
  }

  const filtered = resultSearch.trim()
    ? converted.filter(r => normalize(r.container).includes(normalize(resultSearch)))
    : converted

  const openDetail = (r) => {
    const checks = {}
    ;(r.subs || []).forEach((_, i) => checks[i] = (checkedMap[r.key]?.[i] !== false))
    setDetailChecks(checks)
    setDetailKey(r.key)
  }

  const applyDetail = () => {
    if (detailKey) setCheckedMap(prev => ({ ...prev, [detailKey]: detailChecks }))
    setDetailKey(null)
  }

  const rowLine = (r) => {
    const chk = checkedMap[r.key]
    if (!chk) return r.line
    const kept = r.subs.filter((s, i) => chk[i] !== false).map(s => s.line).filter(Boolean)
    const dropped = r.subs.filter((s, i) => chk[i] === false).map(s => s.line).filter(Boolean)
    const main = kept.join(' | ')
    const tail = dropped.length ? `KO APP:(${dropped.join(' | ')})` : ''
    return [main, tail].filter(Boolean).join(' | ')
  }

  const rowLineParts = (r) => {
    const chk = checkedMap[r.key]
    if (!chk) return [{ text: r.line, ko: false }]
    const kept = r.subs.filter((s, i) => chk[i] !== false).map(s => s.line).filter(Boolean)
    const dropped = r.subs.filter((s, i) => chk[i] === false).map(s => s.line).filter(Boolean)
    const parts = kept.map(text => ({ text, ko: false }))
    if (dropped.length) parts.push({ text: `KO APP:(${dropped.join(' | ')})`, ko: true })
    return parts
  }

  const rowLineSplit = (r) => {
    const chk = checkedMap[r.key]
    if (!chk) return { main: r.line, ko: '' }
    const kept = r.subs.filter((s, i) => chk[i] !== false).map(s => s.line).filter(Boolean)
    const dropped = r.subs.filter((s, i) => chk[i] === false).map(s => s.line).filter(Boolean)
    return { main: kept.join(' | '), ko: dropped.length ? `KO APP:(${dropped.join(' | ')})` : '' }
  }

  const detailRow = converted.find(r => r.key === detailKey)

  const isExported = (key) => !excludedSet.has(key)

  const toggleExport = (key) => {
    setExcludedSet(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allExported = filtered.every(r => isExported(r.key))
  const someExported = filtered.some(r => !isExported(r.key))
  const toggleAll = (checked) => {
    if (checked) {
      setExcludedSet(prev => {
        const next = new Set(prev)
        filtered.forEach(r => next.delete(r.key))
        return next
      })
    } else {
      setExcludedSet(prev => new Set([...prev, ...filtered.map(r => r.key)]))
    }
  }

  const exportFiltered = filtered.filter(r => isExported(r.key))

  const cols = [
    {
      title: (
        <div onClick={e => e.stopPropagation()}>
          <Checkbox
            checked={allExported}
            indeterminate={someExported && !allExported}
            onChange={e => toggleAll(e.target.checked)}
          />
          <Text type="secondary" className="text-xs"> Chọn</Text>
        </div>
      ),
      dataIndex: 'key', key: 'chk', width: 90, align: 'center',
      render: (_, r) => (
        <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <Checkbox
            checked={isExported(r.key)}
            onChange={e => toggleExport(r.key)}
          />
        </div>
      ),
    },
    { title: 'SỐ CONT', dataIndex: 'container', key: 'container', width: 160, render: v => <Text strong>{v}</Text> },
    {
      title: 'Dòng chuyển ngữ', dataIndex: 'line', key: 'line',
      render: (_, r) => (
        <Text style={{ fontFamily: 'Consolas, monospace' }}>
          {rowLineParts(r).map((p, i) => (
            <span key={i}>
              {i > 0 ? ' | ' : ''}
              {p.ko
                ? <span style={{ color: 'red', fontWeight: 'bold' }}>{p.text}</span>
                : p.text}
            </span>
          ))}
        </Text>
      ),
    },
  ]

  const currentList = (mappings[modalGroup] || [])
    .map((m, idx) => ({ ...m, _idx: idx }))
    .filter(m =>
      !modalSearch
      || normalize(m.code).includes(normalize(modalSearch))
      || normalize(m.word).includes(normalize(modalSearch))
    )

  const dupCodes = (() => {
    const seen = new Map()
    const dups = new Set()
    for (const m of mappings[modalGroup] || []) {
      const c = normalize(m.code)
      if (!c) continue
      if (seen.has(c)) dups.add(seen.get(c))
      else seen.set(c, c)
    }
    return dups
  })()

  return (
    <Space orientation="vertical" size="middle" className="w-full">
      <Row gutter={[16, 16]}>
        <Col span={24} lg={14}>
          <Card title={<Space><TranslationOutlined /><Text strong>1. Chọn file EST (.xls / .xlsx)</Text></Space>}>
            <Dragger
              accept=".xls,.xlsx,.csv"
              beforeUpload={handleUpload}
              showUploadList={false}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">Nhấn hoặc kéo file EST vào đây</p>
              <p className="ant-upload-hint">.xls, .xlsx, .csv</p>
            </Dragger>
            {fileName && <Alert title={status} type="info" showIcon className="mt-3" />}
            <Checkbox
              checked={splitIT}
              onChange={e => applySplitIT(e.target.checked)}
              className="mt-3"
            >
              Tách nhiều IT trong 1 ô thành nhiều dòng (VD: <code>1 2 3</code> → 3 dòng)
            </Checkbox>
          </Card>
        </Col>
        <Col span={24} lg={10}>
          <Card title={<Space><FolderOpenOutlined /><Text strong>2. Nhận dạng cột (tự đọc)</Text></Space>} size="small">
            {colMap.COMCODE === undefined ? (
              <Text type="secondary">Chưa có file. Tải file EST lên để tự nhận dạng cột.</Text>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(colMap).map(([k, idx]) => (
                  <Tag key={k} color="blue"><Text strong>{k}</Text> → cột {idx + 1}</Tag>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title={<Space><FormatPainterOutlined /><Text strong>3. Chuyển đổi mã → tiếng Việt (theo từng cột)</Text></Space>}
      >
        <Alert
          type="info"
          showIcon
          title="Mỗi cột là một Modal riêng. Nhấn vào nút cột mình cần, rồi thêm/sửa/xóa quy tắc chuyển ngữ — không tìm thấy mã thì giữ nguyên mã gốc."
          className="mb-3"
        />
        <Row gutter={[8, 8]}>
          {MAPPING_GROUPS.map(g => {
            const count = (mappings[g.field] || []).length
            return (
              <Col key={g.field} span={24} sm={12} md={8} lg={8}>
                <Button
                  block
                  size="large"
                  style={{ textAlign: 'left', height: 'auto', padding: '10px 14px' }}
                  onClick={() => { setModalGroup(g.field); setModalSearch('') }}
                >
                  <Space orientation="vertical" size={0} className="w-full">
                    <Space>
                      <Tag color={g.color}>{g.label}</Tag>
                      <Text type="secondary" className="text-xs">{g.desc}</Text>
                    </Space>
                    <Space className="mt-1">
                      <Text strong className="text-base">{count}</Text>
                      <Text type="secondary" className="text-xs">quy tắc</Text>
                    </Space>
                  </Space>
                </Button>
              </Col>
            )
          })}
          <Col span={24} sm={12} md={8} lg={8}>
            <Button
              block
              size="large"
              style={{ textAlign: 'left', height: 'auto', padding: '10px 14px' }}
              onClick={() => setHideModalOpen(true)}
            >
              <Space orientation="vertical" size={0} className="w-full">
                <Space>
                  <Tag color="magenta">Giá trị ẩn</Tag>
                  <Text type="secondary" className="text-xs">LTH / WDT / QTY</Text>
                </Space>
                <Space className="mt-1">
                  <Text strong className="text-base">
                    {['LTH', 'WDT', 'QTY'].reduce((n, f) => n + (String(hideVals[f] || '').split(/[,;\s]+/).filter(Boolean).length || 0), 0) || 0}
                  </Text>
                  <Text type="secondary" className="text-xs">giá trị ẩn</Text>
                </Space>
              </Space>
            </Button>
          </Col>
        </Row>
        <Modal
          open={hideModalOpen}
          title={
            <Space>
              <SettingOutlined />
              <Text strong>Giá trị ẩn</Text>
              <Tag color="magenta">ô trùng giá trị đã cài thì bỏ qua trong dòng</Tag>
            </Space>
          }
          width={480}
          onCancel={() => setHideModalOpen(false)}
          footer={[
            <Button key="h" type="primary" onClick={() => setHideModalOpen(false)}>Xong</Button>,
          ]}
        >
          {['LTH', 'WDT', 'QTY'].map(f => (
            <div key={f} className="mb-4">
              <Text strong className="block mb-1">{f}</Text>
              <Input
                allowClear
                placeholder="Nhập các giá trị, cách nhau dấu phẩy hoặc space. VD: 0, 100"
                value={hideVals[f] || ''}
                onChange={e => applyHideVals(f, e.target.value)}
              />
              {(hideVals[f] || '').split(/[,;\s]+/).filter(Boolean).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(hideVals[f] || '').split(/[,;\s]+/).filter(Boolean).map((v, i) => (
                    <Tag key={i} color="magenta">{v}</Tag>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Text type="secondary" className="block text-xs">
            Áp dụng ngay khi nhập. Ví dụ LTH: "0, 3000" → chỉ ẩn khi ô bằng 0 hoặc 3000.
          </Text>
        </Modal>

        <Modal
          open={modalGroup !== null}
          title={
            <Space>
              <SettingOutlined />
              <Text strong>{MAPPING_GROUPS.find(g => g.field === modalGroup)?.label || 'Chuyển đổi'}</Text>
              <Tag color={MAPPING_GROUPS.find(g => g.field === modalGroup)?.color}>
                {(mappings[modalGroup] || []).length} quy tắc
              </Tag>
            </Space>
          }
          width={620}
          onCancel={() => setModalGroup(null)}
          footer={[
            <Space key="f">
              <Button
                icon={<SearchOutlined />}
                size="middle"
              />
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={addMapping}
              >
                Thêm quy tắc
              </Button>
              <Button type="primary" onClick={() => setModalGroup(null)}>Xong</Button>
            </Space>,
          ]}
        >
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm mã hoặc chuyển ngữ..."
            value={modalSearch}
            onChange={e => setModalSearch(e.target.value)}
            className="mb-3"
          />
          <div className="mb-3 rounded-lg bg-[#fafafa] p-3">
            <Space align="center" className="w-full justify-between mb-2">
              <Space>
                <SettingOutlined className="text-blue-500" />
                <Text strong>Thêm hàng loạt từ Excel</Text>
              </Space>
              <Tag color="blue">{modalPaste.trim() ? modalPaste.split(/\r?\n/).filter(r => r.trim()).length : 0} dòng dán</Tag>
            </Space>
            <Upload
              accept=".xls,.xlsx,.csv"
              beforeUpload={handleMappingFile}
              showUploadList={false}
            >
              <Button block icon={<UploadOutlined />} className="mb-2">
                {mappingFileName ? `Đã chọn: ${mappingFileName}` : 'Chọn file Excel (2 cột: Mã, Chuyển ngữ)'}
              </Button>
            </Upload>
            <Input.TextArea
              rows={3}
              value={modalPaste}
              placeholder={'Hoặc copy 2 cột Mã + Chuyển ngữ từ bảng tính rồi dán vào đây…\n\nFWA\tsàn\nBXXX\ttoàn sàn'}
              onChange={e => setModalPaste(e.target.value)}
              className="font-mono"
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              className="mt-2"
              block
              onClick={pasteMappings}
              disabled={!modalPaste.trim()}
            >
              Thêm {modalPaste.trim() ? modalPaste.split(/\r?\n/).filter(r => r.trim()).length : 0} quy tắc từ Excel
            </Button>
          </div>
          {dupCodes.size > 0 && (
            <Alert
              type="warning"
              showIcon
              title={`Có ${dupCodes.size} mã trùng lặp: ${[...dupCodes].join(', ')}. Vui lòng sửa hoặc xóa mã trùng.`}
              className="mb-3"
            />
          )}
          <Table
            size="small"
            rowKey="_idx"
            dataSource={currentList}
            pagination={{ pageSize: 7, size: 'small', showTotal: total => `${total} quy tắc` }}
            columns={[
              {
                title: 'Mã', dataIndex: 'code', width: 240,
                render: (_, r) => {
                  const dup = dupCodes.has(normalize(r.code))
                  return (
                    <Row gutter={4} align="middle">
                      <Col span={20}>
                        <Input
                          value={r.code}
                          status={dup ? 'error' : undefined}
                          style={dup ? { color: 'red', fontWeight: 'bold' } : undefined}
                          placeholder="VD: FWA, DG23..."
                          onChange={e => updateMapping(r._idx, 'code', e.target.value)}
                        />
                      </Col>
                      <Col span={4}><Popconfirm title="Xóa quy tắc này?" onConfirm={() => removeMapping(r._idx)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Col>
                    </Row>
                  )
                },
              },
              {
                title: 'Chuyển ngữ (tiếng Việt)', dataIndex: 'word', width: 300,
                render: (_, r) => (
                  <Input value={r.word} placeholder="VD: sàn, toàn sàn..." onChange={e => updateMapping(r._idx, 'word', e.target.value)} />
                ),
              },
            ]}
          />
          {currentList.length === 0 && (
            <Alert type="warning" showIcon title="Chưa có quy tắc nào. Nhấn 'Thêm quy tắc' để bắt đầu." className="mt-3" />
          )}
        </Modal>
      </Card>

      <Card title={<Space><TableOutlined /><Text strong>4. Mẫu 1 dòng chuyển ngữ</Text></Space>} size="small">
        <Input.TextArea
          value={template}
          onChange={e => { setTemplate(e.target.value); localStorage.setItem(STORAGE_TEMPLATE, e.target.value) }}
          rows={2}
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {TIP_TOKENS.map(t => (
            <Tag
              key={t.token}
              color="purple"
              className="cursor-pointer"
              onClick={() => {
                const next = template + t.token
                setTemplate(next)
                localStorage.setItem(STORAGE_TEMPLATE, next)
              }}
            >
              {t.token} <Text type="secondary" className="text-xs">{t.desc}</Text>
            </Tag>
          ))}
        </div>
      </Card>

      {converted.length > 0 && (
        <Card
          title={
            <Space>
              <TableOutlined />
              <Text strong>5. Kết quả ({filtered.length} / {converted.length} dòng)</Text>
              <Tag color="green">
                {exportFiltered.length} dòng sẽ xuất
              </Tag>
            </Space>
          }
          extra={
            <Space>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Tìm số CONT..."
                value={resultSearch}
                onChange={e => setResultSearch(e.target.value)}
                style={{ width: 220 }}
              />
              <Button icon={<ReloadOutlined />} onClick={refreshAll}>Làm mới</Button>
              <Button icon={<CopyOutlined />} onClick={copyAll}>Copy tất cả</Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={exportExcel}>
                Xuất Excel ({exportFiltered.length})
              </Button>
            </Space>
          }
        >
          <Table
            size="small"
            rowKey="key"
            dataSource={filtered}
            columns={cols}
            pagination={{ pageSize: 10, showTotal: total => `${total} dòng` }}
            scroll={{ x: 800 }}
            onRow={r => ({ style: { cursor: 'pointer' }, onClick: () => openDetail(r) })}
          />
          <Modal
            open={detailKey !== null}
            title={
              <Space>
                <SettingOutlined />
                <Text strong>Chọn IT — {detailRow?.container}</Text>
                <Tag color="blue">{(detailRow?.subs || []).length} IT</Tag>
              </Space>
            }
            width={560}
            onCancel={applyDetail}
            footer={[
              <Space key="d">
                <Button onClick={() => setDetailChecks(Object.fromEntries((detailRow?.subs || []).map((_, i) => [i, true])))}>
                  Chọn tất cả
                </Button>
                <Button onClick={() => setDetailChecks(Object.fromEntries((detailRow?.subs || []).map((_, i) => [i, false])))}>
                  Bỏ chọn
                </Button>
                <Button type="primary" onClick={applyDetail}>Xong</Button>
              </Space>,
            ]}
          >
            <Row gutter={[8, 8]}>
              <Col span={10}>
                <div className="flex flex-col gap-1 max-h-[320px] overflow-auto pr-2">
                  {(detailRow?.subs || []).map((s, i) => (
                    <Checkbox
                      key={i}
                      checked={detailChecks[i] !== false}
                      onChange={e => setDetailChecks(prev => ({ ...prev, [i]: e.target.checked }))}
                    >
                      <Text strong>IT {s.it}</Text>
                    </Checkbox>
                  ))}
                </div>
              </Col>
              <Col span={14}>
                <Text type="secondary" className="text-xs">Xem trước dòng:</Text>
                <div className="rounded bg-[#fafafa] p-2 mt-1 font-mono text-xs whitespace-pre-wrap break-all" style={{ maxHeight: 320, overflow: 'auto' }}>
                  {detailRow
                    ? (() => {
                        const kept = detailRow.subs.filter((_, i) => detailChecks[i] !== false).map(s => s.line)
                        const dropped = detailRow.subs.filter((_, i) => detailChecks[i] === false).map(s => s.line)
                        return (
                          <>
                            {kept.join(' | ')}
                            {dropped.length > 0 && (
                              <>
                                {kept.length > 0 ? ' | ' : ''}
                                <span style={{ color: 'red', fontWeight: 'bold' }}>KO APP:({dropped.join(' | ')})</span>
                              </>
                            )}
                          </>
                        )
                      })()
                    : ''}
                </div>
              </Col>
            </Row>
          </Modal>
        </Card>
      )}
    </Space>
  )
}

export default EstTranslator
