import * as XLSX from 'xlsx-js-style'

const STORAGE_KEY = 'est_mappings_v2'
const STORAGE_MIGRATED = 'est_mappings_v1'
const STORAGE_TEMPLATE = 'est_template_v1'
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
    s = s.replace(/\uE000[ \t]*(?:[x×X/·:*|.,;])?[ \t]*/g, '\uE000')
    s = s.replace(/[ \t]*(?:[x×X/·:*|.,;])?[ \t]*\uE000/g, ' ')
    s = s.replace(/\uE000[ \t]*\([ \t]*\uE000[ \t]*\)/g, '\uE000')
    s = s.replace(/[ \t]{2,}/g, ' ')
  }
  return s.replace(/\uE000+/g, '')
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
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const merged = {}
      for (const key of Object.keys(DEFAULT_MAPPINGS)) {
        merged[key] = Array.isArray(parsed[key]) ? parsed[key] : DEFAULT_MAPPINGS[key].slice()
      }
      return merged
    }
    const v1 = localStorage.getItem(STORAGE_MIGRATED)
    if (v1) {
      const old = JSON.parse(v1)
      if (Array.isArray(old)) {
        const merged = {}
        for (const key of Object.keys(DEFAULT_MAPPINGS)) merged[key] = DEFAULT_MAPPINGS[key].slice()
        merged.OTHER = merged.OTHER.concat(old.filter(m => m && m.code))
        return merged
      }
    }
  } catch { /* ignore */ }
  const fallback = {}
  for (const key of Object.keys(DEFAULT_MAPPINGS)) fallback[key] = DEFAULT_MAPPINGS[key].slice()
  return fallback
}

export function loadEstSettings() {
  let template = DEFAULT_TEMPLATE
  let splitIT = false
  let hideVals = DEFAULT_HIDEVALS
  try {
    template = localStorage.getItem(STORAGE_TEMPLATE) || DEFAULT_TEMPLATE
    splitIT = localStorage.getItem(STORAGE_SPLIT_IT) === '1'
    const raw = localStorage.getItem(STORAGE_HIDEVALS)
    if (raw) hideVals = { ...DEFAULT_HIDEVALS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { mappings: loadMappings(), template, splitIT, hideVals }
}

export function convertDataRows(dataRows, colMap, settings) {
  const { mappings, template, splitIT, hideVals } = settings

  const lookup = (code, group = 'OTHER') => {
    const c = normalize(code)
    if (!c) return ''
    const list = (mappings[group] || []).slice().concat(mappings.OTHER || [])
    const hit = list.find(m => m && normalize(m.code) === c)
    return hit && hit.word ? hit.word : code
  }

  const shouldHideVal = (field, rawVal) => {
    const v = String(rawVal ?? '').trim()
    if (v === '') return true
    const list = String(hideVals[field] || '').split(/[,;\s]+/).filter(Boolean)
    if (list.length === 0) return false
    return list.some(x => Number(x) === Number(v))
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
    const itParts = rawIt.split(/[,\s;|/]+/).map(s => s.trim()).filter(Boolean)
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
          case '{LTH}': return shouldHideVal('LTH', lth) ? '\uE000' : String(lth ?? '').trim()
          case '{WDT}': return shouldHideVal('WDT', wdt) ? '\uE000' : String(wdt ?? '').trim()
          case '{QTY}': {
            const v = String(qty ?? '').trim()
            if (shouldHideVal('QTY', v)) return '\uE000'
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
}

export async function convertEstFile(file, settings = loadEstSettings()) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('File Excel không có sheet dữ liệu')
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const hi = findHeaderRow(rows)
  if (hi === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề (cần cột CONTAINER / COM CODE / COMPONENTS DETAILS).')
  }
  const headerRow = rows[hi]
  const colMap = buildColMap(headerRow)
  const val = (r, k) => {
    const idx = colMap[k]
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
      const idx = colMap[k]
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
  const converted = convertDataRows(data, colMap, settings)
  return { converted, headers: headerRow, colMap, dataRows: data }
}

export function aggregateEstResults(results) {
  const map = new Map()
  for (const r of results || []) {
    const container = String(r.container || '').trim().toUpperCase()
    if (!container) continue
    if (!map.has(container)) {
      map.set(container, {
        key: container,
        container,
        size: r.size || '',
        dateInYard: r.dateInYard ?? '',
        vessel: r.vessel || '',
        subs: [],
        seen: new Set(),
      })
    }
    const entry = map.get(container)
    if (!entry.size && r.size) entry.size = r.size
    if (!entry.dateInYard && r.dateInYard !== undefined && r.dateInYard !== '') entry.dateInYard = r.dateInYard
    if (!entry.vessel && r.vessel) entry.vessel = r.vessel
    const subs = r.subs && r.subs.length ? r.subs : [{ it: r.it, line: r.line }]
    for (const s of subs) {
      const line = String(s?.line ?? '').trim()
      if (!line || entry.seen.has(line)) continue
      entry.seen.add(line)
      entry.subs.push({ it: String(s.it ?? '').trim(), line })
    }
  }
  return [...map.values()].map(e => ({
    key: e.key,
    container: e.container,
    size: e.size,
    dateInYard: e.dateInYard,
    vessel: e.vessel,
    subs: e.subs,
    it: e.subs.map(s => s.it).filter(Boolean).join(' | '),
    line: e.subs.map(s => s.line).join(' | '),
  }))
}
