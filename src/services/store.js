import {
  initialUsers,
  initialRoles,
  initialPosts,
  initialComments,
  initialCategories,
  initialTags,
  initialCorePages,
  initialChildPages,
  initialMedia,
  initialClients,
  initialRedirects,
  initialActivities,
  initialSubscribers,
} from '../seed/mockData.js'
import { isDbConnected } from '../config/db.js'
import User from '../models/User.js'
import Post from '../models/Post.js'
import Comment from '../models/Comment.js'
import Category from '../models/Category.js'
import Tag from '../models/Tag.js'
import Page from '../models/Page.js'
import Media from '../models/Media.js'
import Client from '../models/Client.js'
import Redirect from '../models/Redirect.js'
import Activity from '../models/Activity.js'
import Subscriber from '../models/Newsletter.js'
import logger from '../utils/logger.js'

class MemoryStore {
  constructor() {
    this.users = [...initialUsers]
    this.roles = [...initialRoles]
    this.posts = [...initialPosts]
    this.comments = [...initialComments]
    this.categories = [...initialCategories]
    this.tags = [...initialTags]
    this.pages = [...initialCorePages, ...initialChildPages]
    this.media = [...initialMedia]
    this.clients = [...initialClients]
    this.redirects = [...initialRedirects]
    this.activities = [...initialActivities]
    this.subscribers = [...initialSubscribers]
    this.commentNotifications = [
      {
        id: 'notif-1',
        writerEmail: 'rohan.s@deotech.com',
        commentId: 'com-1',
        authorName: 'Alex Thorne',
        postTitle: 'The Architecture of Next-Generation Edge Compute and AI Caching',
        snippet: 'Brilliant breakdown of the sub-50ms edge caching strategy...',
        timestamp: '2 hours ago',
        isRead: false,
      },
    ]
  }

  // Seed MongoDB if connected and empty
  async syncToMongoIfConnected() {
    if (!isDbConnected()) return

    try {
      const userCount = await User.countDocuments()
      if (userCount === 0) {
        logger.info('MongoDB is empty. Seeding initial data from memory store...')
        await User.insertMany(this.users)
        await Post.insertMany(this.posts)
        await Comment.insertMany(this.comments)
        await Category.insertMany(this.categories)
        await Tag.insertMany(this.tags)
        await Page.insertMany(this.pages)
        await Media.insertMany(this.media)
        await Client.insertMany(this.clients)
        await Redirect.insertMany(this.redirects)
        await Activity.insertMany(this.activities)
        await Subscriber.insertMany(this.subscribers)
        logger.info('Database seeded successfully.')
      }
    } catch (err) {
      logger.warn(`Could not seed to MongoDB: ${err.message}`)
    }
  }
}

export const store = new MemoryStore()
export default store
