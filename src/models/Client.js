import mongoose from 'mongoose'

const clientSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      index: true,
    },
    websiteName: {
      type: String,
      required: [true, 'Please provide website name'],
      trim: true,
    },
    websiteUrl: {
      type: String,
      required: [true, 'Please provide website URL'],
      trim: true,
    },
    industry: {
      type: String,
      default: 'SaaS & Tech',
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'inactive'],
      default: 'active',
    },
    clientAdmin: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      role: { type: String, default: 'Client Admin' },
    },
    stats: {
      totalPosts: { type: Number, default: 0 },
      writersCount: { type: Number, default: 0 },
      monthlyViews: { type: String, default: '0' },
    },
    notes: {
      type: String,
      default: '',
    },
    theme: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    templates: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    onboarding: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
)

export const Client = mongoose.model('Client', clientSchema)
export default Client
