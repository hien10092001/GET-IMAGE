import { useState } from 'react'
import * as XLSX from 'xlsx-js-style'
import {
  Card, Button, Space, Typography, Table, Tag, Alert, message,
  Upload, Descriptions, Tabs, Checkbox, InputNumber, Statistic,
  Row, Col, Tooltip, Select,
} from 'antd'
import {
  UploadOutlined, DownloadOutlined, ContainerOutlined, ReadOutlined,
  FileSearchOutlined, ReloadOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import sampleUrl from '../file/DOC FILE NHIET DO HT/SSZLU501.449?url'

const { Dragger } = Upload
const { Text } = Typography

const PRODUCT_SIGNATURE = 'STARCOOL'

const SENSOR_IDS = [0x04, 0x05, 0x06, 0x07, 0x0d, 0x0e]

const HEADER_GROUPS = [
  {
    title: 'Thông tin chung',
    keys: ['$ProductId', '$Version', 'Product type', 'Container ID', 'Extraction date', 'Unit system', 'Retriever', 'Comments'],
  },
  {
    title: 'Cấu hình / Model',
    keys: [
      'Model code', 'Refrigerant', 'Valve type', 'Compressor type', 'Control type',
      'AirEx type', 'Unit system', 'Phase detection', 'Low pressure type', 'High pressure type',
      'Water Cooled', 'Heater variant', 'Customer config', 'Door sensor', 'Beacon', 'Air Leak',
      'CO2', 'O2', 'DS',
    ],
  },
  {
    title: 'Offset cảm biến',
    keys: ['USDA 1 Offset [K]', 'USDA 2 Offset [K]', 'USDA 3 Offset [K]', 'Cargo Offset [K]'],
  },
  {
    title: 'Thiết bị / Serial',
    keys: ['SMC', 'SUP', 'SPM', 'RH', 'FC', 'Modem'],
  },
  {
    title: 'Giờ chạy (running hours)',
    keys: [
      'Unit', 'Compressor', 'Evaporator fans', 'Condenser fan', 'Evaporator heater',
      'Expansion valve', 'Hotgas valve', 'Economizer valve',
    ],
  },
]

function hexByte(v) {
  return v.toString(16).padStart(2, '0').toUpperCase()
}

function toHex(bytes, sep = ' ') {
  const out = []
  for (let i = 0; i < bytes.length; i++) out.push(hexByte(bytes[i]))
  return out.join(sep)
}

function toAscii(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]
    s += c >= 32 && c <= 126 ? String.fromCharCode(c) : '.'
  }
  return s
}

function readU32(bytes, o) {
  return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0
}

function findBinaryStart(bytes) {
  const limit = Math.min(bytes.length, 65536)
  let run = 0
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) {
      run += 1
    } else {
      if (run >= 32) return i
      run = 0
    }
  }
  return 0
}

function parseHeader(bytes, binaryStart) {
  const end = binaryStart > 0 ? binaryStart : Math.min(bytes.length, 4096)
  let text = ''
  for (let i = 0; i < end; i++) text += String.fromCharCode(bytes[i])

  const pairs = []
  for (const raw of text.split('\x00')) {
    const seg = raw.replace(/[^\x20-\x7e]+/g, ' ').trim()
    if (!seg) continue
    const eq = seg.indexOf('=')
    if (eq <= 0) continue
    const key = seg.slice(0, eq).trim()
    const value = seg.slice(eq + 1).trim()
    if (!key || !/^[\x20-\x7e]+$/.test(key)) continue
    pairs.push({ key, value })
  }
  return pairs
}

function detectRecordSize(bytes, start) {
  let best = { size: 18, score: 0 }
  for (let size = 6; size <= 40; size++) {
    const available = Math.floor((bytes.length - start) / size)
    if (available < 24) continue
    const sample = Math.min(available, 6000)
    let same = 0
    let total = 0
    for (let i = 6; i < sample; i++) {
      const a = bytes[start + i * size]
      const b = bytes[start + (i - 6) * size]
      total += 1
      if (a === b) same += 1
    }
    const score = total ? same / total : 0
    if (score > best.score + 1e-9) best = { size, score }
  }
  if (best.score < 0.6) return 18
  return best.size
}

function parseRecords(bytes, start, size) {
  const records = []
  for (let o = start; o + size <= bytes.length; o += size) {
    const payload = bytes.subarray(o + 5, o + size)
    records.push({
      offset: o,
      id: bytes[o],
      counter: readU32(bytes, o + 1),
      payload,
    })
  }
  return records
}

function buildGroups(records) {
  const counts = {}
  for (const r of records) counts[r.id] = (counts[r.id] || 0) + 1
  const max = Math.max(0, ...Object.values(counts))
  const mainIds = new Set(
    Object.keys(counts)
      .filter(k => counts[k] >= max * 0.5)
      .map(Number)
      .filter(id => SENSOR_IDS.includes(id))
  )
  if (mainIds.size === 0) SENSOR_IDS.forEach(id => { if (counts[id]) mainIds.add(id) })

  const map = new Map()
  for (const r of records) {
    if (!mainIds.has(r.id)) continue
    let g = map.get(r.counter)
    if (!g) {
      g = { counter: r.counter, channels: {}, offset: r.offset }
      map.set(r.counter, g)
    }
    g.channels[r.id] = r.payload
  }
  const groups = [...map.values()].sort((a, b) => a.counter - b.counter)
  const events = records.filter(r => !mainIds.has(r.id))
  return { mainIds, groups, events }
}

