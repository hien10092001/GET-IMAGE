import { Router } from 'express'
import User from '../models/User.js'
import { generateToken, authMiddleware } from '../middleware/auth.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { username, password, role } = req.body
    if (!username || !password) {
      return res.status(400).json({ message: 'Username và password là bắt buộc' })
    }
    const exists = await User.findOne({ username })
    if (exists) {
      return res.status(400).json({ message: 'Username đã tồn tại' })
    }
    const user = await User.create({ username, password, role: role || 'User' })
    const token = generateToken(user)
    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, role: user.role },
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) {
      return res.status(400).json({ message: 'Username và password là bắt buộc' })
    }
    const user = await User.findOne({ username })
    if (!user) {
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' })
    }
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Sai tài khoản hoặc mật khẩu' })
    }
    const token = generateToken(user)
    res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role },
    })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.get('/me', authMiddleware, async (req, res) => {
  res.json({ user: req.user })
})

export default router
