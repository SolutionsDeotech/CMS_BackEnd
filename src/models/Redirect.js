import mongoose from 'mongoose'

const redirectSchema = new mongoose.Schema(
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
    sourceUrl: {
      type: String,
      required: true,
      trim: true,
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
    },
    statusCode: {
      type: Number,
      enum: [301, 302, 307, 308],
      default: 301,
    },
    hits: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
)

export const Redirect = mongoose.model('Redirect', redirectSchema)
export default Redirect
