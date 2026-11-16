import { Router } from 'express'
import SlScPad from '../models/SlScPad.js'
import SlScPadHistory from '../models/SlScPadHistory.js'
import { authMiddleware, usernameMiddleware } from '../middleware/auth.js'

const router = Router()

const adminOnly = (req, res, next) => {
  if (req.user?.role === 'Admin' || req.user?.username === 'admin') return next()
  return res.status(403).json({ message: 'Chỉ tài khoản admin mới có quyền xóa' })
}

router.use(authMiddleware, usernameMiddleware('baogia', 'admin'))

const parseNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  let text = raw.replace(/[^\d,.-]/g, '')
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
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      text = text.replace(/\./g, '')
    }
  }
  const num = Number.parseFloat(text)
  return Number.isFinite(num) ? num : 0
}

const normalizeItem = (item) => ({
  line: String(item.line || '').trim().toUpperCase(),
  containerNo: String(item.containerNo || '').trim().toUpperCase(),
  sztp: String(item.sztp || '').trim(),
  ngaySc: String(item.ngaySc || '').trim(),
  tienHang: parseNumber(item.tienHang),
  tienHungThinh: parseNumber(item.tienHungThinh),
  remark: String(item.remark || '').trim(),
})

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

const parseDdMmYyyy = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
}

const formatPeriodDate = (date) =>
  `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`

const derivePeriod = (items) => {
  const dates = items
    .map(item => parseDdMmYyyy(item.ngaySc))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())
  if (!dates.length) return ''
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (first.getTime() === last.getTime()) return formatPeriodDate(first)
  return `${formatPeriodDate(first)} - ${formatPeriodDate(last)}`
}

const sortItems = () => SlScPad.find({ outputId: null }).sort({ order: 1, createdAt: 1 }).lean()

const updateHistoryItem = async (historyId, item) => {
  const history = await SlScPadHistory.findById(historyId)
  if (!history) return false
  let index = history.items.findIndex(
    it => it.containerNo === item.containerNo && it.line === item.line
  )
  if (index < 0) {
    index = history.items.findIndex(it => it.containerNo === item.containerNo)
  }
  if (index < 0) return false

  const target = history.items[index]
  target.sztp = item.sztp
  target.ngaySc = item.ngaySc
  if (item.updateMoney !== false) {
    if (item.updateTienHang !== false) target.tienHang = item.tienHang
    if (item.updateTienHungThinh !== false) target.tienHungThinh = item.tienHungThinh
  }
  if (item.remark) target.remark = item.remark
  history.count = history.items.length
  history.totalHang = round2(history.items.reduce((sum, it) => sum + (Number(it.tienHang) || 0), 0))
  history.totalHung = round2(history.items.reduce((sum, it) => sum + (Number(it.tienHungThinh) || 0), 0))
  await history.save()
  return true
}

