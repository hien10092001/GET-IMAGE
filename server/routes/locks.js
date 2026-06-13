import { Router } from 'express'
import ProductionLock from '../models/ProductionLock.js'
import Container from '../models/Container.js'
import ShippingList from '../models/ShippingList.js'
import { authMiddleware } from '../middleware/auth.js'


function appendDate(current, newDate) {
  if (!current) return newDate
  const dates = current.split(', ').map(d => d.trim())
  if (dates.includes(newDate)) return current
  return current + ', ' + newDate
}

async function updateShippingListFromLock(items, lockDate) {
  for (const item of items) {
    const cn = item.containerNo
    const remark = (item.remark || '').toUpperCase()
    const lists = await ShippingList.find({ 'items.containerNo': cn })
    for (const list of lists) {
      const listItem = list.items.find(i => i.containerNo === cn)
      if (!listItem) continue
      if (/VS\s*[-–]\s*DVS/.test(remark)) {
        listItem.vsDvs = appendDate(listItem.vsDvs, lockDate)
      } else if (/X[UÚÙỦŨỤỨỪỬỮỰ] L[IÍÌĨỊ] L[AÀÁÃẠ]I/.test(remark)) {
        listItem.xuLiLai = appendDate(listItem.xuLiLai, lockDate)
      } else if (/\bDSC\b/.test(remark) || /CHO\s+HTXN/.test(remark) || /\bDVS\b/.test(remark) || /\bSC\b/.test(remark)) {
        listItem.dsc = appendDate(listItem.dsc, lockDate)
        listItem.choHtxnDvs = appendDate(listItem.choHtxnDvs, lockDate)
        listItem.sc = appendDate(listItem.sc, lockDate)
      }
      await list.save()
    }
  }
}

const router = Router()

// GET /api/locks — list all locks, with optional filters
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date, dateFrom, dateTo, shift, search, shippingLine, size, location } = req.query
    const query = {}
    if (date) {
      query.date = date
    } else if (dateFrom || dateTo) {
      query.date = {}
      if (dateFrom) query.date.$gte = dateFrom
      if (dateTo) query.date.$lte = dateTo
    }
    if (shift) query.shift = shift
    if (search) query['items.containerNo'] = { $regex: search, $options: 'i' }
    if (shippingLine) query['items.shippingLine'] = { $regex: shippingLine, $options: 'i' }
    if (size) query['items.size'] = { $regex: size, $options: 'i' }
    if (location) query['items.location'] = { $regex: location, $options: 'i' }
    const locks = await ProductionLock.find(query).sort({ date: -1, shift: -1 })
    res.json(locks)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST /api/locks — create or update a lock (upsert by date+shift)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { date, shift, items, containerIds } = req.body
    if (!date || !shift) {
      return res.status(400).json({ message: 'Thiếu ngày hoặc ca' })
    }
    const lock = await ProductionLock.findOneAndUpdate(
      { date, shift },
      {
        $set: { date, shift, createdBy: req.user.username },
        $push: { items: { $each: items || [] } },
      },
      { upsert: true, new: true }
    )
    if (containerIds && containerIds.length) {
      await Container.updateMany(
        { _id: { $in: containerIds } },
        { $set: { locked: true } }
      )
    }
    if (items && items.length) {
      updateShippingListFromLock(items, date).catch(() => {})
    }
    res.status(201).json(lock)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// PUT /api/locks/:id/items — add items to existing lock
router.put('/:id/items', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body
    if (!items || !items.length) {
      return res.status(400).json({ message: 'Danh sách items trống' })
    }
    const lock = await ProductionLock.findByIdAndUpdate(
      req.params.id,
      { $push: { items: { $each: items } } },
      { new: true }
    )
    if (!lock) return res.status(404).json({ message: 'Không tìm thấy lock' })
    if (items && items.length) {
      updateShippingListFromLock(items, lock.date).catch(() => {})
    }
    res.json(lock)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// PUT /api/locks/:id/items/:itemId — update one item
router.put('/:id/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const lock = await ProductionLock.findOneAndUpdate(
      { _id: req.params.id, 'items._id': req.params.itemId },
      { $set: Object.fromEntries(
        Object.entries(req.body).map(([k, v]) => [`items.$.${k}`, v])
      )},
      { new: true }
    )
    if (!lock) return res.status(404).json({ message: 'Không tìm thấy' })
    res.json(lock)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// DELETE /api/locks/:id/items/:itemId — remove one item
router.delete('/:id/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const lock = await ProductionLock.findById(req.params.id)
    if (!lock) return res.status(404).json({ message: 'Không tìm thấy' })
    const item = lock.items.id(req.params.itemId)
    if (!item) return res.status(404).json({ message: 'Không tìm thấy item' })
    const { containerNo } = item
    lock.items.pull(req.params.itemId)
    await lock.save()
    if (containerNo) {
      const stillExists = await ProductionLock.findOne({ 'items.containerNo': containerNo })
      if (!stillExists) {
        await Container.updateMany({ containerNo }, { $set: { locked: false } })
      }
    }
    res.json(lock)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// DELETE /api/locks/:id — delete entire lock
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const lock = await ProductionLock.findById(req.params.id)
    if (!lock) return res.status(404).json({ message: 'Không tìm thấy' })
    const containerNos = [...new Set(lock.items.map(i => i.containerNo))]
    await ProductionLock.findByIdAndDelete(req.params.id)
    for (const containerNo of containerNos) {
      const stillExists = await ProductionLock.findOne({ 'items.containerNo': containerNo })
      if (!stillExists) {
        await Container.updateMany({ containerNo }, { $set: { locked: false } })
      }
    }
    res.json({ message: 'Đã xóa' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/frequencies', authMiddleware, async (req, res) => {
  try {
    const result = await ProductionLock.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.containerNo', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    const map = {}
    result.forEach(r => { map[r._id] = r.count })
    res.json(map)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET /api/locks/container-data/:containerNo — return unique container data from lock items
router.get('/container-data/:containerNo', authMiddleware, async (req, res) => {
  try {
    const escaped = req.params.containerNo.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const result = await ProductionLock.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.containerNo': { $regex: '^' + escaped } } },
      { $sort: { 'items.containerNo': 1 } },
      {
        $group: {
          _id: {
            containerNo: '$items.containerNo',
            shippingLine: '$items.shippingLine',
            size: '$items.size',
            location: '$items.location',
            bay: '$items.bay',
            remark: '$items.remark',
          },
        },
      },
      {
        $project: {
          _id: 0,
          containerNo: '$_id.containerNo',
          shippingLine: '$_id.shippingLine',
          size: '$_id.size',
          location: '$_id.location',
          bay: '$_id.bay',
          remark: '$_id.remark',
        },
      },
      { $limit: 30 },
    ])
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST /api/locks/check-status — check which containers are locked
router.post('/check-status', authMiddleware, async (req, res) => {
  try {
    const { containerNos } = req.body
    if (!containerNos || !containerNos.length) {
      return res.json({})
    }
    const locks = await ProductionLock.find(
      { 'items.containerNo': { $in: containerNos } },
      { 'items.containerNo': 1 }
    ).lean()
    const lockedSet = new Set()
    locks.forEach(lock => {
      lock.items.forEach(item => {
        lockedSet.add(item.containerNo)
      })
    })
    const result = {}
    containerNos.forEach(no => {
      result[no] = lockedSet.has(no)
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
