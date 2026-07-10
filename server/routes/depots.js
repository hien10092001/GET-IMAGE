import { Router } from 'express'
import Depot from '../models/Depot.js'
import { authMiddleware, roleMiddleware } from '../middleware/auth.js'

const router = Router()

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { containerNo, shippingLine, size, bay, location, remark, createdAt, hinhIn, hinhSC, folderIn, folderSC, folderSC2 } = req.body
    if (!containerNo || !shippingLine || !size) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' })
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

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search, shippingLine, size, dateFrom, dateTo, location, remark, locked, page = 1, limit = 20, sort = 'createdAt' } = req.query
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
        query.createdAt.$lte = end
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const sortObj = {}
    if (sort.startsWith('-')) {
      sortObj[sort.slice(1)] = -1
    } else {
      sortObj[sort] = 1
    }

    const [depots, total] = await Promise.all([
      Depot.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      Depot.countDocuments(query),
    ])

    let data = depots.map(c => ({
      ...c,
      _source: 'depot',
    }))

    res.json({
      data,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
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
