import { Router } from 'express'
import ProductionLock from '../models/ProductionLock.js'
import Container from '../models/Container.js'
import { authMiddleware } from '../middleware/auth.js'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek.js'
dayjs.extend(isoWeek)

const router = Router()

// GET /api/locks — list all locks
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query
    const query = {}
    if (date) query.date = date
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
    const lock = await ProductionLock.findByIdAndUpdate(
      req.params.id,
      { $pull: { items: { _id: req.params.itemId } } },
      { new: true }
    )
    if (!lock) return res.status(404).json({ message: 'Không tìm thấy' })
    res.json(lock)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// DELETE /api/locks/:id — delete entire lock
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const lock = await ProductionLock.findByIdAndDelete(req.params.id)
    if (!lock) return res.status(404).json({ message: 'Không tìm thấy' })
    res.json({ message: 'Đã xóa' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/stats/dashboard', authMiddleware, async (req, res) => {
  try {
    const now = dayjs()
    const todayStr = now.format('YYYY-MM-DD')
    const monthPrefix = now.format('YYYY-MM')

    const allLocks = await ProductionLock.find({}).sort({ date: -1, shift: -1 }).lean()

    const totalLocks = allLocks.length
    const totalLockedItems = allLocks.reduce((s, l) => s + (l.items?.length || 0), 0)

    const todayLocks = allLocks.filter(l => l.date === todayStr)
    const todayLockedItems = todayLocks.reduce((s, l) => s + (l.items?.length || 0), 0)
    const todayMorning = todayLocks.filter(l => l.shift === 'sáng').reduce((s, l) => s + (l.items?.length || 0), 0)
    const todayEvening = todayLocks.filter(l => l.shift === 'tối').reduce((s, l) => s + (l.items?.length || 0), 0)

    const monthLocks = allLocks.filter(l => l.date?.startsWith(monthPrefix))
    const monthLockedItems = monthLocks.reduce((s, l) => s + (l.items?.length || 0), 0)

    const dayMap = {}
    monthLocks.forEach(lock => {
      dayMap[lock.date] = (dayMap[lock.date] || 0) + (lock.items?.length || 0)
    })
    const byDay = Object.entries(dayMap)
      .map(([date, total]) => ({ _id: date, total }))
      .sort((a, b) => a._id.localeCompare(b._id))

    const byShift = [
      { _id: 'sáng', total: allLocks.filter(l => l.shift === 'sáng').reduce((s, l) => s + (l.items?.length || 0), 0) },
      { _id: 'tối', total: allLocks.filter(l => l.shift === 'tối').reduce((s, l) => s + (l.items?.length || 0), 0) },
    ]

    const lineMap = {}
    allLocks.forEach(lock => {
      ;(lock.items || []).forEach(item => {
        const line = item.shippingLine || '(trống)'
        lineMap[line] = (lineMap[line] || 0) + 1
      })
    })
    const byShippingLine = Object.entries(lineMap)
      .map(([name, total]) => ({ _id: name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    const weekMap = {}
    allLocks.forEach(lock => {
      if (!lock.date) return
      const d = dayjs(lock.date)
      const wk = d.isoWeek()
      const yr = d.year()
      const key = `${yr}-W${String(wk).padStart(2, '0')}`
      if (!weekMap[key]) {
        weekMap[key] = { week: wk, year: yr, total: 0, label: `${wk}/${yr}` }
      }
      weekMap[key].total += lock.items?.length || 0
    })
    const byWeek = Object.values(weekMap)
      .sort((a, b) => b.year - a.year || b.week - a.week)
      .slice(0, 12)
      .reverse()

    const monthMap = {}
    allLocks.forEach(lock => {
      if (!lock.date) return
      const m = lock.date.substring(0, 7)
      monthMap[m] = (monthMap[m] || 0) + (lock.items?.length || 0)
    })
    const byMonth = Object.entries(monthMap)
      .map(([_id, total]) => ({ _id, total }))
      .sort((a, b) => a._id.localeCompare(b._id))
      .slice(-12)

    const dailyDetailMap = {}
    monthLocks.forEach(lock => {
      if (!dailyDetailMap[lock.date]) {
        dailyDetailMap[lock.date] = { date: lock.date, total: 0, shippingLines: {} }
      }
      dailyDetailMap[lock.date].total += lock.items?.length || 0
      ;(lock.items || []).forEach(item => {
        const line = item.shippingLine || '(trống)'
        dailyDetailMap[lock.date].shippingLines[line] = (dailyDetailMap[lock.date].shippingLines[line] || 0) + 1
      })
    })
    const dailyDetail = Object.values(dailyDetailMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        total: d.total,
        shippingLines: Object.entries(d.shippingLines)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      }))

    const recentLocks = allLocks.slice(0, 10)

    res.json({
      totalLocks,
      totalLockedItems,
      todayLockedItems,
      todayMorning,
      todayEvening,
      monthLockedItems,
      byDay,
      byShift,
      byWeek,
      byMonth,
      byShippingLine,
      dailyDetail,
      recentLocks,
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
