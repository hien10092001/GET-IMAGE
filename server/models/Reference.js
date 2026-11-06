import mongoose from 'mongoose'

const referenceSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true },
    type: { type: String, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
)

referenceSchema.index({ scope: 1, type: 1 }, { unique: true })

export default mongoose.model('Reference', referenceSchema)
