import mongoose from 'mongoose'

const tagSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      sparse: true,
    },
    clientId: {
      type: String,
      default: 'cli-1',
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide tag name'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Please provide tag slug'],
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

export const Tag = mongoose.model('Tag', tagSchema)
export default Tag
