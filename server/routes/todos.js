import { Router } from 'express'
import Todo from '../models/Todo.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const { date } = req.query
    let query = {}
    if (date) {
      query.date = date
    }
    const todos = await Todo.find(query).sort({ session: 1, createdAt: 1 })
    res.json(todos)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/dates', async (req, res) => {
  try {
    const result = await Todo.aggregate([
      { $group: { _id: '$date', total: { $sum: 1 }, completed: { $sum: { $cond: ['$completed', 1, 0] } } } },
      { $project: { _id: 0, date: '$_id', total: 1, completed: 1 } },
      { $sort: { date: -1 } },
    ])
    res.json(result)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const { title, date, session } = req.body
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' })
    }
    const todo = await Todo.create({
      title: title.trim(),
      date: date || new Date().toISOString().split('T')[0],
      session: session || 'morning',
    })
    res.status(201).json(todo)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { title, completed } = req.body
    const update = {}
    if (title !== undefined) update.title = title.trim()
    if (completed !== undefined) update.completed = completed
    const todo = await Todo.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!todo) return res.status(404).json({ message: 'Todo not found' })
    res.json(todo)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id)
    if (!todo) return res.status(404).json({ message: 'Todo not found' })
    res.json({ message: 'Deleted' })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
