import mongoose from 'mongoose'

const blogSetupSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    clientId: { type: String, default: 'global' },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

blogSetupSettingSchema.index({ key: 1, clientId: 1 }, { unique: true })

export const BlogSetupSetting = mongoose.model('BlogSetupSetting', blogSetupSettingSchema)
export default BlogSetupSetting
