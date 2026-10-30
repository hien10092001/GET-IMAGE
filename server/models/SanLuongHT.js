import mongoose from 'mongoose'

const sanLuongHTSchema = new mongoose.Schema({
  containerNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  nBg: {
    type: String,
    default: '',
    trim: true,
  },
  nApr: {
    type: String,
    default: '',
    trim: true,
  },
  sztp: {
    type: String,
    default: '',
    trim: true,
  },
  nComplete: {
    type: String,
    default: '',
    trim: true,
  },
  nSc: {
    type: String,
    default: '',
    trim: true,
  },
  remark: {
    type: String,
    default: '',
    trim: true,
  },
  chiTietSc: {
    type: String,
    default: '',
    trim: true,
  },
  order: {
    type: Number,
    default: 0,
  },
}, { timestamps: true })

sanLuongHTSchema.index({ containerNo: 1 })
sanLuongHTSchema.index({ order: 1 })

export default mongoose.model('SanLuongHT', sanLuongHTSchema)