router.get('/produced', authMiddleware, async (req, res) => {
  try {
    const map = new Map()
    const histories = await SlScPadHistory.find()
      .sort({ createdAt: 1 })
      .select('period items')
      .lean()
    for (const history of histories) {
      for (const it of (history.items || [])) {
        if (!it.containerNo) continue
        const key = `${it.line || ''}|${it.containerNo || ''}`
        map.set(key, {
          key,
          line: it.line || '',
          containerNo: it.containerNo || '',
          outputId: history._id,
          period: history.period || '',
          tienHang: round2(it.tienHang),
          tienHungThinh: round2(it.tienHungThinh),
        })
      }
    }
    const docs = await SlScPad.find({ outputId: { $ne: null } })
      .select('line containerNo outputId tienHang tienHungThinh')
      .lean()
    const ids = [...new Set(docs.map(d => String(d.outputId)))]
    const periodMap = new Map(
      (await SlScPadHistory.find({ _id: { $in: ids } }).select('period').lean())
        .map(h => [String(h._id), h.period || ''])
    )
    for (const d of docs) {
      const key = `${d.line || ''}|${d.containerNo || ''}`
      if (map.has(key)) continue
      map.set(key, {
        key,
        line: d.line || '',
        containerNo: d.containerNo || '',
        outputId: d.outputId,
        period: periodMap.get(String(d.outputId)) || '',
        tienHang: round2(d.tienHang),
        tienHungThinh: round2(d.tienHungThinh),
      })
    }
    res.json([...map.values()])
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})


router.get('/', authMiddleware, async (req, res) => {
  try {
    res.json(await sortItems())
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const list = await SlScPadHistory.find()
      .sort({ createdAt: -1 })
      .select('-items')
      .lean()
    res.json(list)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/history/:id', authMiddleware, async (req, res) => {
  try {
    const history = await SlScPadHistory.findById(req.params.id).lean()
    if (!history) return res.status(404).json({ message: 'Không tìm thấy lịch sử sản lượng' })
    res.json(history)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/history/:id', authMiddleware, async (req, res) => {
  try {
    const { period, items } = req.body
    const history = await SlScPadHistory.findById(req.params.id)
    if (!history) return res.status(404).json({ message: 'Không tìm thấy lịch sử sản lượng' })

    const update = {}
    if (typeof period === 'string' && period.trim()) update.period = period.trim()
    if (items !== undefined) {
      if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'Dữ liệu container không hợp lệ' })
      }
      const normalized = items
        .map(item => normalizeItem(item))
        .filter(item => item.containerNo)
      update.items = normalized
      update.count = normalized.length
      update.totalHang = round2(normalized.reduce((sum, item) => sum + item.tienHang, 0))
      update.totalHung = round2(normalized.reduce((sum, item) => sum + item.tienHungThinh, 0))
    }
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: 'Không có dữ liệu cần cập nhật' })
    }

    const updated = await SlScPadHistory.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: 'after' }
    ).lean()
    res.json(updated)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/history/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const history = await SlScPadHistory.findById(req.params.id)
    if (!history) return res.status(404).json({ message: 'Không tìm thấy lịch sử sản lượng' })

    await SlScPad.updateMany(
      { outputId: history._id },
      { $set: { outputId: null, outputAt: null } }
    )
    await history.deleteOne()
    res.json({ message: 'Đã xóa kỳ sản lượng', restored: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/output', authMiddleware, async (req, res) => {
  try {
    const { ids, period } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Chưa chọn dữ liệu để tạo sản lượng' })
    }

    const docs = await SlScPad.find({ _id: { $in: ids }, outputId: null })
      .sort({ order: 1, createdAt: 1 })
      .lean()
    if (!docs.length) {
      return res.status(400).json({ message: 'Không còn dữ liệu chưa tạo sản lượng' })
    }

    const items = docs.map(doc => ({
      line: doc.line || '',
      containerNo: doc.containerNo || '',
      sztp: doc.sztp || '',
      ngaySc: doc.ngaySc || '',
      tienHang: round2(doc.tienHang),
      tienHungThinh: round2(doc.tienHungThinh),
      remark: doc.remark || '',
    }))
    const totalHang = round2(items.reduce((sum, item) => sum + item.tienHang, 0))
    const totalHung = round2(items.reduce((sum, item) => sum + item.tienHungThinh, 0))

    const history = await SlScPadHistory.create({
      period: String(period || '').trim() || derivePeriod(items),
      count: items.length,
      totalHang,
      totalHung,
      items,
    })

    await SlScPad.updateMany(
      { _id: { $in: docs.map(doc => doc._id) } },
      { $set: { outputId: history._id, outputAt: new Date() } }
    )

    res.status(201).json(history.toObject())
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/import', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu để nhập' })
    }

    const uniqueMap = new Map()
    for (const raw of items) {
      const item = normalizeItem(raw)
      if (!item.containerNo) continue
      const mode = raw.mode === 'update' ? 'update' : 'new'
      const updateMoney = raw.updateMoney !== false
      const updateTienHang = updateMoney && raw.updateTienHang !== false
      const updateTienHungThinh = updateMoney && raw.updateTienHungThinh !== false
      uniqueMap.set(`${item.line}|${item.containerNo}`, {
        ...item, mode, updateMoney, updateTienHang, updateTienHungThinh,
      })
    }
    const normalized = [...uniqueMap.values()]
    if (!normalized.length) {
      return res.status(400).json({ message: 'Không có dòng dữ liệu hợp lệ' })
    }

    const existingDocs = await SlScPad.find({
      containerNo: { $in: normalized.map(item => item.containerNo) },
    }).lean()
    const existingMap = new Map(
      existingDocs.map(doc => [`${doc.line || ''}|${doc.containerNo || ''}`, doc])
    )

    const histories = await SlScPadHistory.find()
      .sort({ createdAt: 1 })
      .select('period items')
      .lean()
    const historyMap = new Map()
    for (const history of histories) {
      for (const it of (history.items || [])) {
        if (!it.containerNo) continue
        historyMap.set(`${it.line || ''}|${it.containerNo || ''}`, {
          historyId: history._id,
          item: it,
        })
      }
    }

    const maxOrderDoc = await SlScPad.findOne().sort({ order: -1 }).select('order').lean()
    let nextOrder = (maxOrderDoc?.order || 0) + 1

    const ops = []
    const historyUpdates = []
    let inserted = 0
    let updated = 0
    let producedNew = 0
    let producedUpdated = 0

    const insertDoc = (item, outputId) => ({
      line: item.line,
      containerNo: item.containerNo,
      sztp: item.sztp,
      ngaySc: item.ngaySc,
      tienHang: item.tienHang,
      tienHungThinh: item.tienHungThinh,
      remark: item.remark || '',
      order: nextOrder++,
      outputId,
      outputAt: outputId ? new Date() : null,
    })

    for (const item of normalized) {
      const setFields = {
        sztp: item.sztp,
        ngaySc: item.ngaySc,
      }
      if (item.updateTienHang) setFields.tienHang = item.tienHang
      if (item.updateTienHungThinh) setFields.tienHungThinh = item.tienHungThinh
      if (item.remark) setFields.remark = item.remark
      const key = `${item.line}|${item.containerNo}`
      const existing = existingMap.get(key)
      const historyEntry = historyMap.get(key)

      if (historyEntry) {
        if (item.mode === 'update') {
          if (existing) {
            ops.push({ updateOne: { filter: { _id: existing._id }, update: { $set: setFields } } })
          } else {
            ops.push({ insertOne: { document: insertDoc(item, historyEntry.historyId) } })
          }
          historyUpdates.push({ historyId: historyEntry.historyId, item: { ...item, ...setFields } })
          producedUpdated++
        } else {
          if (existing) {
            ops.push({
              updateOne: {
                filter: { _id: existing._id },
                update: { $set: { ...setFields, outputId: null, outputAt: null, order: nextOrder++ } },
              },
            })
          } else {
            ops.push({ insertOne: { document: insertDoc(item, null) } })
          }
          producedNew++
        }
        continue
      }

      if (!existing) {
        ops.push({ insertOne: { document: insertDoc(item, null) } })
        inserted++
        continue
      }

      if (!existing.outputId) {
        ops.push({ updateOne: { filter: { _id: existing._id }, update: { $set: setFields } } })
        updated++
        continue
      }

      if (item.mode === 'update') {
        ops.push({ updateOne: { filter: { _id: existing._id }, update: { $set: setFields } } })
        historyUpdates.push({
          historyId: existing.outputId,
          item: { ...item, ...setFields },
        })
        producedUpdated++
      } else {
        ops.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: { ...setFields, outputId: null, outputAt: null, order: nextOrder++ } },
          },
        })
        producedNew++
      }
    }

    if (ops.length) await SlScPad.bulkWrite(ops)
    for (const entry of historyUpdates) {
      await updateHistoryItem(entry.historyId, entry.item)
    }

    const all = await sortItems()
    res.json({
      inserted,
      updated,
      producedNew,
      producedUpdated,
      total: all.length,
      items: all,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/', authMiddleware, async (req, res) => {
  try {
    const item = normalizeItem(req.body)
    if (!item.containerNo) {
      return res.status(400).json({ message: 'Thiếu số container' })
    }
    const maxOrderDoc = await SlScPad.findOne().sort({ order: -1 }).select('order').lean()
    const created = await SlScPad.findOneAndUpdate(
      { line: item.line, containerNo: item.containerNo },
      { $set: item, $setOnInsert: { order: (maxOrderDoc?.order || 0) + 1 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    res.status(201).json(created)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/delete-many', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Chưa chọn dòng để xóa' })
    }
    const result = await SlScPad.deleteMany({ _id: { $in: ids } })
    res.json({ deleted: result.deletedCount })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const item = normalizeItem(req.body)
    if (!item.containerNo) {
      return res.status(400).json({ message: 'Thiếu số container' })
    }
    const updated = await SlScPad.findByIdAndUpdate(
      req.params.id,
      { $set: item },
      { returnDocument: 'after' }
    )
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy dòng dữ liệu' })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const deleted = await SlScPad.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ message: 'Không tìm thấy dòng dữ liệu' })
    res.json({ message: 'Đã xóa' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
