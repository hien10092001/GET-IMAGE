import mongoose from 'mongoose'

const classificationSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'main',
    unique: true,
  },
  dsc: [String],
  xuLi: [String],
  vs: [String],
}, { timestamps: true })

export default mongoose.model('Classification', classificationSchema)
