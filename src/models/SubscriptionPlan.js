import mongoose from 'mongoose'

const subscriptionPlanSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    tagline: {
      type: String,
      default: '',
    },
    monthlyPriceUSD: {
      type: Number,
      required: true,
      min: 0,
      default: 19,
    },
    annualPriceUSD: {
      type: Number,
      required: true,
      min: 0,
      default: 15,
    },
    monthlyPriceINR: {
      type: Number,
      required: true,
      min: 0,
      default: 1499,
    },
    annualPriceINR: {
      type: Number,
      required: true,
      min: 0,
      default: 1199,
    },
    badge: {
      type: String,
      default: '',
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    buttonText: {
      type: String,
      default: 'Start Free Trial',
    },
    features: [
      {
        type: String,
        trim: true,
      },
    ],
    missingFeatures: [
      {
        type: String,
        trim: true,
      },
    ],
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
)

const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model('SubscriptionPlan', subscriptionPlanSchema)

export default SubscriptionPlan

