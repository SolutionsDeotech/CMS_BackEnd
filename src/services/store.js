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
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const registeredUsersFile = process.env.CMS_USERS_FILE || path.join(backendRoot, 'data', 'registered-users.json')

class MemoryStore {
  constructor() {
    this.users = [...initialUsers]
    this.registeredUsers = []
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

  async loadRegisteredUsers() {
    if (isDbConnected()) return

    try {
      const contents = await readFile(registeredUsersFile, 'utf8')
      const savedUsers = JSON.parse(contents)
      if (!Array.isArray(savedUsers)) throw new Error('Registered users file must contain a JSON array.')

      this.registeredUsers = savedUsers.filter((user) => user?.email && user?.password)
      const savedEmails = new Set(this.registeredUsers.map((user) => user.email.toLowerCase()))
      this.users = this.users.filter((user) => !savedEmails.has(user.email.toLowerCase()))
      this.users.unshift(...this.registeredUsers)
      logger.info(`Loaded ${this.registeredUsers.length} registered fallback user(s).`)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Could not load registered fallback users: ${error.message}`)
        throw error
      }
    }
  }

  async addRegisteredUser(user) {
    const nextUsers = [user, ...this.registeredUsers.filter(
      (savedUser) => savedUser.email.toLowerCase() !== user.email.toLowerCase()
    )]
    await mkdir(path.dirname(registeredUsersFile), { recursive: true })
    const temporaryFile = `${registeredUsersFile}.tmp`
    await writeFile(temporaryFile, JSON.stringify(nextUsers, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporaryFile, registeredUsersFile)
    this.registeredUsers = nextUsers
    this.users = this.users.filter((existingUser) => existingUser.email.toLowerCase() !== user.email.toLowerCase())
    this.users.unshift(user)
  }

  // Seed MongoDB if connected and empty
  async syncToMongoIfConnected() {
    if (!isDbConnected()) return

    try {
      const userCount = await User.countDocuments()
      if (userCount === 0) {
        logger.info('MongoDB database is empty. Beginning initial seed...')
        const bcryptModule = await import('bcryptjs')
        const bcrypt = bcryptModule.default || bcryptModule

        // 1. Seed Users (transform string _id to customId, generate native ObjectId)
        const userMap = new Map() // customId/email -> User document
        const seededUsers = []
        for (const u of this.users) {
          const customId = u.customId || u.id || u._id
          const password = (u.password && (u.password.startsWith('$2a$') || u.password.startsWith('$2b$')))
            ? u.password
            : await bcrypt.hash(u.password || 'password123', 10)

          const userDoc = new User({
            customId,
            name: u.name,
            email: u.email ? u.email.toLowerCase() : '',
            password,
            userType: u.userType || 'Content Writer',
            role: u.role || 'Content Writer',
            permission: u.permission || 'Limited Access',
            phone: u.phone || '',
            country: u.country || 'India',
            bio: u.bio || '',
            avatar: u.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
            status: u.status || 'active',
            clientId: u.clientId || 'cli-1',
            canViewComments: Boolean(u.canViewComments),
            canReplyComments: Boolean(u.canReplyComments),
            activeSessions: Array.isArray(u.activeSessions) ? u.activeSessions : [],
          })
          seededUsers.push(userDoc)
          if (customId) userMap.set(customId, userDoc)
          if (u.email) userMap.set(u.email.toLowerCase(), userDoc)
        }
        await User.insertMany(seededUsers)
        logger.info(`Seeded ${seededUsers.length} users into MongoDB.`)

        // 2. Seed Posts (preserve customId, map authorId if available)
        const seededPosts = this.posts.map((p) => {
          const customId = p.customId || p.id
          const authorUser = userMap.get(p.authorEmail?.toLowerCase())
          return {
            customId,
            title: p.title,
            slug: p.slug,
            excerpt: p.excerpt || '',
            content: p.content || '',
            category: p.category || 'General',
            tags: Array.isArray(p.tags) ? p.tags : [],
            author: p.author || 'Admin',
            authorRole: p.authorRole || 'Author',
            authorAvatar: p.authorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
            authorId: authorUser?._id,
            featuredImage: p.featuredImage || '',
            status: p.status || 'published',
            scheduledDate: p.scheduledDate || null,
            date: p.date,
            readTime: p.readTime || '4 min read',
            featured: Boolean(p.featured),
            views: Number(p.views) || 0,
            clientId: p.clientId || 'cli-1',
            reviewNotes: p.reviewNotes || '',
          }
        })
        await Post.insertMany(seededPosts)
        logger.info(`Seeded ${seededPosts.length} posts into MongoDB.`)

        // 3. Seed Comments
        const seededComments = this.comments.map((c) => ({
          customId: c.customId || c.id,
          postId: c.postId,
          postTitle: c.postTitle || '',
          authorName: c.authorName,
          authorEmail: c.authorEmail || '',
          content: c.content,
          date: c.date || 'Just now',
          status: c.status || 'approved',
          likes: c.likes || 0,
          replies: Array.isArray(c.replies) ? c.replies.map((r) => ({
            customId: r.customId || r.id,
            authorName: r.authorName,
            authorRole: r.authorRole || 'Reader',
            isAuthor: Boolean(r.isAuthor),
            content: r.content,
            date: r.date || 'Just now',
          })) : [],
          clientId: c.clientId || 'cli-1',
        }))
        await Comment.insertMany(seededComments)
        logger.info(`Seeded ${seededComments.length} comments into MongoDB.`)

        // 4. Seed Categories
        const seededCategories = this.categories.map((cat) => ({
          customId: cat.customId || cat.id,
          clientId: cat.clientId || 'cli-1',
          name: cat.name,
          slug: cat.slug,
          description: cat.description || '',
          color: cat.color || '#6b0d0d',
          count: cat.count || 0,
          status: cat.status || 'active',
        }))
        await Category.insertMany(seededCategories)
        logger.info(`Seeded ${seededCategories.length} categories into MongoDB.`)

        // 5. Seed Tags
        const seededTags = this.tags.map((t) => ({
          customId: t.customId || t.id,
          clientId: t.clientId || 'cli-1',
          name: t.name,
          slug: t.slug,
          description: t.description || '',
          count: t.count || 0,
        }))
        await Tag.insertMany(seededTags)
        logger.info(`Seeded ${seededTags.length} tags into MongoDB.`)

        // 6. Seed Pages
        const seededPages = this.pages.map((pg) => ({
          customId: Number(pg.customId || pg.id) || 1,
          title: pg.title,
          slug: pg.slug,
          type: pg.type || 'Core Page',
          parent: pg.parent || '—',
          status: pg.status || 'published',
          showInMenu: Boolean(pg.showInMenu),
          drillDown: pg.drillDown || null,
          updatedBy: pg.updatedBy || 'Admin',
          sections: pg.sections || {},
          clientId: pg.clientId || 'cli-1',
        }))
        await Page.insertMany(seededPages)
        logger.info(`Seeded ${seededPages.length} pages into MongoDB.`)

        // 7. Seed Media
        const seededMedia = this.media.map((m) => ({
          key: m.key,
          customId: Number(m.customId || m.id) || Date.now(),
          name: m.name,
          category: m.category || 'images',
          url: m.url,
          thumb: m.thumb || '',
          mimeType: m.mimeType || 'image/jpeg',
          size: m.size || 0,
          duration: m.duration || null,
          fileType: m.fileType || null,
          date: m.date,
          clientId: m.clientId || 'cli-1',
        }))
        await Media.insertMany(seededMedia)
        logger.info(`Seeded ${seededMedia.length} media items into MongoDB.`)

        // 8. Seed Clients
        const seededClients = this.clients.map((cli) => ({
          customId: cli.customId || cli.id,
          websiteName: cli.websiteName,
          websiteUrl: cli.websiteUrl,
          industry: cli.industry || 'SaaS & Tech',
          status: cli.status || 'active',
          clientAdmin: cli.clientAdmin || {},
          stats: cli.stats || {},
          notes: cli.notes || '',
          theme: cli.theme || {},
          templates: cli.templates || [],
          themeVersions: cli.themeVersions || [],
          onboarding: cli.onboarding || {},
        }))
        await Client.insertMany(seededClients)
        logger.info(`Seeded ${seededClients.length} clients into MongoDB.`)

        // 9. Seed Redirects
        const seededRedirects = this.redirects.map((red) => ({
          customId: red.customId || red.id,
          clientId: red.clientId || 'cli-1',
          sourceUrl: red.sourceUrl,
          targetUrl: red.targetUrl,
          statusCode: red.statusCode || 301,
          hits: red.hits || 0,
          status: red.status || 'active',
        }))
        await Redirect.insertMany(seededRedirects)
        logger.info(`Seeded ${seededRedirects.length} redirects into MongoDB.`)

        // 10. Seed Activities
        const seededActivities = this.activities.map((act) => ({
          customId: act.customId || act.id,
          clientId: act.clientId || 'cli-1',
          type: act.type,
          title: act.title,
          description: act.description || '',
          actor: act.actor || 'Admin',
          timestamp: act.timestamp || 'Just now',
          icon: act.icon || '📄',
        }))
        await Activity.insertMany(seededActivities)
        logger.info(`Seeded ${seededActivities.length} activities into MongoDB.`)

        // 11. Seed Subscribers
        const seededSubscribers = this.subscribers.map((sub) => ({
          email: sub.email.toLowerCase(),
          status: sub.status || 'active',
          source: sub.source || 'Blog Footer',
          subscribedAt: sub.subscribedAt || new Date().toISOString().split('T')[0],
          clientId: sub.clientId || 'cli-1',
        }))
        await Subscriber.insertMany(seededSubscribers)
        logger.info(`Seeded ${seededSubscribers.length} subscribers into MongoDB.`)

        logger.info('====================================================')
        logger.info('  MongoDB Initial Database Seeding Completed!')
        logger.info('====================================================')
      } else {
        logger.info(`MongoDB already initialized (${userCount} users found). Skipping seeding to prevent duplicates.`)
      }
    } catch (err) {
      logger.error(`Database seeding failed: ${err.message}`)
      throw err
    }
  }
}

export const store = new MemoryStore()
export default store
