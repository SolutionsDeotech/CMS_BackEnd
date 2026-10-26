import mongoose from 'mongoose'

const categorySchema = new mongoose.Schema(
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
      required: [true, 'Please provide category name'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Please provide category slug'],
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '#6b0d0d',
    },
    count: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
)

export const Category = mongoose.model('Category', categorySchema)
export default Category
