import mongoose from 'mongoose'

const todoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  date: {
    type: String,
    required: true,
  },
  session: {
    type: String,
    enum: ['morning', 'evening'],
    default: 'morning',
  },
}, { timestamps: true })

export default mongoose.model('Todo', todoSchema)
