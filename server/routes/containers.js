import { Router } from 'express'
import Container from '../models/Container.js'
import ShippingList from '../models/ShippingList.js'
import ProductionLock from '../models/ProductionLock.js'
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

    const [containers, total] = await Promise.all([
      Container.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      Container.countDocuments(query),
    ])

    const containerNos = containers.map(c => c.containerNo)
    const shippingLists = containerNos.length
      ? await ShippingList.find(
          { 'items.containerNo': { $in: containerNos } },
          { name: 1, 'items.containerNo': 1 }
        ).lean()
      : []

    const containerListMap = {}
    shippingLists.forEach(sl => {
      sl.items.forEach(item => {
        if (!containerListMap[item.containerNo]) {
          containerListMap[item.containerNo] = []
        }
        if (!containerListMap[item.containerNo].some(l => l._id.equals(sl._id))) {
          containerListMap[item.containerNo].push({ _id: sl._id, name: sl.name })
        }
      })
    })

    let data = containers.map(c => ({
      ...c,
      shippingLists: containerListMap[c.containerNo] || [],
      _source: 'container',
    }))

    // When search is present, also include matching items from production locks
    let allData = data
    let finalTotal = total
    if (search) {
      const itemsMatch = {
        $or: [
          { 'items.containerNo': { $regex: search, $options: 'i' } },
          { 'items.shippingLine': { $regex: search, $options: 'i' } },
          { 'items.location': { $regex: search, $options: 'i' } },
        ],
      }
      const lockDocs = await ProductionLock.aggregate([
        { $match: itemsMatch },
        { $unwind: '$items' },
        { $match: itemsMatch },
        {
          $project: {
            _id: { $toString: '$items._id' },
            lockId: { $toString: '$_id' },
            containerNo: '$items.containerNo',
            shippingLine: '$items.shippingLine',
            size: '$items.size',
            location: '$items.location',
            remark: '$items.remark',
            bay: '$items.bay',
            locked: { $literal: true },
            lockDate: '$date',
            lockShift: '$shift',
            _source: { $literal: 'lock' },
            createdAt: { $toDate: '$date' },
          },
        },
        { $sort: { lockDate: -1 } },
      ]).catch(() => [])

      const lockContainerNos = [...new Set(lockDocs.map(i => i.containerNo))]
      const lockListMap = {}
      if (lockContainerNos.length) {
        const lockShippingLists = await ShippingList.find(
          { 'items.containerNo': { $in: lockContainerNos } },
          { name: 1, 'items.containerNo': 1 }
        ).lean()
        lockShippingLists.forEach(sl => {
          sl.items.forEach(item => {
            if (!lockListMap[item.containerNo]) {
              lockListMap[item.containerNo] = []
            }
            if (!lockListMap[item.containerNo].some(l => l._id.equals(sl._id))) {
              lockListMap[item.containerNo].push({ _id: sl._id, name: sl.name })
            }
          })
        })
      }

      let lockItems = lockDocs
        .map(item => ({
          ...item,
          shippingLists: lockListMap[item.containerNo] || [],
        }))

      if (locked === 'false') {
        lockItems = []
      }

      if (lockItems.length) {
        const lockNos = new Set(lockItems.map(i => i.containerNo))
        data = data.filter(c => !lockNos.has(c.containerNo))
      }

      allData = [...data, ...lockItems]
      finalTotal = data.length + lockItems.length
    }

    res.json({
      data: allData,
      total: finalTotal,
      page: parseInt(page),
      totalPages: Math.ceil(finalTotal / parseInt(limit)),
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
    const containers = await Container.find(query).sort({ createdAt: -1 }).lean()

    const containerNos = containers.map(c => c.containerNo)
    const shippingLists = containerNos.length
      ? await ShippingList.find(
          { 'items.containerNo': { $in: containerNos } },
          { name: 1, 'items.containerNo': 1 }
        ).lean()
      : []

    const containerListMap = {}
    shippingLists.forEach(sl => {
      sl.items.forEach(item => {
        if (!containerListMap[item.containerNo]) {
          containerListMap[item.containerNo] = []
        }
        if (!containerListMap[item.containerNo].some(l => l._id.equals(sl._id))) {
          containerListMap[item.containerNo].push({ _id: sl._id, name: sl.name })
        }
      })
    })

    const data = containers.map(c => ({
      ...c,
      shippingLists: containerListMap[c.containerNo] || [],
    }))
    res.json(data)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// POST /api/containers/by-nos — get containers by list of container numbers
router.post('/by-nos', authMiddleware, async (req, res) => {
  try {
    const { containerNos } = req.body
    if (!containerNos || !containerNos.length) {
      return res.json([])
    }
    const containers = await Container.find({
      containerNo: { $in: containerNos.map(n => n.toUpperCase()) },
    }).sort({ createdAt: -1 }).lean()
    res.json(containers)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// GET /api/containers/frequencies — count per containerNo, optionally filtered
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

    // Frequencies from Container collection
    const containerPipeline = Object.keys(match).length
      ? [{ $match: match }, { $group: { _id: '$containerNo', count: { $sum: 1 } } }]
      : [{ $group: { _id: '$containerNo', count: { $sum: 1 } } }]
    containerPipeline.push({ $sort: { count: -1 } })

    const containerResult = await Container.aggregate(containerPipeline)

    // Frequencies from ProductionLock items
    const lockMatch = {}
    if (search) {
      lockMatch['$or'] = [
        { 'items.containerNo': { $regex: search, $options: 'i' } },
        { 'items.shippingLine': { $regex: search, $options: 'i' } },
        { 'items.location': { $regex: search, $options: 'i' } },
      ]
    }
    if (shippingLine) lockMatch['items.shippingLine'] = shippingLine
    if (size) lockMatch['items.size'] = size
    if (location) lockMatch['items.location'] = { $regex: location, $options: 'i' }
    if (remark) lockMatch['items.remark'] = { $regex: remark, $options: 'i' }
    if (dateFrom || dateTo) {
      if (dateFrom) lockMatch.date = { ...(lockMatch.date || {}), $gte: dateFrom }
      if (dateTo) lockMatch.date = { ...(lockMatch.date || {}), $lte: dateTo }
    }

    let lockResult = []
    if (locked !== 'false') {
      const lockPipeline = [
        { $unwind: '$items' },
        ...(Object.keys(lockMatch).length ? [{ $match: lockMatch }] : []),
        { $group: { _id: '$items.containerNo', count: { $sum: 1 } } },
      ]
      lockResult = await ProductionLock.aggregate(lockPipeline).catch(() => [])
    }

    // Merge both results (mirror dedup logic: exclude Container count if containerNo also in ProductionLock)
    const lockNos = new Set(lockResult.map(r => r._id))
    const map = {}
    containerResult.forEach(r => {
      if (!lockNos.has(r._id)) map[r._id] = r.count
    })
    lockResult.forEach(r => { map[r._id] = (map[r._id] || 0) + r.count })

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

export default router
