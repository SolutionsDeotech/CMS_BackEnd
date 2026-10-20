import mongoose from 'mongoose'
import { COMMENT_STATUS } from '../config/constants.js'

const replySchema = new mongoose.Schema({
  customId: { type: String },
  authorName: { type: String, required: true },
  authorRole: { type: String, default: 'Reader' },
  isAuthor: { type: Boolean, default: false },
  content: { type: String, required: true },
  date: { type: String, default: 'Just now' },
  createdAt: { type: Date, default: Date.now },
})

const commentSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      sparse: true,
    },
    postId: {
      type: String,
      required: true,
      index: true,
    },
    postTitle: {
      type: String,
      default: '',
    },
    authorName: {
      type: String,
      required: [true, 'Please provide an author name'],
      trim: true,
    },
    authorEmail: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      required: [true, 'Please provide comment text'],
    },
    date: {
      type: String,
      default: 'Just now',
    },
    status: {
      type: String,
      enum: Object.values(COMMENT_STATUS),
      default: COMMENT_STATUS.APPROVED,
      index: true,
    },
    likes: {
      type: Number,
      default: 0,
    },
    replies: [replySchema],
    clientId: {
      type: String,
      default: 'cli-1',
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const Comment = mongoose.model('Comment', commentSchema)
export default Comment
