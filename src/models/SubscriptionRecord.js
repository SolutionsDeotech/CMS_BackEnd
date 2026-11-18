import mongoose from 'mongoose'

const subscriptionRecordSchema = new mongoose.Schema(
  {
    subscriberName: {
      type: String,
      required: true,
      trim: true,
    },
    subscriberEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    companyName: {
      type: String,
      default: '',
      trim: true,
    },
    planId: {
      type: String,
      required: true,
      trim: true,
    },
    planName: {
      type: String,
      required: true,
      trim: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual'],
      default: 'monthly',
    },
    currency: {
      type: String,
      enum: ['USD', 'INR'],
      default: 'USD',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'trialing', 'cancelled', 'expired'],
      default: 'active',
    },
    country: {
      type: String,
      required: true,
      trim: true,
      default: 'United States',
    },
    state: {
      type: String,
      required: true,
      trim: true,
      default: 'California',
    },
    city: {
      type: String,
      default: '',
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['credit_card', 'upi', 'net_banking', 'paypal', 'stripe', 'trial'],
      default: 'credit_card',
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    nextBillingDate: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  {
    timestamps: true,
  }
)

const SubscriptionRecord =
  mongoose.models.SubscriptionRecord ||
  mongoose.model('SubscriptionRecord', subscriptionRecordSchema)

export default SubscriptionRecord

