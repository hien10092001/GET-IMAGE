import { Router } from 'express'
import Container from '../models/Container.js'
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
    const container = await Container.create(payload)
    res.status(201).json(container)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { search, shippingLine, size, dateFrom, dateTo, page = 1, limit = 20, sort = 'createdAt' } = req.query
    const query = {}

    if (search) {
      query.$or = [
        { containerNo: { $regex: search, $options: 'i' } },
        { shippingLine: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ]
    } else {
      query.locked = { $ne: true }
    }
    if (shippingLine) query.shippingLine = shippingLine
    if (size) query.size = size
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

    const [containers, total] = await Promise.all([
      Container.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)),
      Container.countDocuments(query),
    ])

    res.json({
      data: containers,
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
    const { search, shippingLine, size, dateFrom, dateTo } = req.query
    const query = {}
    if (search) {
      query.$or = [
        { containerNo: { $regex: search, $options: 'i' } },
        { shippingLine: { $regex: search, $options: 'i' } },
      ]
    } else {
      query.locked = { $ne: true }
    }
    if (shippingLine) query.shippingLine = shippingLine
    if (size) query.size = size
    if (dateFrom || dateTo) {
      query.createdAt = {}
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setDate(end.getDate() + 1)
        query.createdAt.$lt = end
      }
    }
    const containers = await Container.find(query).sort({ createdAt: -1 })
    res.json(containers)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET /api/containers/frequencies — count per containerNo across ALL containers
router.get('/frequencies', authMiddleware, async (req, res) => {
  try {
    const result = await Container.aggregate([
      { $group: { _id: '$containerNo', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    const map = {}
    result.forEach(r => { map[r._id] = r.count })
    res.json(map)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET /api/containers/locations — map containerNo → unique location values
router.get('/locations', authMiddleware, async (req, res) => {
  try {
    const result = await Container.aggregate([
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
    const containers = await Container.find({
      containerNo: { $regex: '^' + req.params.containerNo.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
    }).sort({ createdAt: -1 }).limit(20)
    res.json(containers)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const container = await Container.findById(req.params.id)
    if (!container) return res.status(404).json({ message: 'Không tìm thấy container' })
    res.json(container)
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

    const container = await Container.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!container) return res.status(404).json({ message: 'Không tìm thấy container' })
    res.json(container)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/all', authMiddleware, roleMiddleware('Admin', 'Supervisor'), async (req, res) => {
  try {
    const result = await Container.deleteMany({})
    res.json({ message: `Đã xóa tất cả ${result.deletedCount} container` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/:id', authMiddleware, roleMiddleware('Admin', 'Supervisor'), async (req, res) => {
  try {
    const container = await Container.findByIdAndDelete(req.params.id)
    if (!container) return res.status(404).json({ message: 'Không tìm thấy container' })
    res.json({ message: 'Đã xóa container' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/stats/dashboard', authMiddleware, async (req, res) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalContainers,
      todayContainers,
      yesterdayContainers,
      monthContainers,
      lastMonthContainers,
    ] = await Promise.all([
      Container.countDocuments(),
      Container.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } }),
      Container.countDocuments({ createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
      Container.countDocuments({ createdAt: { $gte: monthStart, $lt: monthEnd } }),
      Container.countDocuments({ createdAt: { $gte: lastMonthStart, $lt: lastMonthEnd } }),
    ])

    const [byDay, byMonth, byWeek, byShippingLine, bySize, topContainers, dailyDetail] = await Promise.all([
      Container.aggregate([
        { $match: { createdAt: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Container.aggregate([
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $limit: 12 },
      ]),
      Container.aggregate([
        {
          $group: {
            _id: { week: { $isoWeek: '$createdAt' }, year: { $isoWeekYear: '$createdAt' } },
            total: { $sum: 1 },
            startDate: { $min: '$createdAt' },
            endDate: { $max: '$createdAt' },
          },
        },
        { $sort: { '_id.year': -1, '_id.week': -1 } },
        { $limit: 12 },
        {
          $project: {
            _id: 0,
            week: '$_id.week',
            year: '$_id.year',
            total: 1,
            label: { $concat: [{ $toString: '$_id.week' }, '/', { $toString: '$_id.year' }] },
            startDate: 1,
            endDate: 1,
          },
        },
      ]),
      Container.aggregate([
        { $group: { _id: '$shippingLine', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      Container.aggregate([
        { $group: { _id: '$size', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Container.aggregate([
        { $match: { createdAt: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: { containerNo: '$containerNo', shippingLine: '$shippingLine', size: '$size', location: '$location', bay: '$bay', remark: '$remark' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $replaceRoot: { newRoot: { $mergeObjects: ['$_id', { count: '$count' }] } } },
      ]),
      Container.aggregate([
        { $match: { createdAt: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, shippingLine: '$shippingLine' }, count: { $sum: 1 } } },
        { $sort: { '_id.date': 1, count: -1 } },
        { $group: { _id: '$_id.date', shippingLines: { $push: { name: '$_id.shippingLine', count: '$count' } }, total: { $sum: '$count' } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, date: '$_id', total: 1, shippingLines: 1 } },
      ]),
    ])

    res.json({
      totalContainers,
      todayContainers,
      yesterdayContainers,
      monthContainers,
      lastMonthContainers,
      byDay,
      byMonth,
      byWeek,
      byShippingLine,
      bySize,
      topContainers,
      dailyDetail,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
