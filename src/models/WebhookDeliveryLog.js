import mongoose from 'mongoose'

const webhookDeliveryLogSchema = new mongoose.Schema(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    postId: {
      type: String,
      default: null,
      index: true,
    },
    eventIdentity: {
      type: String,
      default: null,
    },
    targetUrl: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'delivered', 'failed'],
      default: 'pending',
      index: true,
    },
    httpStatus: {
      type: Number,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    responseBody: {
      type: String,
      default: null,
    },
    latencyMs: {
      type: Number,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    leaseToken: {
      type: String,
      default: null,
      index: true,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret.deliveryId || String(ret._id)
        delete ret.__v
        return ret
      },
    },
  }
)

// Efficient querying indexes
webhookDeliveryLogSchema.index({ clientId: 1, createdAt: -1 })
webhookDeliveryLogSchema.index({ status: 1, nextRetryAt: 1, leaseExpiresAt: 1 })
webhookDeliveryLogSchema.index({ eventIdentity: 1 })

// Retention rule: Prune ONLY completed or permanently failed deliveries after 30 days.
// Pending/processing deliveries (where completedAt is null) are NEVER deleted by TTL.
webhookDeliveryLogSchema.index(
  { completedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { completedAt: { $type: 'date' } },
  }
)

export const WebhookDeliveryLog = mongoose.model('WebhookDeliveryLog', webhookDeliveryLogSchema)
export default WebhookDeliveryLog
