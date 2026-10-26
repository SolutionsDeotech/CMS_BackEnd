import mongoose from 'mongoose'

const activitySchema = new mongoose.Schema(
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
    type: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    actor: {
      type: String,
      default: 'Admin',
    },
    timestamp: {
      type: String,
      default: 'Just now',
    },
    icon: {
      type: String,
      default: '📄',
    },
  },
  {
    timestamps: true,
  }
)

export const Activity = mongoose.model('Activity', activitySchema)
export default Activity
