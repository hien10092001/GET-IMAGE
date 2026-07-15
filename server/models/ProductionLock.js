import mongoose from 'mongoose'

const lockItemSchema = new mongoose.Schema({
  containerNo: { type: String, required: true, trim: true, uppercase: true },
  shippingLine: { type: String, required: true, trim: true },
  size: { type: String, required: true },
  bay: { type: String, trim: true },
  location: { type: String, trim: true },
  remark: { type: String, trim: true },
  source: { type: String, enum: ['depot', 'container', 'manual'], default: 'manual' },
})

const productionLockSchema = new mongoose.Schema({
  date: { type: String, required: true },
  shift: { type: String, enum: ['sáng', 'tối'], required: true },
  type: { type: String, enum: ['container', 'depot'], default: 'container' },
  items: [lockItemSchema],
  createdBy: { type: String, default: 'system' },
}, { timestamps: true })

productionLockSchema.index({ date: 1, shift: 1, type: 1 }, { unique: true })

export default mongoose.model('ProductionLock', productionLockSchema)
