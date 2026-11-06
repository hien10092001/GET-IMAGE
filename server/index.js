import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import todoRoutes from './routes/todos.js'
import authRoutes from './routes/auth.js'
import containerRoutes from './routes/containers.js'
import depotRoutes from './routes/depots.js'
import lockRoutes from './routes/locks.js'
import shippingListRoutes from './routes/shippingLists.js'
import classificationRoutes from './routes/classification.js'
import sanLuongHTRoutes from './routes/sanLuongHT.js'
import cleanupRoutes from './routes/cleanup.js'
import emailRoutes from './routes/email.js'
import referenceRoutes from './routes/references.js'
import publicImageRoutes from './routes/publicImages.js'
import User from './models/User.js'

if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '64'

const app = express()
const PORT = process.env.PORT || 5000
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/get-image'

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/todos', todoRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/containers', containerRoutes)
app.use('/api/depots', depotRoutes)
app.use('/api/locks', lockRoutes)
app.use('/api/shipping-lists', shippingListRoutes)
app.use('/api/classification', classificationRoutes)
app.use('/api/sanluong-ht', sanLuongHTRoutes)
app.use('/api/cleanup', cleanupRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/references', referenceRoutes)
app.use('/api/public-images', publicImageRoutes)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

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
