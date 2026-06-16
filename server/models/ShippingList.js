import mongoose from 'mongoose'

const listItemSchema = new mongoose.Schema({
  containerNo: { type: String, required: true, trim: true, uppercase: true },
  shippingLine: { type: String, default: '', trim: true },
  size: { type: String, default: '', trim: true },
  remark: { type: String, default: '', trim: true },
  dsc: { type: String, default: '', trim: true },
  choHtxnDvs: { type: String, default: '', trim: true },
  sc: { type: String, default: '', trim: true },
  vsDvs: { type: String, default: '', trim: true },
  xuLiLai: { type: String, default: '', trim: true },
})

const shippingListSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  shippingLine: { type: String, default: '', trim: true },
  items: [listItemSchema],
  createdBy: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('ShippingList', shippingListSchema)
