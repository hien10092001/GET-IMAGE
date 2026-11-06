import { Router } from 'express'
import Classification from '../models/Classification.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    let doc = await Classification.findOne({ key: 'main' })
    if (!doc) {
      doc = await Classification.create({ key: 'main', dsc: [], xuLi: [], vs: [] })
    }
    res.json(doc)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

router.put('/', authMiddleware, async (req, res) => {
  try {
    const { dsc, xuLi, vs } = req.body
    const doc = await Classification.findOneAndUpdate(
      { key: 'main' },
      { $set: { dsc: dsc || [], xuLi: xuLi || [], vs: vs || [] } },
      { upsert: true, new: true }
    )
    res.json(doc)
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

export default router
