import { Router } from 'express'
import Reference from '../models/Reference.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.get('/:scope/:type', async (req, res) => {
  try {
    const doc = await Reference.findOne({
      scope: req.params.scope,
      type: req.params.type,
    })
    res.json({ items: doc?.items || [] })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.put('/:scope/:type', authMiddleware, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const doc = await Reference.findOneAndUpdate(
      { scope: req.params.scope, type: req.params.type },
      { $set: { items } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.json({ items: doc.items })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

export default router
