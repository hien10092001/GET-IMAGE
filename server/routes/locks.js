import { Router } from 'express'
import ProductionLock from '../models/ProductionLock.js'
import Container from '../models/Container.js'
import { authMiddleware } from '../middleware/auth.js'

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

export default router
