import { Router } from 'express'
import Container from '../models/Container.js'
import ShippingList from '../models/ShippingList.js'
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
    const container = await Container.create(payload)
    res.status(201).json(container)
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

    let containers
    let total
    if (mergeLocks) {
      containers = await Container.find(query).sort(sortObj).lean()
      total = containers.length
    } else {
      const result = await Promise.all([
        Container.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
        Container.countDocuments(query),
      ])
      containers = result[0]
      total = result[1]
    }

    let lockItems = []
    if (mergeLocks && locked !== 'false') {
      const lockMatch = { type: 'container' }
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
          location: '$items.location',
          remark: '$items.remark',
          bay: '$items.bay',
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
      const containerRows = containers
        .filter((item) => !lockKeys.has(`${item.containerNo}|${toDateKey(item.createdAt)}`))
        .map((item) => ({ ...item, _source: 'container' }))
      data = [...containerRows, ...lockItems]
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
      data = containers.map((item) => ({ ...item, _source: 'container' }))
      finalTotal = total
    }

    const pageContainerNos = data.map((item) => item.containerNo)
    const shippingLists = pageContainerNos.length
      ? await ShippingList.find(
          { 'items.containerNo': { $in: pageContainerNos } },
          { name: 1, 'items.containerNo': 1 }
        ).lean()
      : []

    const containerListMap = {}
    shippingLists.forEach((shippingList) => {
      shippingList.items.forEach((item) => {
        if (!containerListMap[item.containerNo]) {
          containerListMap[item.containerNo] = []
        }
        if (!containerListMap[item.containerNo].some((entry) => entry._id.equals(shippingList._id))) {
          containerListMap[item.containerNo].push({ _id: shippingList._id, name: shippingList.name })
        }
      })
    })

    data = data.map((item) => ({
      ...item,
      shippingLists: containerListMap[item.containerNo] || [],
    }))

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
