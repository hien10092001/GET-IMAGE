import { Router } from 'express'
import { ZipArchive } from 'archiver'
import fs from 'node:fs'
import path from 'node:path'

const router = Router()

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'])
const CONTAINER_RE = /^[A-Z0-9_-]{4,20}$/
const CONTAINER_CODE_RE = /[A-Z]{4}\d{6,}/
const CACHE_MS = 5 * 60 * 1000
const INDEX_TTL = 10 * 60 * 1000
const INDEX_SCAN_CONCURRENCY = 32
const INDEX_FILE = path.resolve(process.cwd(), 'data', 'container-image-index.json')
const cache = new Map()

let containerIndex = { builtAt: 0, dirs: new Map(), names: [] }
let indexBuilding = null

function getRoot(scope) {
  if (scope !== 'containers') return ''
  return path.resolve(process.env.CONTAINER_IMAGE_ROOT || 'Z:\\')
}

function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  })
  return Promise.all(workers).then(() => results)
}

function readDirs(dir) {
  return fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
}

function loadIndexFromDisk() {
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'))
    if (!parsed || !parsed.dirs) return
    const dirs = new Map(Object.entries(parsed.dirs))
    containerIndex = {
      builtAt: Number(parsed.builtAt) || 0,
      dirs,
      names: Array.from(dirs.keys()),
    }
  } catch {
    // no usable cache yet
  }
}

function saveIndexToDisk(index) {
  fs.promises
    .mkdir(path.dirname(INDEX_FILE), { recursive: true })
    .then(() => fs.promises.writeFile(INDEX_FILE, JSON.stringify({ builtAt: index.builtAt, dirs: Object.fromEntries(index.dirs) })))
    .catch(() => {})
}

function formatDay(baseDate, offset) {
  const dt = new Date(`${baseDate}T00:00:00Z`)
  if (Number.isNaN(dt.getTime())) return null
  dt.setUTCDate(dt.getUTCDate() + offset)
  const y = String(dt.getUTCFullYear())
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return { y, m, d }
}

async function findDirsByDate(root, dateStr, target) {
  const results = []
  const seen = new Set()
  await Promise.all([0, -1, 1].map(async (offset) => {
    const day = formatDay(dateStr, offset)
    if (!day) return
    const dayDir = path.join(root, day.y, day.m, day.d)
    const types = await readDirs(dayDir)
    await Promise.all(types.map(async (typeEntry) => {
      if (!typeEntry.isDirectory()) return
      const typeDir = path.join(dayDir, typeEntry.name)
      const children = await readDirs(typeDir)
      for (const child of children) {
        if (!child.isDirectory()) continue
        if (!child.name.toUpperCase().includes(target)) continue
        const full = path.join(typeDir, child.name)
        if (!seen.has(full)) {
          seen.add(full)
          results.push(full)
        }
      }
    }))
  }))
  return results
}

async function buildContainerIndex(root) {
  const dirs = new Map()
  const add = (full, name) => {
    const key = name.toUpperCase()
    let list = dirs.get(key)
    if (!list) {
      list = []
      dirs.set(key, list)
    }
    list.push(full)
  }

  const years = (await readDirs(root)).filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
  const monthDirs = []
  await mapLimit(years.map((year) => path.join(root, year.name)), INDEX_SCAN_CONCURRENCY, async (yearDir) => {
    const months = (await readDirs(yearDir)).filter((e) => e.isDirectory() && /^\d{2}$/.test(e.name))
    for (const month of months) monthDirs.push(path.join(yearDir, month.name))
  })

  const dayDirs = []
  await mapLimit(monthDirs, INDEX_SCAN_CONCURRENCY, async (monthDir) => {
    const days = (await readDirs(monthDir)).filter((e) => e.isDirectory() && /^\d{2}$/.test(e.name))
    for (const day of days) dayDirs.push(path.join(monthDir, day.name))
  })

  const walk = async (dir, depth) => {
    const entries = (await readDirs(dir)).filter((e) => e.isDirectory())
    await Promise.all(entries.map(async (entry) => {
      const name = entry.name.toUpperCase()
      const full = path.join(dir, entry.name)
      if (CONTAINER_CODE_RE.test(name)) {
        add(full, entry.name)
        return
      }
      if (depth < 4) await walk(full, depth + 1)
    }))
  }

  await mapLimit(dayDirs, INDEX_SCAN_CONCURRENCY, (dayDir) => walk(dayDir, 0))

  return { dirs, names: Array.from(dirs.keys()) }
}

async function ensureContainerIndex(root, force = false) {
  const now = Date.now()
  const fresh = containerIndex.builtAt && now - containerIndex.builtAt < INDEX_TTL
  if (!force && fresh) return containerIndex
  if (!indexBuilding) {
    indexBuilding = buildContainerIndex(root)
      .then((index) => {
        containerIndex = { ...index, builtAt: Date.now() }
        saveIndexToDisk(containerIndex)
        return containerIndex
      })
      .finally(() => {
        indexBuilding = null
      })
  }
  if (force) return indexBuilding
  if (containerIndex.builtAt) return containerIndex
  return indexBuilding
}

function findInIndex(index, containerNo) {
  const key = containerNo.toUpperCase()
  if (index.dirs.has(key)) return index.dirs.get(key)
  const found = []
  for (const name of index.names) {
    if (name.includes(key)) found.push(...index.dirs.get(name))
  }
  return found
}

