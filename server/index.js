import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import todoRoutes from './routes/todos.js'
import authRoutes from './routes/auth.js'
import containerRoutes from './routes/containers.js'
import lockRoutes from './routes/locks.js'
import shippingListRoutes from './routes/shippingLists.js'
import User from './models/User.js'

const app = express()
const PORT = process.env.PORT || 5000
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/get-image'

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/todos', todoRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/containers', containerRoutes)
app.use('/api/locks', lockRoutes)
app.use('/api/shipping-lists', shippingListRoutes)

async function seedAdmin() {
  const exists = await User.findOne({ username: 'admin' })
  if (!exists) {
    await User.create({ username: 'admin', password: 'admin123', role: 'Admin' })
    console.log('Created default admin user (admin / admin123)')
  }
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB')
    await mongoose.syncIndexes()
    await seedAdmin()
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message)
    process.exit(1)
  })
