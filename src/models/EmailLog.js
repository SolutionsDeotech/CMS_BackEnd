import mongoose from 'mongoose'

const emailLogSchema = new mongoose.Schema(
  {
    recipient: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    emailType: {
      type: String,
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['sent', 'failed'],
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: 'brevo',
    },
    messageId: {
      type: String,
      default: '',
    },
    error: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
)

export const EmailLog = mongoose.model('EmailLog', emailLogSchema)
export default EmailLog

