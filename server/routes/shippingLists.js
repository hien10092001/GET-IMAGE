import { Router } from 'express'
import ShippingList from '../models/ShippingList.js'
import ProductionLock from '../models/ProductionLock.js'
import Classification from '../models/Classification.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

function appendDate(current, newDate) {
  if (!current) return newDate
  const dates = current.split(', ').map(d => d.trim())
  if (dates.includes(newDate)) return current
  return current + ', ' + newDate
}

function normalizeText(str) {
  return ' ' + str.toUpperCase().trim().replace(/[.,;:!?()\/\\\-_]+/g, ' ').replace(/\s+/g, ' ') + ' '
}

function keywordMatch(remark, keys) {
  if (!keys.length) return false
  const normalized = normalizeText(remark)
  return keys.some(k => {
    const kw = k.toUpperCase().trim()
    if (!kw) return false
    return normalized.includes(normalizeText(kw))
  })
}

// GET /api/shipping-lists — list all, optional dateFrom/dateTo
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query
    const query = {}
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        query.createdAt.$lt = end
      }
    }
    const lists = await ShippingList.find(query).sort({ createdAt: -1 }).lean()
    res.json(lists)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST /api/shipping-lists — create
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, shippingLine, items } = req.body
    if (!name || !items || !items.length) {
      return res.status(400).json({ message: 'Thiếu tên list hoặc danh sách container' })
    }
    const list = await ShippingList.create({
      name,
      shippingLine: shippingLine || '',
      items: items.map(i => ({
        containerNo: (i.containerNo || '').toUpperCase().trim(),
        shippingLine: i.shippingLine || '',
        size: i.size || '',
        remark: i.remark || '',
        dsc: i.dsc || '',
        choHtxnDvs: i.choHtxnDvs || '',
        sc: i.sc || '',
        vsDvs: i.vsDvs || '',
        xuLiLai: i.xuLiLai || '',
      })),
      createdBy: req.user.username,
    })
    res.status(201).json(list)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET /api/shipping-lists/:id — get one with lock status
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const list = await ShippingList.findById(req.params.id).lean()
    if (!list) return res.status(404).json({ message: 'Không tìm thấy' })

    const cls = await Classification.findOne({ key: 'main' })
    const dscKeys = cls?.dsc || []
    const xuLiKeys = cls?.xuLi || []
    const vsKeys = cls?.vs || []

    const containerNos = list.items.map(i => i.containerNo)
    const locks = await ProductionLock.find(
      { 'items.containerNo': { $in: containerNos } },
      { 'items.containerNo': 1, 'items.remark': 1, date: 1 }
    ).lean()

    const lockInfo = {}
    locks.forEach(lock => {
      lock.items.forEach(item => {
        if (item.containerNo) {
          const cn = item.containerNo
            if (!lockInfo[cn]) lockInfo[cn] = { locked: false, dsc: '', choHtxnDvs: '', sc: '', vsDvs: '', xuLiLai: '' }
            lockInfo[cn].locked = true
            const remark = item.remark || ''
            if (keywordMatch(remark, dscKeys)) {
              lockInfo[cn].dsc = appendDate(lockInfo[cn].dsc, lock.date)
              lockInfo[cn].choHtxnDvs = appendDate(lockInfo[cn].choHtxnDvs, lock.date)
              lockInfo[cn].sc = appendDate(lockInfo[cn].sc, lock.date)
            }
            if (keywordMatch(remark, xuLiKeys)) {
              lockInfo[cn].xuLiLai = appendDate(lockInfo[cn].xuLiLai, lock.date)
            }
            if (keywordMatch(remark, vsKeys)) {
              lockInfo[cn].vsDvs = appendDate(lockInfo[cn].vsDvs, lock.date)
            }
        }
      })
    })

    const itemsWithStatus = list.items.map(i => {
      const info = lockInfo[i.containerNo]
      return {
        ...i,
        locked: info ? info.locked : false,
        dsc: i.dsc || info?.dsc,
        choHtxnDvs: i.choHtxnDvs || info?.choHtxnDvs,
        sc: i.sc || info?.sc,
        vsDvs: i.vsDvs || info?.vsDvs,
        xuLiLai: i.xuLiLai || info?.xuLiLai,
      }
    })

    res.json({ ...list, items: itemsWithStatus })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// DELETE /api/shipping-lists/:id — delete list
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ShippingList.findByIdAndDelete(req.params.id)
    res.json({ message: 'Đã xóa' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// PUT /api/shipping-lists/:id/items — bulk-update item fields
router.put('/:id/items', authMiddleware, async (req, res) => {
  try {
    const { updates } = req.body
    if (!updates || !updates.length) {
      return res.status(400).json({ message: 'Danh sách cập nhật trống' })
    }
    const list = await ShippingList.findById(req.params.id)
    if (!list) return res.status(404).json({ message: 'Không tìm thấy' })
    for (const u of updates) {
      const item = list.items.id(u._id)
      if (!item) continue
      if (u.dsc !== undefined) item.dsc = u.dsc
      if (u.choHtxnDvs !== undefined) item.choHtxnDvs = u.choHtxnDvs
      if (u.sc !== undefined) item.sc = u.sc
      if (u.vsDvs !== undefined) item.vsDvs = u.vsDvs
      if (u.xuLiLai !== undefined) item.xuLiLai = u.xuLiLai
    }
    await list.save()
    res.json(list)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// DELETE /api/shipping-lists/:id/items/:itemId — remove item
router.delete('/:id/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const list = await ShippingList.findById(req.params.id)
    if (!list) return res.status(404).json({ message: 'Không tìm thấy' })
    list.items.pull(req.params.itemId)
    await list.save()
    res.json(list)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
