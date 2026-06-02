import mongoose from 'mongoose'

const containerSchema = new mongoose.Schema({
  containerNo: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  shippingLine: {
    type: String,
    required: true,
    trim: true,
  },
  size: {
    type: String,
    required: true,
  },
  containerType: {
    type: String,
    default: '',
  },
  liftOn: {
    type: Boolean,
    default: false,
  },
  liftOff: {
    type: Boolean,
    default: false,
  },
  shiftMove: {
    type: Boolean,
    default: false,
  },
  repairStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  bay: {
    type: String,
    trim: true,
  },
  location: {
    type: String,
    trim: true,
  },
  remark: {
    type: String,
    trim: true,
  },
  locked: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: String,
    default: 'system',
  },
}, { timestamps: true })

containerSchema.index({ shippingLine: 1 })
containerSchema.index({ createdAt: -1 })

export default mongoose.model('Container', containerSchema)
