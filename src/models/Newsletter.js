import mongoose from 'mongoose'

const subscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'unsubscribed'],
      default: 'active',
    },
    source: {
      type: String,
      default: 'Blog Footer',
    },
    subscribedAt: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    clientId: {
      type: String,
      default: 'cli-1',
    },
  },
  {
    timestamps: true,
  }
)

export const Subscriber = mongoose.model('Subscriber', subscriberSchema)
export default Subscriber