async function listImages(root, dirs, scope, containerNo) {
  const files = []
  const seen = new Set()
  for (const dir of dirs) {
    if (seen.has(dir)) continue
    seen.add(dir)
    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    const folder = path.basename(dir)
    const relDir = path.relative(root, dir).split(path.sep).join('/')
    const relParts = relDir.split('/')
    const group = relParts.length > 3 ? relParts.slice(3).join('/') : relDir
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) continue
      const rel = path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/')
      files.push({
        name: entry.name,
        folder,
        group,
        relativePath: rel,
        path: `/public-images/file?scope=${encodeURIComponent(scope)}&containerNo=${encodeURIComponent(containerNo)}&name=${encodeURIComponent(rel)}`,
      })
    }
  }
  files.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))
  return files
}

async function resolveDirs(root, containerNo, dateStr) {
  let dirs = []
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dirs = await findDirsByDate(root, dateStr, containerNo)
  }
  if (!dirs.length) {
    const index = await ensureContainerIndex(root)
    dirs = findInIndex(index, containerNo)
  }
  if (!dirs.length && Date.now() - containerIndex.builtAt > 60 * 1000) {
    const index = await ensureContainerIndex(root, true)
    dirs = findInIndex(index, containerNo)
  }
  return dirs
}

router.get('/file', (req, res) => {
  const scope = String(req.query.scope || '')
  const containerNo = String(req.query.containerNo || '').toUpperCase().trim()
  const rel = String(req.query.name || '')
  const root = getRoot(scope)
  if (!root || !CONTAINER_RE.test(containerNo) || !rel) {
    return res.status(400).json({ message: 'Yêu cầu không hợp lệ' })
  }
  const full = path.resolve(root, rel)
  const relative = path.relative(root, full)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return res.status(403).json({ message: 'Đường dẫn không hợp lệ' })
  }
  const parent = path.basename(path.dirname(full)).toUpperCase()
  if (!parent.includes(containerNo)) {
    return res.status(403).json({ message: 'Đường dẫn không hợp lệ' })
  }
  if (!IMAGE_EXTS.has(path.extname(full).toLowerCase())) {
    return res.status(403).json({ message: 'Định dạng không hỗ trợ' })
  }
  res.sendFile(full, { headers: { 'Cache-Control': 'public, max-age=3600' } }, (err) => {
    if (err && !res.headersSent) res.status(404).end()
  })
})

router.get('/download', async (req, res) => {
  const scope = String(req.query.scope || '')
  const containerNo = String(req.query.containerNo || '').toUpperCase().trim()
  const dateStr = String(req.query.date || '')
  const group = String(req.query.group || '')
  const root = getRoot(scope)
  if (!root) return res.status(404).json({ message: 'Chỉ hỗ trợ tải hình container' })
  if (!CONTAINER_RE.test(containerNo)) {
    return res.status(400).json({ message: 'Số container không hợp lệ' })
  }
  if (!fs.existsSync(root)) {
    return res.status(404).json({ message: `Không tìm thấy ổ đĩa ${root}` })
  }

  const dirs = await resolveDirs(root, containerNo, dateStr)
  let files = await listImages(root, dirs, scope, containerNo)
  if (group) files = files.filter((file) => file.group === group)
  if (!files.length) {
    return res.status(404).json({ message: 'Không có hình ảnh để tải' })
  }

  const zipName = `${containerNo}${/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `_${dateStr}` : ''}.zip`
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`)

  const archive = new ZipArchive({ store: true })
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ message: 'Không tạo được file tải', detail: err.message })
    else res.destroy(err)
  })
  archive.pipe(res)
  for (const file of files) {
    const full = path.resolve(root, file.relativePath)
    const groupParts = String(file.group || '').split('/').filter(Boolean)
    if (groupParts.length > 1 && groupParts[groupParts.length - 1].toUpperCase().includes(containerNo)) {
      groupParts.pop()
    }
    const zipDir = groupParts.join('/')
    archive.file(full, { name: `${containerNo}/${zipDir ? `${zipDir}/` : ''}${file.name}` })
  }
  try {
    await archive.finalize()
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: 'Không tạo được file tải', detail: err.message })
    else res.destroy(err)
  }
})

router.get('/:scope/:containerNo', async (req, res) => {
  const scope = String(req.params.scope || '')
  const containerNo = String(req.params.containerNo || '').toUpperCase().trim()
  const root = getRoot(scope)
  if (!root) return res.status(404).json({ message: 'Chỉ hỗ trợ xem hình container' })
  if (!CONTAINER_RE.test(containerNo)) {
    return res.status(400).json({ message: 'Số container không hợp lệ' })
  }
  if (!fs.existsSync(root)) {
    return res.json({ containerNo, total: 0, files: [], message: `Không tìm thấy ổ đĩa ${root}` })
  }

  const dateStr = String(req.query.date || '')
  const cacheKey = `${scope}:${containerNo}:${dateStr}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return res.json(cached.payload)

  const dirs = await resolveDirs(root, containerNo, dateStr)
  const files = await listImages(root, dirs, scope, containerNo)
  const payload = { containerNo, total: files.length, files }
  cache.set(cacheKey, { expires: Date.now() + CACHE_MS, payload })
  res.json(payload)
})

loadIndexFromDisk()

const warmRoot = getRoot('containers')
if (warmRoot && fs.existsSync(warmRoot)) {
  setTimeout(() => {
    ensureContainerIndex(warmRoot).catch(() => {})
  }, 500)
}

export default router
