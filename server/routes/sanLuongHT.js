import { Router } from 'express'
import SanLuongHT from '../models/SanLuongHT.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

const normalizeItem = (item) => ({
  containerNo: String(item.containerNo || '').trim().toUpperCase(),
  nBg: String(item.nBg || '').trim(),
  nApr: String(item.nApr || '').trim(),
  sztp: String(item.sztp || '').trim(),
  nComplete: String(item.nComplete || '').trim(),
  nSc: String(item.nSc || '').trim(),
  remark: String(item.remark || '').trim(),
  chiTietSc: String(item.chiTietSc || '').trim(),
})

router.get('/', authMiddleware, async (req, res) => {
  try {
    const items = await SanLuongHT.find().sort({ order: 1, createdAt: 1 }).lean()
    res.json(items)
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
      if (item.containerNo) uniqueMap.set(item.containerNo, item)
    }
    const normalized = [...uniqueMap.values()]
    if (!normalized.length) {
      return res.status(400).json({ message: 'Không có dòng dữ liệu hợp lệ' })
    }

    const existingDocs = await SanLuongHT.find(
      { containerNo: { $in: normalized.map(i => i.containerNo) } }
    ).select('containerNo').lean()
    const existingSet = new Set(existingDocs.map(d => d.containerNo))

    const maxOrderDoc = await SanLuongHT.findOne().sort({ order: -1 }).select('order').lean()
    let nextOrder = (maxOrderDoc?.order || 0) + 1

    const ops = normalized.map(item => {
      const fields = {
        nBg: item.nBg,
        nApr: item.nApr,
        sztp: item.sztp,
        nComplete: item.nComplete,
        nSc: item.nSc,
        remark: item.remark,
        chiTietSc: item.chiTietSc,
      }
      if (existingSet.has(item.containerNo)) {
        return { updateOne: { filter: { containerNo: item.containerNo }, update: { $set: fields } } }
      }
      return { insertOne: { document: { ...item, order: nextOrder++ } } }
    })
    await SanLuongHT.bulkWrite(ops)

    const all = await SanLuongHT.find().sort({ order: 1, createdAt: 1 }).lean()
    res.json({ imported: normalized.length, items: all })
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
    const maxOrderDoc = await SanLuongHT.findOne().sort({ order: -1 }).select('order').lean()
    const created = await SanLuongHT.create({ ...item, order: (maxOrderDoc?.order || 0) + 1 })
    res.status(201).json(created)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/delete-many', authMiddleware, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Chưa chọn dòng để xóa' })
    }
    const result = await SanLuongHT.deleteMany({ _id: { $in: ids } })
    res.json({ deleted: result.deletedCount })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/insert-many', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu để thêm' })
    }
    const normalized = items.map(normalizeItem).filter(i => i.containerNo)
    if (!normalized.length) {
      return res.status(400).json({ message: 'Không có dòng dữ liệu hợp lệ' })
    }
    const maxOrderDoc = await SanLuongHT.findOne().sort({ order: -1 }).select('order').lean()
    let nextOrder = (maxOrderDoc?.order || 0) + 1
    const docs = normalized.map(item => ({ ...item, order: nextOrder++ }))
    await SanLuongHT.insertMany(docs)
    const all = await SanLuongHT.find().sort({ order: 1, createdAt: 1 }).lean()
    res.json({ inserted: docs.length, items: all })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/update-many', authMiddleware, async (req, res) => {
  try {
    const { ids, nApr, nComplete, nSc } = req.body
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Chưa chọn dòng để cập nhật' })
    }
    const fields = {}
    if (nApr !== undefined) fields.nApr = String(nApr || '').trim()
    if (nComplete !== undefined) fields.nComplete = String(nComplete || '').trim()
    if (nSc !== undefined) fields.nSc = String(nSc || '').trim()
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' })
    }
    const result = await SanLuongHT.updateMany(
      { _id: { $in: ids } },
      { $set: fields }
    )
    const all = await SanLuongHT.find().sort({ order: 1, createdAt: 1 }).lean()
    res.json({ updated: result.modifiedCount, items: all })
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
    const updated = await SanLuongHT.findByIdAndUpdate(req.params.id, { $set: item }, { returnDocument: 'after' })
    if (!updated) return res.status(404).json({ message: 'Không tìm thấy dòng dữ liệu' })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await SanLuongHT.findByIdAndDelete(req.params.id)
    if (!deleted) return res.status(404).json({ message: 'Không tìm thấy dòng dữ liệu' })
    res.json({ message: 'Đã xóa' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
