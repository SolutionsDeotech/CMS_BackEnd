import mongoose from 'mongoose'
import { MEDIA_CATEGORIES } from '../config/constants.js'

const mediaSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      index: true,
    },
    customId: {
      type: Number,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: Object.values(MEDIA_CATEGORIES),
      default: MEDIA_CATEGORIES.IMAGES,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    thumb: {
      type: String,
      default: '',
    },
    mimeType: {
      type: String,
      default: '',
    },
    size: {
      type: Number,
      default: 0,
    },
    duration: {
      type: String,
      default: null,
    },
    fileType: {
      type: String,
      default: null,
    },
    date: {
      type: String,
      default: () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    clientId: {
      type: String,
      default: 'cli-1',
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const Media = mongoose.model('Media', mediaSchema)
export default Media