function readI16(bytes, o) {
  const v = bytes[o] | (bytes[o + 1] << 8)
  return v >= 0x8000 ? v - 0x10000 : v
}

// Hệ số nhiệt độ đã đối chiếu với file export StarView (SSZLU501449.csv):
//   Tret = int16(0x04 payload @1) / 400  -> khớp 100% trong ±0.1 °C
//   Tsup = int16(0x06 payload @1) / 400  -> khớp ~90% trong ±0.1 °C (sai số TB 0.03 °C)
const TEMP_SCALE = 400

function decodeTret(payload) {
  if (!payload || payload.length < 3) return null
  return readI16(payload, 1) / TEMP_SCALE
}

function decodeTsup(payload) {
  if (!payload || payload.length < 3) return null
  return readI16(payload, 1) / TEMP_SCALE
}

// Tsuc (nhiệt độ hơi hút) = int16(0x06 payload @4) / 400.
// Khớp ~84% trong ±0.5 °C (sai số TB 0.30 °C) so với file StarView.
function decodeTsuc(payload) {
  if (!payload || payload.length < 6) return null
  return readI16(payload, 4) / TEMP_SCALE
}

// AirEx (thông gió không khí ngoài, m3/h) lưu ở byte 0x04 payload[11] dạng mã vị trí.
const AIR_EX_BY_BYTE = { 0: 0, 1: 0, 5: 10, 7: 15, 9: 15, 20: 20, 25: 25 }

function decodeAirEx(payload) {
  if (!payload || payload.length < 12) return null
  const v = payload[11]
  return Object.prototype.hasOwnProperty.call(AIR_EX_BY_BYTE, v) ? AIR_EX_BY_BYTE[v] : null
}

const TSET_BY_BYTE = { 6: -25, 30: 3, 56: -20, 65: 6.5, 76: -18, 100: 10, 230: 23, 246: -1, 250: 25 }

// Setpoint lưu ở byte 0x04 payload[9] dưới dạng low-byte của (Tset × 10).
// Giá trị thực là một trong hai ứng viên L/10 hoặc (L-256)/10; chọn ứng viên
// gần nhiệt độ khí về (Tret) nhất vì bộ điều khiển luôn kéo Tret về setpoint.
function decodeSetpoint(g04, tret) {
  if (!g04 || g04.length < 10) return null
  const L = g04[9]
  if (Object.prototype.hasOwnProperty.call(TSET_BY_BYTE, L)) return TSET_BY_BYTE[L]
  const pos = L / 10
  const neg = (L - 256) / 10
  let value = pos
  if (Number.isFinite(tret)) {
    value = Math.abs(pos - tret) <= Math.abs(neg - tret) ? pos : neg
  }
  return Math.round(value * 10) / 10
}

function decodeTemps(g) {
  const tret = decodeTret(g.channels[0x04])
  const tsup = decodeTsup(g.channels[0x06])
  const tset = decodeSetpoint(g.channels[0x04], tret)
  const tsuc = decodeTsuc(g.channels[0x06])
  const airEx = decodeAirEx(g.channels[0x04])
  return { tsup, tret, tset, tsuc, airEx }
}

function temperatureSummary(groups) {
  const tsup = []
  const tret = []
  const tsuc = []
  let last = { tsup: null, tret: null, tset: null, tsuc: null, airEx: null }
  for (const g of groups) {
    const t = decodeTemps(g)
    if (t.tsup !== null) tsup.push(t.tsup)
    if (t.tret !== null) tret.push(t.tret)
    if (t.tsuc !== null) tsuc.push(t.tsuc)
    if (t.tsup !== null || t.tret !== null || t.tset !== null) last = t
  }
  const stat = (arr) => {
    if (!arr.length) return null
    const s = [...arr].sort((x, y) => x - y)
    const sum = s.reduce((a, b) => a + b, 0)
    return {
      min: s[0],
      max: s[s.length - 1],
      median: s[s.length >> 1],
      avg: sum / s.length,
    }
  }
  return { tsup: stat(tsup), tret: stat(tret), tsuc: stat(tsuc), last }
}

function parseExtractionDate(pairs) {
  const pair = pairs.find(p => p.key.toLowerCase().includes('extraction date'))
  if (!pair) return null
  const m = pair.value.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const parts = []
  if (days) parts.push(`${days} ngày`)
  if (hours) parts.push(`${hours} giờ`)
  if (!days && mins) parts.push(`${mins} phút`)
  return parts.join(' ') || '0 phút'
}

const V2B_SECTION_SIZES = {
  USDA: 11,
  TS: 11,
  TRIP: 30,
  EVENT: 7,
  EVENT3: 7,
  WATCH: 30,
  IoT: 7,
}

const V2B_EVENT_SECTIONS = ['EVENT', 'EVENT3', 'IoT']
const V2B_SENSOR_SECTIONS = ['USDA', 'TS']

