import mongoose from 'mongoose'

const slScPadSchema = new mongoose.Schema({
  line: {
    type: String,
    default: '',
    trim: true,
    uppercase: true,
  },
  containerNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  sztp: {
    type: String,
    default: '',
    trim: true,
  },
  ngaySc: {
    type: String,
    default: '',
    trim: true,
  },
  tienHang: {
    type: Number,
    default: 0,
  },
  tienHungThinh: {
    type: Number,
    default: 0,
  },
  remark: {
    type: String,
    default: '',
    trim: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  outputId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SlScPadHistory',
    default: null,
  },
  outputAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true })

slScPadSchema.index({ line: 1, containerNo: 1 }, { unique: true })
slScPadSchema.index({ order: 1 })
slScPadSchema.index({ outputId: 1 })

export default mongoose.model('SlScPad', slScPadSchema)
