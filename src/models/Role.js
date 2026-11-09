import mongoose from 'mongoose'

const roleSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Role name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    clientId: {
      type: String,
      default: 'global',
      index: true,
    },
    permission: {
      type: String,
      enum: ['Full Access', 'All Access', 'Limited Access', 'Can View Only', 'Read-Only', 'Custom'],
      default: 'Limited Access',
    },
    permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        dashboard: ['view'],
        blogPosts: ['view'],
        mediaLibrary: ['view'],
        comments: ['view'],
        pages: [],
        categories: ['view'],
        users: [],
        rolesPermissions: [],
        blogSettings: [],
        analytics: ['view'],
        seo: ['view'],
      }),
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
    isCustom: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret.customId || ret._id
        delete ret.__v
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret.customId || ret._id
        delete ret.__v
        return ret
      },
    },
  }
)

export const Role = mongoose.model('Role', roleSchema)
export default Role