function readV2bText(bytes, start, end) {
  let out = ''
  for (let i = start; i < end; i++) {
    const c = bytes[i]
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

function isV2bFormat(bytes) {
  if (bytes.length < 0x260) return false
  if (bytes[0] !== 0x10 || bytes[0x10] !== 0x20) return false
  const dirEnd = readU32(bytes, 0x14)
  if (dirEnd < 0x40 || dirEnd > 0x1000 || dirEnd > bytes.length) return false
  const names = []
  for (let o = 0x20; o + 32 <= dirEnd; o += 32) {
    const name = readV2bText(bytes, o, o + 16)
    if (name) names.push(name)
  }
  return ['IDS', 'USDA', 'TRIP', 'EVENT'].some(n => names.includes(n))
}

function parseV2bDirectory(bytes) {
  const dirEnd = readU32(bytes, 0x14)
  const sections = []
  for (let o = 0x20; o + 32 <= dirEnd; o += 32) {
    const name = readV2bText(bytes, o, o + 16)
    if (!name) continue
    const start = readU32(bytes, o + 16)
    const end = readU32(bytes, o + 20)
    const pageCount = readU32(bytes, o + 28)
    if (start >= end || end > bytes.length) continue
    sections.push({ name, start, end, length: end - start, pageCount })
  }
  return sections
}

function parseV2bRecords(bytes, section) {
  const size = V2B_SECTION_SIZES[section.name]
  if (!size) return null
  const records = []
  for (let o = section.start; o + size <= section.end; o += size) {
    let allFF = true
    for (let i = 0; i < size; i++) {
      if (bytes[o + i] !== 0xff) { allFF = false; break }
    }
    if (allFF) continue
    const counter = ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0
    const payload = bytes.subarray(o + 4, o + size)
    records.push({ offset: o, counter, payload, hex: toHex(payload), ascii: toAscii(payload) })
  }
  records.sort((a, b) => a.counter - b.counter)
  return records
}

function decodeV2bSoftware(bytes, section) {
  const digits = []
  for (let i = section.start; i < section.end; i++) {
    const c = bytes[i]
    if (c >= 0x30 && c <= 0x39) digits.push(String.fromCharCode(c))
  }
  if (digits.length >= 2) return digits.join('.')
  return toHex(bytes.subarray(section.start, section.end))
}

function parseV2b(buffer, fileName) {
  const bytes = new Uint8Array(buffer)
  const extractionUnix = readU32(bytes, 0x18)
  const extraction = new Date(extractionUnix * 1000)

  const sections = parseV2bDirectory(bytes)
  for (const s of sections) {
    s.recordSize = V2B_SECTION_SIZES[s.name] || null
    s.records = parseV2bRecords(bytes, s)
  }

  const allCounters = sections.flatMap(s => (s.records || []).map(r => r.counter))
  const highCounts = new Map()
  for (const c of allCounters) {
    if (!c) continue
    const h = c >>> 24
    highCounts.set(h, (highCounts.get(h) || 0) + 1)
  }
  let modeHigh = null
  let modeCount = -1
  for (const [h, n] of highCounts) {
    if (n > modeCount) { modeHigh = h; modeCount = n }
  }
  for (const s of sections) {
    if (!s.records) continue
    s.records = s.records.filter(r => r.counter !== 0 && modeHigh !== null && Math.abs((r.counter >>> 24) - modeHigh) <= 1)
  }

  const parsedSections = sections.filter(s => s.records && s.records.length)
  const counters = parsedSections.flatMap(s => s.records.map(r => r.counter))
  const minCounter = counters.length ? Math.min(...counters) : 0
  const maxCounter = counters.length ? Math.max(...counters) : 0

  const idsSection = sections.find(s => s.name === 'IDS')
  const serialSection = sections.find(s => s.name === 'SERIAL')
  const softSection = sections.find(s => s.name === 'SOFT')
  const initSection = sections.find(s => s.name === 'INIT')

  const idsText = idsSection ? readV2bText(bytes, idsSection.start, idsSection.end) : ''
  const containerId = (idsText.match(/[A-Z]{4}\d{7}/) || [idsText])[0] || ''
  const serialText = serialSection ? readV2bText(bytes, serialSection.start, serialSection.end) : ''
  const serial = (serialText.match(/RC[0-9A-Z]{8,}/) || [serialText])[0] || ''
  const software = softSection ? decodeV2bSoftware(bytes, softSection) : ''
  const initHex = initSection ? toHex(bytes.subarray(initSection.start, initSection.end)) : ''

  const metaRows = [
    { key: 'Định dạng', value: 'StarCool V2b (binary archive)' },
    { key: 'Container ID', value: containerId || '—' },
    { key: 'Serial controller', value: serial || '—' },
    { key: 'Phiên bản phần mềm', value: software || '—' },
    { key: 'Ngày xuất file', value: formatDate(extraction) },
    { key: 'Unix timestamp', value: String(extractionUnix) },
    { key: 'Số section', value: String(sections.length) },
    { key: 'Tổng bản ghi đọc được', value: counters.length.toLocaleString('vi-VN') },
    { key: 'Counter nhỏ nhất', value: '0x' + minCounter.toString(16).toUpperCase() },
    { key: 'Counter lớn nhất', value: '0x' + maxCounter.toString(16).toUpperCase() },
  ]

  return {
    format: 'v2b',
    _bytes: bytes,
    fileName,
    fileSize: bytes.length,
    extraction,
    extractionUnix,
    sections,
    metaRows,
    pairs: metaRows,
    minCounter,
    maxCounter,
    totalRecords: counters.length,
    containerId,
    serial,
    software,
    initHex,
  }
}

function exportV2bExcel(data, timeFor) {
  const wb = XLSX.utils.book_new()

  const infoRows = [['Hạng mục', 'Giá trị']]
  for (const p of data.metaRows) infoRows.push([p.key, p.value])
  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows)
  wsInfo['!cols'] = [{ wch: 28 }, { wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Thong tin')

  const structRows = [[
    'Section', 'Offset', 'Độ dài (byte)', 'Record size', 'Số bản ghi',
    'Counter đầu', 'Counter cuối', 'Từ (ước lượng)', 'Đến (ước lượng)',
  ]]
  for (const s of data.sections) {
    const recs = s.records || []
    structRows.push([
      s.name,
      '0x' + s.start.toString(16).toUpperCase(),
      s.length,
      s.recordSize || '',
      recs.length,
      recs.length ? '0x' + recs[0].counter.toString(16).toUpperCase() : '',
      recs.length ? '0x' + recs[recs.length - 1].counter.toString(16).toUpperCase() : '',
      recs.length ? timeFor(recs[0].counter) : '',
      recs.length ? timeFor(recs[recs.length - 1].counter) : '',
    ])
  }
  const wsStruct = XLSX.utils.aoa_to_sheet(structRows)
  wsStruct['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 11 }, { wch: 11 },
    { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, wsStruct, 'Cau truc')

  for (const s of data.sections) {
    if (!s.records || !s.records.length) continue
    const aoa = [['#', 'Offset', 'Counter', 'Counter (hex)', 'Thời gian (ước lượng)', 'Payload (hex)', 'ASCII']]
    s.records.forEach((r, i) => aoa.push([
      i + 1,
      '0x' + r.offset.toString(16).toUpperCase(),
      r.counter,
      '0x' + r.counter.toString(16).toUpperCase(),
      timeFor(r.counter),
      r.hex,
      r.ascii,
    ]))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 7 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 60 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }

  const base = (data.fileName || 'starcool').replace(/\.[^.]+$/, '')
  XLSX.writeFile(wb, `${base}_v2b.xlsx`)
  message.success('Đã xuất Excel V2b')
}

function parseStarCool(buffer, fileName) {
  const bytes = new Uint8Array(buffer)
  const binaryStart = findBinaryStart(bytes)
  const pairs = parseHeader(bytes, binaryStart)
  const signature = (pairs[0]?.value || '').toUpperCase()
  const isStarCool = signature.includes(PRODUCT_SIGNATURE) || pairs.some(p => /container id/i.test(p.key))

  const recordSize = isStarCool ? detectRecordSize(bytes, binaryStart) : 18
  const records = binaryStart > 0 ? parseRecords(bytes, binaryStart, recordSize) : []
  const { mainIds, groups, events } = buildGroups(records)

  const counters = records.map(r => r.counter)
  const minCounter = counters.length ? Math.min(...counters) : 0
  const maxCounter = counters.length ? Math.max(...counters) : 0
  const extraction = parseExtractionDate(pairs)

  return {
    _bytes: bytes,
    fileName,
    fileSize: bytes.length,
    binaryStart,
    recordSize,
    isStarCool,
    pairs,
    records,
    mainIds,
    groups,
    events,
    minCounter,
    maxCounter,
    extraction,
  }
}

function V2bPanels({ data, timeFor, unitSeconds, onUnitSecondsChange }) {
  const firstLog = data.sections.find(s => s.records && s.records.length)
  const [activeSection, setActiveSection] = useState(firstLog ? firstLog.name : '')
  const [activeTab, setActiveTab] = useState('info')

  const logSections = data.sections.filter(s => s.records && s.records.length)
  const section = data.sections.find(s => s.name === activeSection) || logSections[0]
  const records = section?.records || []
  const isEvent = section && V2B_EVENT_SECTIONS.includes(section.name)
  const isSensor = section && V2B_SENSOR_SECTIONS.includes(section.name)

  const logColumns = [
    {
      title: '#',
      width: 55,
      render: (_, __, i) => i + 1,
    },
    {
      title: 'Thời gian (ước lượng)',
      width: 175,
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Text strong className="text-xs">{timeFor(r.counter) || '—'}</Text>
          <Text type="secondary" className="text-[11px]">
            counter {r.counter.toLocaleString('vi-VN')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Offset',
      width: 90,
      render: (_, r) => <Text code className="text-[11px]">0x{r.offset.toString(16).toUpperCase()}</Text>,
    },
    {
      title: 'Counter (hex)',
      width: 110,
      render: (_, r) => <Text code className="text-[11px]">0x{r.counter.toString(16).toUpperCase()}</Text>,
    },
    ...(isEvent ? [{
      title: 'Mã / giá trị',
      width: 120,
      render: (_, r) => {
        if (r.payload.length < 3) return <Text type="secondary">—</Text>
        const code = (r.payload[0] << 8) | r.payload[1]
        return (
          <Text className="text-xs">
            <Tag color="blue">0x{code.toString(16).toUpperCase().padStart(4, '0')}</Tag>
            {r.payload[2]}
          </Text>
        )
      },
    }] : []),
    ...(isSensor ? [{
      title: 'Byte cuối',
      width: 85,
      render: (_, r) => (
        <Text code className="text-[11px]">
          {r.payload.length ? '0x' + hexByte(r.payload[r.payload.length - 1]) : '—'}
        </Text>
      ),
    }] : []),
    {
      title: 'Payload (hex)',
      width: 320,
      render: (_, r) => (
        <Text code className="text-[10px]" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
          {r.hex || '—'}
        </Text>
      ),
    },
    {
      title: 'ASCII',
      width: 150,
      render: (_, r) => <Text className="text-[10px]" type="secondary">{r.ascii}</Text>,
    },
  ]

  const structureColumns = [
    {
      title: 'Section',
      width: 120,
      fixed: 'left',
      render: (_, s) => <Text strong className="text-xs">{s.name}</Text>,
    },
    {
      title: 'Offset',
      width: 100,
      render: (_, s) => <Text code className="text-[11px]">0x{s.start.toString(16).toUpperCase()}</Text>,
    },
    {
      title: 'Độ dài',
      width: 100,
      align: 'right',
      render: (_, s) => s.length.toLocaleString('vi-VN'),
    },
    {
      title: 'Record size',
      width: 100,
      align: 'right',
      render: (_, s) => (s.recordSize ? `${s.recordSize} B` : <Text type="secondary">—</Text>),
    },
    {
      title: 'Số bản ghi',
      width: 110,
      align: 'right',
      render: (_, s) => (s.records ? s.records.length.toLocaleString('vi-VN') : <Text type="secondary">—</Text>),
    },
    {
      title: 'Counter đầu → cuối',
      width: 220,
      render: (_, s) => {
        if (!s.records || !s.records.length) return <Text type="secondary">—</Text>
        const a = s.records[0].counter
        const b = s.records[s.records.length - 1].counter
        return <Text code className="text-[11px]">0x{a.toString(16).toUpperCase()} → 0x{b.toString(16).toUpperCase()}</Text>
      },
    },
    {
      title: 'Khoảng (ước lượng)',
      width: 200,
      render: (_, s) => {
        if (!s.records || s.records.length < 2) return <Text type="secondary">—</Text>
        const span = s.records[s.records.length - 1].counter - s.records[0].counter
        return <Text className="text-xs">{formatDuration(span * unitSeconds)}</Text>
      },
    },
  ]

  return (
    <>
      <Card size="small">
        <Row gutter={[16, 8]}>
          <Col xs={12} sm={6}>
            <Statistic title="Container" value={data.containerId || '—'} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Serial controller" value={data.serial || '—'} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Phần mềm" value={data.software || '—'} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Ngày xuất file" value={formatDate(data.extraction)} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Số section" value={data.sections.length} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Bản ghi đọc được" value={data.totalRecords} />
          </Col>
          <Col span={24}>
            <Text type="secondary" className="text-xs">
              Định dạng StarCool V2b: {data.fileSize.toLocaleString('vi-VN')} byte · counter {data.minCounter.toLocaleString('vi-VN')} → {data.maxCounter.toLocaleString('vi-VN')}
            </Text>
          </Col>
        </Row>
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'info',
            label: <Space><ContainerOutlined />Thông tin file</Space>,
            children: (
              <Space orientation="vertical" size="middle" className="w-full">
                <Card size="small" title={<Text strong>Thông tin giải mã</Text>}>
                  <Descriptions
                    bordered
                    size="small"
                    column={{ xs: 1, sm: 1, md: 2, lg: 3 }}
                    items={data.metaRows.map((p, i) => ({
                      key: i,
                      label: <Text className="text-xs">{p.key}</Text>,
                      children: <Text className="text-xs" copyable={p.value.length > 20 ? { text: p.value } : false}>{p.value || '—'}</Text>,
                    }))}
                  />
                </Card>
                <Card size="small" title={<Text strong>Cấu hình INIT (hex)</Text>}>
                  <Text code className="text-[10px]" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
                    {data.initHex || '—'}
                  </Text>
                </Card>
                <Alert
                  type="warning"
                  showIcon
                  title="Cách đọc thời gian"
                  description={
                    <Text className="text-xs">
                      Mỗi bản ghi mở đầu bằng 4 byte counter big-endian. Chưa có tài liệu chính thức về hệ số quy đổi,
                      nên thời gian được ước lượng bằng cách gán counter lớn nhất = ngày xuất file và nhân với hệ số
                      “giây / counter” bạn chọn (mặc định 1). Hãy chỉnh hệ số ở tab Dữ liệu log để khớp thực tế.
                    </Text>
                  }
                />
              </Space>
            ),
          },
          {
            key: 'structure',
            label: <Space><FileSearchOutlined />Cấu trúc section ({data.sections.length})</Space>,
            children: (
              <Table
                size="small"
                rowKey="name"
                columns={structureColumns}
                dataSource={data.sections}
                pagination={false}
                scroll={{ x: 'max-content' }}
              />
            ),
          },
          {
            key: 'log',
            label: <Space><ExperimentOutlined />Dữ liệu log ({data.totalRecords.toLocaleString('vi-VN')})</Space>,
            children: (
              <Space orientation="vertical" size="middle" className="w-full">
                <Space wrap size="middle">
                  <Space>
                    <Text strong className="text-xs">Section:</Text>
                    <Select
                      value={section?.name}
                      onChange={setActiveSection}
                      style={{ minWidth: 200 }}
                      options={logSections.map(s => ({ value: s.name, label: `${s.name} (${s.records.length.toLocaleString('vi-VN')})` }))}
                    />
                  </Space>
                  <Space>
                    <Text className="text-xs">1 counter =</Text>
                    <InputNumber
                      min={0.001}
                      step={0.25}
                      value={unitSeconds}
                      onChange={v => v && onUnitSecondsChange(v)}
                      style={{ width: 100 }}
                    />
                    <Text className="text-xs">giây</Text>
                  </Space>
                  <Text type="secondary" className="text-xs">
                    {records.length.toLocaleString('vi-VN')} bản ghi · khoảng {formatDuration((data.maxCounter - data.minCounter) * unitSeconds)}
                  </Text>
                </Space>
                <Table
                  size="small"
                  rowKey="offset"
                  columns={logColumns}
                  dataSource={records}
                  scroll={{ x: 'max-content' }}
                  pagination={{
                    defaultPageSize: 50,
                    showSizeChanger: true,
                    pageSizeOptions: [20, 50, 100, 200],
                    showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}`,
                  }}
                />
              </Space>
            ),
          },
        ]}
      />
    </>
  )
}

function StarCoolReader() {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [useEstimatedTime, setUseEstimatedTime] = useState(true)
  const [recordSizeOverride, setRecordSizeOverride] = useState(null)
  const [activeView, setActiveView] = useState('info')
  const [v2bUnitSeconds, setV2bUnitSeconds] = useState(1)

  const processBuffer = (buffer, fileName) => {
    try {
      setLoading(true)
      setStatus('Đang đọc file...')
      if (isV2bFormat(new Uint8Array(buffer))) {
        const parsed = parseV2b(buffer, fileName)
        setData(parsed)
        setV2bUnitSeconds(1)
        setRecordSizeOverride(null)
        setActiveView('info')
        setStatus(
          `Đã đọc file StarCool V2b: ${parsed.sections.length} section, ` +
          `${parsed.totalRecords.toLocaleString('vi-VN')} bản ghi.`
        )
        return
      }
      const parsed = parseStarCool(buffer, fileName)
      if (parsed.records.length === 0) {
        setStatus('Không tìm thấy dữ liệu log trong file. Có thể đây không phải file StarView/StarCool.')
        setData(null)
        return
      }
      setData(parsed)
      setRecordSizeOverride(null)
      setActiveView('info')
      setStatus(
        `Đã đọc ${parsed.records.length.toLocaleString('vi-VN')} bản ghi ` +
        `(${parsed.groups.length.toLocaleString('vi-VN')} mốc dữ liệu, ${parsed.events.length.toLocaleString('vi-VN')} sự kiện).`
      )
    } catch (err) {
      setData(null)
      setStatus('Lỗi đọc file: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file) => {
    if (!file) return false
    const buffer = await file.arrayBuffer()
    processBuffer(buffer, file.name)
    return false
  }

  const loadSample = async () => {
    try {
      setLoading(true)
      setStatus('Đang tải file mẫu SSZLU501.449...')
      const res = await fetch(sampleUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = await res.arrayBuffer()
      processBuffer(buffer, 'SSZLU501.449')
    } catch (err) {
      setStatus('Không tải được file mẫu: ' + err.message)
      setLoading(false)
    }
  }

  const rebuildWithRecordSize = (size) => {
    setRecordSizeOverride(size)
    if (!data || !data._bytes) return
    const records = parseRecords(data._bytes, data.binaryStart, size)
    const built = buildGroups(records)
    setData({
      ...data,
      recordSize: size,
      records,
      mainIds: built.mainIds,
      groups: built.groups,
      events: built.events,
      minCounter: records.length ? Math.min(...records.map(r => r.counter)) : 0,
      maxCounter: records.length ? Math.max(...records.map(r => r.counter)) : 0,
    })
  }

  const timeFor = (counter) => {
    if (!data || !data.extraction || !useEstimatedTime) return ''
    const diff = data.maxCounter - counter
    return formatDate(new Date(data.extraction.getTime() - diff * 1000))
  }

  const v2bTimeFor = (counter) => {
    if (!data || data.format !== 'v2b' || !data.extraction || !data.maxCounter) return ''
    const diff = data.maxCounter - counter
    return formatDate(new Date(data.extraction.getTime() - diff * v2bUnitSeconds * 1000))
  }

  const exportExcel = () => {
    if (!data) return
    if (data.format === 'v2b') {
      exportV2bExcel(data, v2bTimeFor)
      return
    }
    const wb = XLSX.utils.book_new()

    const infoRows = [['Key', 'Value']]
    for (const p of data.pairs) infoRows.push([p.key, p.value])
    const wsInfo = XLSX.utils.aoa_to_sheet(infoRows)
    wsInfo['!cols'] = [{ wch: 28 }, { wch: 60 }]
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Thong tin')

    const sensorIds = [...data.mainIds].sort((a, b) => a - b)
    const dataAoa = [[
      'Thoi gian (uoc luong)', 'Counter', 'Counter (hex)', 'Tset (C)', 'Tsup (C)', 'Tret (C)', 'Tsuc (C)', 'AirEx (m3/h)',
      ...sensorIds.map(id => `Kenh ${hexByte(id)}`),
    ]]
    for (const g of data.groups) {
      const t = decodeTemps(g)
      dataAoa.push([
        timeFor(g.counter),
        g.counter,
        '0x' + g.counter.toString(16).toUpperCase(),
        t.tset === null ? '' : t.tset.toFixed(1),
        t.tsup === null ? '' : t.tsup.toFixed(2),
        t.tret === null ? '' : t.tret.toFixed(2),
        t.tsuc === null ? '' : t.tsuc.toFixed(2),
        t.airEx === null ? '' : t.airEx,
        ...sensorIds.map(id => (g.channels[id] ? toHex(g.channels[id]) : '')),
      ])
    }
    const wsData = XLSX.utils.aoa_to_sheet(dataAoa)
    wsData['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, ...sensorIds.map(() => ({ wch: 46 }))]
    XLSX.utils.book_append_sheet(wb, wsData, 'Du lieu do')

    const eventAoa = [['Thoi gian (uoc luong)', 'Loai (hex)', 'Counter', 'Counter (hex)', 'Payload (hex)', 'ASCII']]
    for (const r of data.events) {
      eventAoa.push([
        timeFor(r.counter),
        '0x' + r.id.toString(16).toUpperCase().padStart(2, '0'),
        r.counter,
        '0x' + r.counter.toString(16).toUpperCase(),
        toHex(r.payload),
        toAscii(r.payload),
      ])
    }
    const wsEvent = XLSX.utils.aoa_to_sheet(eventAoa)
    wsEvent['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 46 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsEvent, 'Su kien')

    const rawAoa = [['Offset', 'Loai (hex)', 'Counter', 'Counter (hex)', 'Payload (hex)', 'ASCII']]
    for (const r of data.records) {
      rawAoa.push([
        r.offset,
        '0x' + r.id.toString(16).toUpperCase().padStart(2, '0'),
        r.counter,
        '0x' + r.counter.toString(16).toUpperCase(),
        toHex(r.payload),
        toAscii(r.payload),
      ])
    }
    const wsRaw = XLSX.utils.aoa_to_sheet(rawAoa)
    wsRaw['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 46 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsRaw, 'Ban ghi tho')

    const base = (data.fileName || 'starcool').replace(/\.[^.]+$/, '')
    XLSX.writeFile(wb, `${base}_starcool.xlsx`)
    message.success('Đã xuất Excel')
  }

  const isV2b = data?.format === 'v2b'
  const legacyData = data && !isV2b
  const sensorIds = legacyData ? [...data.mainIds].sort((a, b) => a - b) : []
  const temps = legacyData ? temperatureSummary(data.groups) : null
  const currentSetpoint = temps?.last?.tset ?? null
  const currentTsup = temps?.last?.tsup ?? null
  const currentTret = temps?.last?.tret ?? null
  const currentTsuc = temps?.last?.tsuc ?? null
  const currentAirEx = temps?.last?.airEx ?? null

  const groupColumns = [
    {
      title: '#',
      width: 60,
      render: (_, __, i) => i + 1,
    },
    {
      title: 'Thời gian (ước lượng)',
      width: 175,
      fixed: 'left',
      render: (_, g) => (
        <Space direction="vertical" size={0}>
          <Text strong className="text-xs">{timeFor(g.counter) || '—'}</Text>
          <Text type="secondary" className="text-[11px]">
            counter {g.counter.toLocaleString('vi-VN')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Tset (°C)',
      width: 100,
      fixed: 'left',
      render: (_, g) => {
        const t = decodeTemps(g)
        if (t.tset === null) return <Text type="secondary">—</Text>
        return <Tag color="volcano">{t.tset.toFixed(1)}</Tag>
      },
    },
    {
      title: 'Tsup / Tret (°C)',
      width: 140,
      render: (_, g) => {
        const t = decodeTemps(g)
        if (t.tsup === null && t.tret === null) return <Text type="secondary">—</Text>
        return (
          <Text className="text-xs">
            <Text style={{ color: '#1677ff' }}>{t.tsup === null ? '—' : t.tsup.toFixed(2)}</Text>
            {' / '}
            <Text style={{ color: '#d4380d' }}>{t.tret === null ? '—' : t.tret.toFixed(2)}</Text>
          </Text>
        )
      },
    },
    {
      title: 'Tsuc / AirEx',
      width: 120,
      render: (_, g) => {
        const t = decodeTemps(g)
        if (t.tsuc === null && t.airEx === null) return <Text type="secondary">—</Text>
        return (
          <Text className="text-xs">
            <Text style={{ color: '#13c2c2' }}>{t.tsuc === null ? '—' : t.tsuc.toFixed(2)}</Text>
            {' / '}
            {t.airEx === null ? '—' : t.airEx}
          </Text>
        )
      },
    },
    ...sensorIds.map(id => ({
      title: `Kênh ${hexByte(id)}`,
      width: 190,
      render: (_, g) => {
        const p = g.channels[id]
        if (!p) return <Text type="secondary">—</Text>
        return (
          <Text code className="text-[10px] leading-tight block" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
            {toHex(p)}
          </Text>
        )
      },
    })),
  ]

  const groupedHeader = (() => {
    if (!data) return []
    const used = new Set()
    const sections = HEADER_GROUPS.map(group => {
      const items = []
      for (const key of group.keys) {
        const p = data.pairs.find(x => x.key === key)
        if (p) { items.push(p); used.add(p.key) }
      }
      return { ...group, items }
    }).filter(s => s.items.length > 0)
    const other = data.pairs.filter(p => !used.has(p.key))
    if (other.length) sections.push({ title: 'Khác', items: other })
    return sections
  })()

  return (
    <Space orientation="vertical" size="middle" className="w-full">
      <Card
        title={<Space><ReadOutlined /><Text strong>Đọc file StarCool / StarView (.449, .V2b, ...)</Text></Space>}
        extra={
          <Space>
            <Button icon={<ExperimentOutlined />} onClick={loadSample} loading={loading}>
              Đọc file mẫu SSZLU501.449
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={exportExcel} disabled={!data}>
              Xuất Excel
            </Button>
          </Space>
        }
      >
        <Dragger
          accept=".449,.456,.V2b,.v2b,.bin,.dat,application/octet-stream"
          beforeUpload={handleUpload}
          showUploadList={false}
          disabled={loading}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined /></p>
          <p className="ant-upload-text">Nhấn hoặc kéo file dữ liệu StarCool vào đây</p>
          <p className="ant-upload-hint">
            Datalog SXXXU123.456 / fastlog .BIN / .DAT / archive StarCool .V2b — đọc trực tiếp trên trình duyệt, không upload lên server
          </p>
        </Dragger>
        {status && <Alert title={status} type="info" showIcon className="mt-3" />}
        {legacyData && (
          <Row gutter={[16, 8]} className="mt-4">
            <Col xs={12} sm={6}>
              <Statistic title="Bản ghi" value={data.records.length} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Mốc dữ liệu" value={data.groups.length} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Sự kiện" value={data.events.length} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Kích thước bản ghi" value={data.recordSize} suffix="byte" />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Tset hiện tại"
                value={currentSetpoint === null ? '—' : currentSetpoint.toFixed(1)}
                suffix={currentSetpoint === null ? '' : '°C'}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Tsup (khí cấp)"
                value={currentTsup === null ? '—' : currentTsup.toFixed(2)}
                suffix={currentTsup === null ? '' : '°C'}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Tret (khí về)"
                value={currentTret === null ? '—' : currentTret.toFixed(2)}
                suffix={currentTret === null ? '' : '°C'}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="Tsuc (hơi hút)"
                value={currentTsuc === null ? '—' : currentTsuc.toFixed(2)}
                suffix={currentTsuc === null ? '' : '°C'}
              />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic
                title="AirEx (thông gió)"
                value={currentAirEx === null ? '—' : currentAirEx}
                suffix={currentAirEx === null ? '' : 'm³/h'}
              />
            </Col>
            <Col span={24}>
              <Text type="secondary" className="text-xs">
                Khoảng thời gian log (ước lượng theo counter): {formatDuration(data.maxCounter - data.minCounter)}
                {data.extraction ? ` · Ngày xuất file: ${formatDate(data.extraction)}` : ''}
              </Text>
            </Col>
          </Row>
        )}
      </Card>

      {isV2b && (
        <V2bPanels
          key={data.fileName + ':' + data.fileSize}
          data={data}
          timeFor={v2bTimeFor}
          unitSeconds={v2bUnitSeconds}
          onUnitSecondsChange={setV2bUnitSeconds}
        />
      )}

      {legacyData && (
        <>
          <Card size="small">
            <Space wrap size="large">
              <Space>
                <Text strong>Bản ghi / record size:</Text>
                <InputNumber
                  min={6}
                  max={64}
                  value={recordSizeOverride ?? data.recordSize}
                  onChange={(v) => v && rebuildWithRecordSize(v)}
                  style={{ width: 90 }}
                />
                <Tooltip title="Tự động dò theo chu kỳ ID. Đổi nếu file có cấu trúc khác.">
                  <ReloadOutlined />
                </Tooltip>
              </Space>
              <Checkbox checked={useEstimatedTime} onChange={e => setUseEstimatedTime(e.target.checked)}>
                Ước lượng thời gian theo “Extraction date”
              </Checkbox>
              <Text type="secondary" className="text-xs">
                Mốc: {data.binaryStart.toLocaleString('vi-VN')} byte · ID chính: {sensorIds.map(id => '0x' + hexByte(id)).join(', ')}
              </Text>
            </Space>
            <Alert
              className="mt-3"
              type="success"
              showIcon
              title="Đã giải mã: Tsup = int16 0x06[1]÷400; Tret = int16 0x04[1]÷400; Tsuc = int16 0x06[4]÷400; Tset = byte 0x04[9]×0.1 (chọn dấu theo Tret); AirEx = tra byte 0x04[11]. Đối chiếu file StarView: Tret khớp 100% ±0.1 °C, Tsup ~90% ±0.1 °C, Tsuc ~84% ±0.5 °C, AirEx khớp tuyệt đối. Tevap/Tamb/RH/Pdis không lưu dạng trường tuyến tính trong bản ghi định kỳ. Các cột kênh còn lại hiển thị hex thô."
            />
          </Card>

          <Tabs
            activeKey={activeView}
            onChange={setActiveView}
            items={[
              {
                key: 'info',
                label: <Space><ContainerOutlined />Thông tin file</Space>,
                children: (
                  <Space orientation="vertical" size="middle" className="w-full">
                    {groupedHeader.map(section => (
                      <Card key={section.title} size="small" title={<Text strong>{section.title}</Text>}>
                        <Descriptions
                          bordered
                          size="small"
                          column={{ xs: 1, sm: 1, md: 2, lg: 3 }}
                          items={section.items.map((p, i) => ({
                            key: i,
                            label: <Text className="text-xs">{p.key}</Text>,
                            children: <Text className="text-xs" copyable={p.value.length > 20 ? { text: p.value } : false}>{p.value || '—'}</Text>,
                          }))}
                        />
                      </Card>
                    ))}
                  </Space>
                ),
              },
              {
                key: 'data',
                label: <Space><FileSearchOutlined />Dữ liệu đo ({data.groups.length})</Space>,
                children: (
                  <Table
                    size="small"
                    rowKey="counter"
                    columns={groupColumns}
                    dataSource={data.groups}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                      defaultPageSize: 50,
                      showSizeChanger: true,
                      pageSizeOptions: [20, 50, 100, 200],
                      showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}`,
                    }}
                  />
                ),
              },
            ]}
          />
        </>
      )}

      {!data && (
        <Alert
          type="info"
          showIcon
          title="Định dạng file"
          description={
            <Space orientation="vertical" size={2}>
              <Text className="text-xs">• StarView .449/.456: header dạng text key=value, log nhị phân 18 byte (1 byte loại + 4 byte counter + payload), nhóm 6 kênh/mốc.</Text>
              <Text className="text-xs">• StarCool .V2b: archive nhị phân có directory 16 section (IDS, USDA, TRIP, EVENT, WATCH, IoT...); app đọc metadata, cấu trúc và bản ghi thô từng section.</Text>
              <Text className="text-xs">• Toàn bộ xử lý diễn ra trong trình duyệt (FileReader), file không được gửi đi đâu.</Text>
            </Space>
          }
        />
      )}
    </Space>
  )
}

export default StarCoolReader
