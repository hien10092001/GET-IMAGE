import mongoose from 'mongoose'

const historyItemSchema = new mongoose.Schema({
  line: { type: String, default: '', trim: true },
  containerNo: { type: String, default: '', trim: true },
  sztp: { type: String, default: '', trim: true },
  ngaySc: { type: String, default: '', trim: true },
  tienHang: { type: Number, default: 0 },
  tienHungThinh: { type: Number, default: 0 },
  remark: { type: String, default: '', trim: true },
}, { _id: false })

const slScPadHistorySchema = new mongoose.Schema({
  period: { type: String, default: '', trim: true },
  count: { type: Number, default: 0 },
  totalHang: { type: Number, default: 0 },
  totalHung: { type: Number, default: 0 },
  items: { type: [historyItemSchema], default: [] },
}, { timestamps: true })

slScPadHistorySchema.index({ createdAt: -1 })

export default mongoose.model('SlScPadHistory', slScPadHistorySchema)
