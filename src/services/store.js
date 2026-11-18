import { isDbConnected } from '../config/db.js'
import User from '../models/User.js'
import LandingPageConfig from '../models/LandingPageConfig.js'
import SubscriptionPlan from '../models/SubscriptionPlan.js'
import {
  defaultLandingPageConfig,
  defaultSubscriptionPlans,
} from '../data/landingPageDefaults.js'
import logger from '../utils/logger.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const registeredUsersFile = process.env.CMS_USERS_FILE || path.join(backendRoot, 'data', 'registered-users.json')

class MemoryStore {
  constructor() {
    this.reset()
  }

  reset() {
    // Strict Enterprise Policy: Never seed or use fictional/sample business fixture data.
    // In all runtime environments (development, staging, test, and production),
    // all business record collections initialize completely clean and empty.
    this.users = []
    this.registeredUsers = []
    this.roles = []
    this.posts = []
    this.comments = []
    this.categories = []
    this.tags = []
    this.pages = []
    this.media = []
    this.clients = []
    this.redirects = []
    this.activities = []
    this.subscribers = []
    this.invitations = []
    this.emailLogs = []
    this.commentNotifications = []
    this.webhookDeliveries = []
    this.landingPageConfig = JSON.parse(JSON.stringify(defaultLandingPageConfig))
    this.subscriptionPlans = JSON.parse(JSON.stringify(defaultSubscriptionPlans))
    this.subscriptionRecords = []
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

  // Synchronize database state and bootstrap legitimate system configuration
  async syncToMongoIfConnected() {
    if (!isDbConnected()) return

    // Strict Enterprise Policy: Sample business data seeding is permanently disabled.
    // Even when ALLOW_SAMPLE_SEED=true is provided, no fake records are inserted.
    if (process.env.ALLOW_SAMPLE_SEED === 'true') {
      logger.info('Enterprise Policy: Sample business data seeding is permanently disabled. Using real database records only.')
    }

    try {
      // Bootstrap SuperAdmin from environment configuration if configured
      await this.bootstrapSuperAdmin()

      // Ensure legitimate landing page and subscription plans configuration exist
      await this.ensureLandingAndSubscriptionsInMongo()
    } catch (err) {
      logger.error(`Database synchronization failed: ${err.message}`)
      throw err
    }
  }

  // SuperAdmin bootstrap through environment configuration
  async bootstrapSuperAdmin() {
    const adminEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase()
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD
    const adminName = process.env.SUPER_ADMIN_NAME || process.env.ADMIN_NAME || 'Super Admin'
    const adminPhone = process.env.SUPER_ADMIN_PHONE || ''

    if (!adminEmail || !adminPassword) {
      return
    }

    const bcryptModule = await import('bcryptjs')
    const bcrypt = bcryptModule.default || bcryptModule

    if (isDbConnected()) {
      try {
        let existing = await User.findOne({ email: adminEmail }).select('+password')
        if (!existing) {
          const hashedPassword = await bcrypt.hash(adminPassword, 10)
          existing = await User.create({
            name: adminName,
            email: adminEmail,
            password: hashedPassword,
            userType: 'Admin',
            role: 'Admin',
            isPrimaryAdmin: true,
            permission: 'Full Access',
            status: 'active',
            phone: adminPhone,
            canViewComments: true,
            canReplyComments: true,
          })
          logger.info(`Bootstrapped SuperAdmin account (${adminEmail}) in MongoDB.`)
        } else if (!existing.isPrimaryAdmin) {
          existing.isPrimaryAdmin = true
          if (existing.role !== 'Admin') existing.role = 'Admin'
          if (existing.userType !== 'Admin') existing.userType = 'Admin'
          await existing.save()
          logger.info(`Configured user (${adminEmail}) as primary SuperAdmin in MongoDB.`)
        }
      } catch (err) {
        logger.error(`SuperAdmin MongoDB bootstrap failed: ${err.message}`)
      }
    } else {
      // Memory Store fallback
      let user = this.users.find((u) => u.email?.toLowerCase() === adminEmail)
      if (!user) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10)
        user = {
          _id: `usr-superadmin-${Date.now()}`,
          name: adminName,
          email: adminEmail,
          password: hashedPassword,
          userType: 'Admin',
          role: 'Admin',
          isPrimaryAdmin: true,
          permission: 'Full Access',
          status: 'active',
          phone: adminPhone,
          canViewComments: true,
          canReplyComments: true,
          activeSessions: [],
        }
        this.users.unshift(user)
        logger.info(`Bootstrapped SuperAdmin account (${adminEmail}) in memory store.`)
      } else {
        user.isPrimaryAdmin = true
        user.role = 'Admin'
        user.userType = 'Admin'
      }
    }
  }

  async ensureLandingAndSubscriptionsInMongo() {
    if (!isDbConnected()) return
    try {
      const landingDoc = await LandingPageConfig.findOne({ key: 'main_landing_page' })
      if (!landingDoc) {
        await LandingPageConfig.create(defaultLandingPageConfig)
        logger.info('Initialized default LandingPageConfig in MongoDB.')
      }

      const planCount = await SubscriptionPlan.countDocuments()
      if (planCount === 0) {
        await SubscriptionPlan.insertMany(defaultSubscriptionPlans)
        logger.info(`Initialized ${defaultSubscriptionPlans.length} default SubscriptionPlans in MongoDB.`)
      }
    } catch (err) {
      logger.warn(`Non-blocking landing/subscription check: ${err.message}`)
    }
  }
}

export const store = new MemoryStore()
export default store
