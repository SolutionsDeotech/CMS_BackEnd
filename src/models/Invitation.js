import mongoose from 'mongoose'

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
    },
    role: {
      type: String,
      required: true,
      default: 'Content Writer',
    },
    clientId: {
      type: String,
      default: 'global',
      index: true,
    },
    websiteId: {
      type: String,
      default: '',
    },
    websiteName: {
      type: String,
      default: 'Deotech CMS Publication',
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    temporaryPassword: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'revoked'],
      default: 'pending',
      index: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    invitedByEmail: {
      type: String,
      default: '',
    },
    invitedByName: {
      type: String,
      default: '',
    },
    canViewComments: {
      type: Boolean,
      default: false,
    },
    canReplyComments: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    deliveryStatus: {
      type: String,
      enum: ['delivered', 'failed', 'sandbox', 'pending'],
      default: 'pending',
    },
    deliveryError: {
      type: String,
      default: '',
    },
    messageId: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

export const Invitation = mongoose.model('Invitation', invitationSchema)
export default Invitation

