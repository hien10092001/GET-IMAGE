import { Router } from 'express'
import Depot from '../models/Depot.js'
import ProductionLock from '../models/ProductionLock.js'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'

const router = Router()

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const toDateKey = (value) => {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { containerNo, shippingLine, size, bay, location, remark, createdAt, hinhIn, hinhSC, folderIn, folderSC, folderSC2 } = req.body
    if (!containerNo) {
      return res.status(400).json({ message: 'Thiếu Container No' })
    }
    const payload = {
      containerNo: containerNo.toUpperCase(),
      shippingLine,
      size,
      bay,
      location,
      remark,
      hinhIn,
      hinhSC,
      folderIn,
      folderSC,
      folderSC2,
      createdBy: req.user.username,
    }
    if (createdAt) payload.createdAt = createdAt
    const depot = await Depot.create(payload)
    res.status(201).json(depot)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/', async (req, res) => {
  try {
    const { search, shippingLine, size, dateFrom, dateTo, location, remark, locked, page = 1, limit = 20, sort = 'createdAt', includeLocks } = req.query
    const pageNum = Math.max(parseInt(page) || 1, 1)
    const limitNum = Math.max(parseInt(limit) || 20, 1)
    const skip = (pageNum - 1) * limitNum
    const mergeLocks = includeLocks === '1' || includeLocks === 'true' || !!search
    const sortKey = sort.startsWith('-') ? sort.slice(1) : sort
    const sortDir = sort.startsWith('-') ? -1 : 1

    const query = {}
    if (search) {
      query.$or = [
        { containerNo: { $regex: search, $options: 'i' } },
        { shippingLine: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ]
    } else if (locked === undefined || locked === '') {
      query.locked = { $ne: true }
    }
    if (shippingLine) query.shippingLine = shippingLine
    if (size) query.size = size
    if (location) query.location = { $regex: location, $options: 'i' }
    if (remark) query.remark = { $regex: remark, $options: 'i' }
    if (locked === 'true') query.locked = true
    else if (locked === 'false') query.locked = false
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        query.createdAt.$lt = end
      }
    }

    const sortObj = {}
    sortObj[sortKey] = sortDir

    let depots
    let total
    if (mergeLocks) {
      depots = await Depot.find(query).sort(sortObj).lean()
      total = depots.length
    } else {
      const result = await Promise.all([
        Depot.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
        Depot.countDocuments(query),
      ])
      depots = result[0]
      total = result[1]
    }

    let lockItems = []
    if (mergeLocks && locked !== 'false') {
      const lockMatch = { type: 'depot' }
      if (dateFrom || dateTo) {
        lockMatch.date = {}
        if (dateFrom) lockMatch.date.$gte = dateFrom
        if (dateTo) lockMatch.date.$lte = dateTo
      }

      const itemMatch = {}
      if (search) {
        itemMatch.$or = [
          { 'items.containerNo': { $regex: search, $options: 'i' } },
          { 'items.shippingLine': { $regex: search, $options: 'i' } },
          { 'items.location': { $regex: search, $options: 'i' } },
        ]
      }
      if (shippingLine) itemMatch['items.shippingLine'] = { $regex: `^${escapeRegex(shippingLine)}$`, $options: 'i' }
      if (size) itemMatch['items.size'] = { $regex: `^${escapeRegex(size)}$`, $options: 'i' }
      if (location) itemMatch['items.location'] = { $regex: escapeRegex(location), $options: 'i' }
      if (remark) itemMatch['items.remark'] = { $regex: escapeRegex(remark), $options: 'i' }

      const pipeline = [
        { $match: lockMatch },
        { $unwind: '$items' },
      ]
      if (Object.keys(itemMatch).length) pipeline.push({ $match: itemMatch })
      pipeline.push({
        $project: {
          _id: { $toString: '$items._id' },
          lockId: { $toString: '$_id' },
          containerNo: '$items.containerNo',
          shippingLine: '$items.shippingLine',
          size: '$items.size',
          bay: '$items.bay',
          location: '$items.location',
          remark: '$items.remark',
          locked: { $literal: true },
          lockDate: '$date',
          lockShift: '$shift',
          _source: { $literal: 'lock' },
          createdAt: { $toDate: '$date' },
        },
      })

      const lockDocs = await ProductionLock.aggregate(pipeline).catch(() => [])
      const seen = new Set()
      lockItems = lockDocs.filter((item) => {
        const key = `${item.containerNo}|${item.lockDate}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    let data
    let finalTotal
    if (mergeLocks) {
      const lockKeys = new Set(lockItems.map((item) => `${item.containerNo}|${item.lockDate}`))
      const depotRows = depots
        .filter((item) => !lockKeys.has(`${item.containerNo}|${toDateKey(item.createdAt)}`))
        .map((item) => ({ ...item, _source: 'depot' }))
      data = [...depotRows, ...lockItems]
      data.sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        if (sortKey === 'createdAt') {
          const at = av ? new Date(av).getTime() : 0
          const bt = bv ? new Date(bv).getTime() : 0
          return (at - bt) * sortDir
        }
        if (typeof av === 'string' && typeof bv === 'string') {
          return av.localeCompare(bv, 'vi') * sortDir
        }
        if (av === bv) return 0
        if (av == null) return 1 * sortDir
        if (bv == null) return -1 * sortDir
        return (av > bv ? 1 : -1) * sortDir
      })
      finalTotal = data.length
      data = data.slice(skip, skip + limitNum)
    } else {
      data = depots.map((item) => ({ ...item, _source: 'depot' }))
      finalTotal = total
    }

    res.json({
      data,
      total: finalTotal,
      page: pageNum,
      totalPages: Math.ceil(finalTotal / limitNum),
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/all', authMiddleware, async (req, res) => {
  try {
    const { search, shippingLine, size, dateFrom, dateTo, location, remark, locked } = req.query
    const query = {}
    if (search) {
      query.$or = [
        { containerNo: { $regex: search, $options: 'i' } },
        { shippingLine: { $regex: search, $options: 'i' } },
      ]
    } else if (locked === undefined || locked === '') {
      query.locked = { $ne: true }
    }
    if (shippingLine) query.shippingLine = shippingLine
    if (size) query.size = size
    if (location) query.location = { $regex: location, $options: 'i' }
    if (remark) query.remark = { $regex: remark, $options: 'i' }
    if (locked === 'true') query.locked = true
    else if (locked === 'false') query.locked = false
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        query.createdAt.$lt = end
      }
    }
    const depots = await Depot.find(query).sort({ createdAt: -1 }).lean()

    res.json(depots)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/by-nos', authMiddleware, async (req, res) => {
  try {
    const { containerNos } = req.body
    if (!containerNos || !containerNos.length) {
      return res.json([])
    }
    const depots = await Depot.find({
      containerNo: { $in: containerNos.map(n => n.toUpperCase()) },
    }).sort({ createdAt: -1 }).lean()
    res.json(depots)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/frequencies', authMiddleware, async (req, res) => {
  try {
    const { search, shippingLine, size, dateFrom, dateTo, location, remark, locked } = req.query
    const match = {}

    if (search) {
      match.$or = [
        { containerNo: { $regex: search, $options: 'i' } },
        { shippingLine: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ]
    } else if (locked === undefined || locked === '') {
      match.locked = { $ne: true }
    }
    if (shippingLine) match.shippingLine = shippingLine
    if (size) match.size = size
    if (location) match.location = { $regex: location, $options: 'i' }
    if (remark) match.remark = { $regex: remark, $options: 'i' }
    if (locked === 'true') match.locked = true
    else if (locked === 'false') match.locked = false
    if (dateFrom || dateTo) {
      match.createdAt = {}
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        match.createdAt.$lte = end
      }
    }

    const pipeline = Object.keys(match).length
      ? [{ $match: match }, { $group: { _id: '$containerNo', count: { $sum: 1 } } }]
      : [{ $group: { _id: '$containerNo', count: { $sum: 1 } } }]
    pipeline.push({ $sort: { count: -1 } })

    const result = await Depot.aggregate(pipeline)
    const map = {}
    result.forEach(r => { map[r._id] = r.count })
    res.json(map)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/locations', authMiddleware, async (req, res) => {
  try {
    const result = await Depot.aggregate([
      { $match: { location: { $ne: '' } } },
      { $group: { _id: { containerNo: '$containerNo', location: '$location' } } },
      { $group: { _id: '$_id.containerNo', locations: { $addToSet: '$_id.location' } } },
    ])
    const map = {}
    result.forEach(r => { map[r._id] = r.locations })
    res.json(map)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/by-number/:containerNo', authMiddleware, async (req, res) => {
  try {
    const depots = await Depot.find({
      containerNo: { $regex: '^' + req.params.containerNo.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
    }).sort({ createdAt: -1 }).limit(20)
    res.json(depots)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const depot = await Depot.findById(req.params.id)
    if (!depot) return res.status(404).json({ message: 'Không tìm thấy' })
    res.json(depot)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { containerNo, shippingLine, size, bay, location, remark, createdAt, hinhIn, hinhSC, folderIn, folderSC, folderSC2 } = req.body
    const update = {}
    if (containerNo !== undefined) update.containerNo = containerNo.toUpperCase()
    if (shippingLine !== undefined) update.shippingLine = shippingLine
    if (size !== undefined) update.size = size
    if (bay !== undefined) update.bay = bay
    if (location !== undefined) update.location = location
    if (remark !== undefined) update.remark = remark
    if (createdAt !== undefined) update.createdAt = createdAt
    if (hinhIn !== undefined) update.hinhIn = hinhIn
    if (hinhSC !== undefined) update.hinhSC = hinhSC
    if (folderIn !== undefined) update.folderIn = folderIn
    if (folderSC !== undefined) update.folderSC = folderSC
    if (folderSC2 !== undefined) update.folderSC2 = folderSC2

    const depot = await Depot.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!depot) return res.status(404).json({ message: 'Không tìm thấy' })
    res.json(depot)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/all', authMiddleware, roleMiddleware('Admin', 'Supervisor'), async (req, res) => {
  try {
    const result = await Depot.deleteMany({})
    res.json({ message: `Đã xóa tất cả ${result.deletedCount} bản ghi` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/:id', authMiddleware, roleMiddleware('Admin', 'Supervisor'), async (req, res) => {
  try {
    const depot = await Depot.findByIdAndDelete(req.params.id)
    if (!depot) return res.status(404).json({ message: 'Không tìm thấy' })
    res.json({ message: 'Đã xóa' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
