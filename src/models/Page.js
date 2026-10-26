import mongoose from 'mongoose'

const pageSchema = new mongoose.Schema(
  {
    customId: {
      type: Number,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Please provide page title'],
      trim: true,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    type: {
      type: String,
      default: 'Core Page',
    },
    parent: {
      type: String,
      default: '—',
      index: true,
    },
    status: {
      type: String,
      enum: ['published', 'draft', 'archived'],
      default: 'published',
    },
    showInMenu: {
      type: Boolean,
      default: true,
    },
    drillDown: {
      type: String,
      default: null,
    },
    updatedBy: {
      type: String,
      default: 'Admin',
    },
    sections: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metaTitle: String,
    metaDescription: String,
    clientId: {
      type: String,
      default: 'cli-1',
    },
  },
  {
    timestamps: true,
  }
)

export const Page = mongoose.model('Page', pageSchema)
export default Page
