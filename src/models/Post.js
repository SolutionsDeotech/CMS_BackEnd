import mongoose from 'mongoose'
import { POST_STATUS } from '../config/constants.js'

const postSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      sparse: true,
    },
    title: {
      type: String,
      required: [true, 'Please provide a post title'],
      trim: true,
      maxlength: [250, 'Title cannot exceed 250 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Please provide a slug'],
      trim: true,
      lowercase: true,
      index: true,
    },
    excerpt: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      required: [true, 'Please provide content for the post'],
      default: '',
    },
    category: {
      type: String,
      default: 'General',
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    author: {
      type: String,
      default: 'Admin',
    },
    authorRole: {
      type: String,
      default: 'Author',
    },
    authorAvatar: {
      type: String,
      default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    featuredImage: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: Object.values(POST_STATUS),
      default: POST_STATUS.DRAFT,
      index: true,
    },
    scheduledDate: {
      type: String,
      default: null,
    },
    date: {
      type: String,
      default: () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    },
    readTime: {
      type: String,
      default: '4 min read',
    },
    featured: {
      type: Boolean,
      default: false,
    },
    views: {
      type: Number,
      default: 0,
    },
    clientId: {
      type: String,
      default: 'cli-1',
      index: true,
    },
    reviewNotes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

export const Post = mongoose.model('Post', postSchema)
export default Post
