import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import store from '../services/store.js'
import { getBlogSetupSetting, saveBlogSetupSetting } from '../services/blogSetupSettings.js'
import User from '../models/User.js'
import Post from '../models/Post.js'
import Category from '../models/Category.js'
import { isDbConnected } from '../config/db.js'
import { sendWriterInvitationEmail } from '../services/emailService.js'

// In-memory configurations for Blog Home & Widgets
const defaultHomeSettings = {
  featuredPostIds: ['post-101', 'post-102'],
  postsPerPage: 6,
  showSidebar: true,
  sidebarPosition: 'right',
  activeWidgets: [
    { id: 'author_bio', name: 'Publication & Editor Bio', enabled: true, title: 'About TechHub' },
    { id: 'newsletter', name: 'Newsletter Signup Box', enabled: true, title: 'Subscribe to Newsletter' },
    { id: 'categories', name: 'Category Directory', enabled: true, title: 'Explore Categories' },
    { id: 'popular_tags', name: 'Trending Topic Tags', enabled: true, title: 'Trending Tags' },
    { id: 'recent_posts', name: 'Recent Releases', enabled: true, title: 'Latest Releases' },
    { id: 'social_follow', name: 'Social Community Links', enabled: true, title: 'Connect With Us' },
  ],
  heroLayout: 'banner',
}

const defaultCommentSettings = {
  commentsEnabled: true,
  moderationPolicy: 'all_require_approval',
  autoFlagLinks: true,
  spamFilterEnabled: true,
  minAccountAgeDays: 0,
  blockedWords: [
    'crypto',
    'viagra',
    'casino',
    'free-spins',
    'telegram-channel',
    'buy-followers',
    'whatsapp-crypto',
    'earn-quick-cash',
  ],
  blockedWordAction: 'hold',
}

const defaultNewsletterSettings = {
  enabled: true,
  heading: 'Stay Ahead of Distributed Computing & Edge AI',
  subheading:
    'Weekly architecture blueprints, performance benchmarks, and design system tokens delivered directly to your inbox.',
  buttonText: 'Subscribe Free',
  placeholderText: 'Enter your work email address...',
  privacyDisclaimer: 'Zero spam. Unsubscribe anytime in 1 click. Zero-retention privacy policy.',
  successMessage: '🎉 Thank you for subscribing! Check your inbox for the confirmation dispatch.',
  formStyle: 'card',
}

const defaultIntegrations = {
  googleAnalytics: {
    id: 'google-analytics',
    name: 'Google Analytics 4 (GA4)',
    category: 'Analytics & Traffic',
    icon: '📈',
    enabled: false,
    status: 'not_configured',
    measurementId: '',
    anonymizeIp: true,
    enhancedMeasurement: true,
    sendPageViews: true,
    lastTested: 'Never',
    description: 'Track pageviews, reader bounce rates, scroll depth, and real-time visitor geography.',
  },
  googleSearchConsole: {
    id: 'google-search-console',
    name: 'Google Search Console',
    category: 'SEO & Indexing',
    icon: '🔍',
    enabled: false,
    status: 'not_configured',
    verificationMethod: 'meta_tag',
    verificationTag: '',
    sitemapAutoSubmit: true,
    lastTested: 'Oct 18, 2026 at 14:00',
    description: 'Verify domain ownership, track organic search queries, keyword rankings, and index status.',
  },
  googleTagManager: {
    id: 'google-tag-manager',
    name: 'Google Tag Manager (GTM)',
    category: 'Tag Management',
    icon: '🏷️',
    enabled: false,
    status: 'needs_configuration',
    containerId: '',
    environment: 'production',
    lastTested: 'Never',
    description: 'Deploy third-party tags, marketing cookies, and custom conversion events without code releases.',
  },
  metaPixel: {
    id: 'meta-pixel',
    name: 'Meta Pixel (Facebook / Instagram)',
    category: 'Marketing & Retargeting',
    icon: '🎯',
    enabled: false,
    status: 'disconnected',
    pixelId: '',
    trackPageViews: true,
    conversionsApiToken: '',
    lastTested: 'Never',
    description: 'Measure ad campaign performance, build audience lookalikes, and optimize promotional campaigns.',
  },
  slack: {
    id: 'slack',
    name: 'Slack Editorial Notifications',
    category: 'Team Collaboration',
    icon: '💬',
    enabled: false,
    status: 'not_configured',
    webhookUrl: '',
    channel: '#editorial-desk',
    notifyOnNewDraft: true,
    notifyOnPendingReview: true,
    notifyOnCommentFlagged: true,
    lastTested: 'Oct 15, 2026 at 11:30',
    description: 'Receive real-time Slack notifications when articles are ready for review or comments are flagged.',
  },
}

// --- Home Settings Endpoints ---
export const getBlogHomeSettings = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const settings = await getBlogSetupSetting('home-settings', clientId, defaultHomeSettings)
  return sendSuccess(res, settings, 'Blog homepage settings retrieved')
})

export const updateBlogHomeSettings = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const current = await getBlogSetupSetting('home-settings', clientId, defaultHomeSettings)
  const settings = { ...current, ...req.body }
  await saveBlogSetupSetting('home-settings', clientId, settings)
  return sendSuccess(res, settings, 'Blog homepage settings updated')
})

// --- Comment Policies & Moderation Settings Endpoints ---
export const getCommentSettings = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const settings = await getBlogSetupSetting('comment-settings', clientId, defaultCommentSettings)
  return sendSuccess(res, settings, 'Comment policy settings retrieved')
})

export const updateCommentSettings = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const current = await getBlogSetupSetting('comment-settings', clientId, defaultCommentSettings)
  const settings = { ...current, ...req.body }
  await saveBlogSetupSetting('comment-settings', clientId, settings)
  return sendSuccess(res, settings, 'Comment policy settings updated')
})

// --- Third-Party Integrations Endpoints ---
export const getIntegrations = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const configs = await getBlogSetupSetting('integration-settings', clientId, defaultIntegrations)
  return sendSuccess(res, configs, 'Integrations configurations retrieved')
})

export const updateIntegration = asyncHandler(async (req, res, next) => {
  const { serviceKey } = req.params
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const configs = await getBlogSetupSetting('integration-settings', clientId, defaultIntegrations)

  configs[serviceKey] = { ...(configs[serviceKey] || { id: serviceKey }), ...req.body }
  await saveBlogSetupSetting('integration-settings', clientId, configs)

  return sendSuccess(res, configs[serviceKey], `${serviceKey} integration settings updated`)
})

export const testIntegrationConnection = asyncHandler(async (req, res, next) => {
  const { serviceKey } = req.params
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const configs = await getBlogSetupSetting('integration-settings', clientId, defaultIntegrations)
  const item = configs[serviceKey]

  if (!item) return next(new AppError('Integration not found', 404))

  return sendSuccess(res, {
    serviceKey,
    status: item.enabled && item.status === 'connected' ? 'connected' : 'not_configured',
    testedAt: new Date().toISOString(),
    message: item.enabled && item.status === 'connected'
      ? `${item.name || serviceKey} is configured; live provider credentials must be supplied to verify connectivity.`
      : `${item.name || serviceKey} is not connected. Configure provider credentials first.`,
  }, 'Integration configuration checked')
})

function normalizeWriter(u) {
  const item = u?.toObject ? u.toObject() : u
  const { password, ...safe } = item
  return {
    ...safe,
    id: safe.id || safe.customId || String(safe._id),
  }
}

// --- Writers & Editorial Team Endpoints ---
export const getWriters = asyncHandler(async (req, res) => {
  let { clientId } = req.query
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)

  // Tenant Isolation & Hierarchy: Non-global admins can only query their own assigned tenant
  if (user && !isGlobalAdmin) {
    clientId = user.clientId || ''
  }

  if (isDbConnected()) {
    let filter = {}
    if (isGlobalAdmin && (clientId === 'all' || !clientId)) {
      filter = {}
    } else {
      filter = clientId ? { clientId } : {}
    }
    const users = await User.find(filter).select('-password')
    return sendSuccess(res, users.map(normalizeWriter), 'Editorial writers roster retrieved')
  }

  const writers = store.users.filter((u) => {
    if (isGlobalAdmin && (clientId === 'all' || !clientId)) return true
    if (u.clientId !== clientId) return false
    return true
  })
  return sendSuccess(res, writers.map(normalizeWriter), 'Editorial writers roster retrieved')
})

export const createWriter = asyncHandler(async (req, res, next) => {
  const { name, email, role = 'Content Writer', bio = '', avatar = '', permissions = {}, clientId = '' } = req.body
  if (!name || !email) return next(new AppError('Please provide writer name and email', 400))

  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const lowerRole = String(role).toLowerCase()

  // Prevent role escalation: Client Admin cannot create Admin/SuperAdmin accounts
  if (!isGlobalAdmin && (lowerRole.includes('admin') || lowerRole.includes('superadmin') || lowerRole.includes('owneradmin'))) {
    return next(new AppError('Creation of secondary Admin accounts is prohibited. The CMS permits only a single Admin account.', 403))
  }

  const writerRole = role || 'Content Writer'
  const tempPassword = req.body.password || `Temp@${Math.random().toString(36).slice(-6)}!9`

  // Scope tenant ID strictly
  const targetClient = (!isGlobalAdmin && user?.clientId) ? user.clientId : (clientId || user?.clientId || '')

  const writerData = {
    name,
    email: email.toLowerCase(),
    role: writerRole,
    userType: writerRole,
    bio,
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    status: 'active',
    clientId: targetClient,
    permissions: permissions || {},
    canViewComments: req.body.canViewComments ?? true,
    canReplyComments: req.body.canReplyComments ?? true,
    socialLinks: req.body.socialLinks || {},
    assignedArticles: 0,
    joinedDate: new Date().toISOString().split('T')[0],
    mustChangePassword: true,
    createdBy: user?._id || null,
    createdByEmail: user?.email?.toLowerCase() || '',
  }

  if (isDbConnected()) {
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) return next(new AppError('A user with that email already exists', 400))
    const created = await User.create({
      ...writerData,
      password: tempPassword,
      permission: 'Limited Access',
    })

    sendWriterInvitationEmail({
      email: writerData.email,
      websiteName: 'Deotech CMS Publication',
      role: writerRole,
      temporaryPassword: tempPassword,
    }).then((res) => {
      if (!res.success) console.error('[Email Error] Writer invite delivery failed:', res.error)
    }).catch((err) => console.error('Failed to send writer invite email:', err))

    return sendSuccess(res, normalizeWriter(created), 'Writer profile created successfully', 201)
  }

  const newWriter = {
    _id: `usr-${Date.now()}`,
    id: `wri-${Date.now()}`,
    ...writerData,
    password: tempPassword,
  }

  store.users.push(newWriter)

  sendWriterInvitationEmail({
    email: writerData.email,
    websiteName: 'Deotech CMS Publication',
    role,
    temporaryPassword: tempPassword,
  }).then((res) => {
    if (!res.success) console.error('[Email Error] Writer invite delivery failed:', res.error)
  }).catch((err) => console.error('Failed to send writer invite email:', err))

  return sendSuccess(res, newWriter, 'Writer profile created successfully', 201)
})

export const updateWriter = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const currentUser = req.user
  const isGlobalAdmin = Boolean(currentUser?.isPrimaryAdmin)

  // Do not allow non-global admin to escalate to Admin
  if (req.body.role && !isGlobalAdmin) {
    const lowerRole = String(req.body.role).toLowerCase()
    if (lowerRole.includes('admin') || lowerRole.includes('superadmin') || lowerRole.includes('owneradmin')) {
      return next(new AppError('Modifying user role to Admin is prohibited.', 403))
    }
  }

  if (isDbConnected()) {
    const query = [{ email: id.toLowerCase() }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const target = await User.findOne({ $or: query })

    if (!target) return next(new AppError('Writer profile not found', 404))

    // Protection: Last active Super Admin cannot be deactivated
    if (target.isPrimaryAdmin && req.body.status === 'deactivated') {
      const activeSuperCount = await User.countDocuments({ isPrimaryAdmin: true, status: 'active' })
      if (activeSuperCount <= 1) {
        return next(new AppError('The last active Super Admin account cannot be deactivated.', 403))
      }
    }

    if (target.isPrimaryAdmin && !isGlobalAdmin) {
      return next(new AppError('The primary Admin account cannot be modified by other users.', 403))
    }

    // Tenant Isolation: Non-global admins can only manage users in their own tenant
    if (!isGlobalAdmin) {
      const isSameClient = target.clientId === currentUser?.clientId
      const isTargetAdmin = target.userType === 'Admin' || target.role === 'Admin' || target.role === 'OwnerAdmin'

      if (isTargetAdmin) {
        return next(new AppError('Client Admin cannot manage or modify another Admin.', 403))
      }
      if (!isSameClient) {
        return next(new AppError('Tenant Isolation: You cannot modify users belonging to another tenant.', 403))
      }
    }

    const updates = { ...req.body }
    delete updates.userType

    // Allow password reset
    if (updates.newPassword) {
      const salt = await bcrypt.genSalt(10)
      updates.password = await bcrypt.hash(updates.newPassword, salt)
      delete updates.newPassword
    } else {
      delete updates.password
    }

    const updated = await User.findOneAndUpdate({ _id: target._id }, updates, { new: true, runValidators: true }).select('-password')
    return sendSuccess(res, normalizeWriter(updated), 'User profile updated successfully')
  }

  const writer = store.users.find((u) => u._id === id || u.id === id || u.email?.toLowerCase() === id.toLowerCase())
  if (!writer) return next(new AppError('Writer profile not found', 404))
  if (writer.isPrimaryAdmin && !isGlobalAdmin) {
    return next(new AppError('The primary Admin account cannot be modified via writer management.', 403))
  }

  if (!isGlobalAdmin && writer.clientId !== currentUser?.clientId) {
    return next(new AppError('Tenant Isolation: You cannot modify users belonging to another tenant.', 403))
  }

  Object.assign(writer, req.body)
  return sendSuccess(res, writer, 'User profile updated successfully')
})

export const deleteWriter = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const currentUser = req.user
  const isGlobalAdmin = Boolean(currentUser?.isPrimaryAdmin)

  let target = null
  if (isDbConnected()) {
    const query = [{ email: id.toLowerCase() }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    target = await User.findOne({ $or: query })
  } else {
    target = store.users.find((u) => u._id === id || u.id === id || u.email?.toLowerCase() === id.toLowerCase())
  }

  if (!target) return next(new AppError('User profile not found', 404))

  // Rule 1: Super Admin cannot delete their own account
  if (target.isPrimaryAdmin && currentUser && String(currentUser._id || currentUser.id) === String(target._id || target.id)) {
    return next(new AppError('Super Admin cannot delete their own primary account.', 403))
  }

  // Rule 2: Protect the last active Super Admin account from deletion
  if (target.isPrimaryAdmin) {
    if (isDbConnected()) {
      const superCount = await User.countDocuments({ isPrimaryAdmin: true })
      if (superCount <= 1) {
        return next(new AppError('The last Super Admin account is protected and cannot be deleted.', 403))
      }
    } else {
      return next(new AppError('Super Admin account is protected and cannot be deleted.', 403))
    }
  }

  // Rule 3: Tenant Admin cannot delete their own account
  if (currentUser && String(currentUser._id || currentUser.id) === String(target._id || target.id)) {
    return next(new AppError('You cannot delete your own account.', 403))
  }

  // Rule 4: Tenant Admin cannot delete another Tenant Admin / Admin (Only Super Admin can delete Tenant Admins)
  const isTargetAdmin = target.isPrimaryAdmin || target.userType === 'Admin' || target.role === 'Admin' || target.role === 'OwnerAdmin' || target.role === 'Client Admin'
  if (isTargetAdmin && !isGlobalAdmin) {
    return next(new AppError('Tenant Admins cannot delete other Tenant Admins or Super Admin. Only Super Admin can perform this action.', 403))
  }

  // Rule 5: Tenant Admin can only delete users belonging to their own assigned tenant
  if (!isGlobalAdmin && currentUser?.clientId && target.clientId !== currentUser.clientId) {
    return next(new AppError('Tenant Isolation: You cannot delete users belonging to another tenant.', 403))
  }

  if (isDbConnected()) {
    await User.findByIdAndDelete(target._id)
    return sendSuccess(res, null, 'User profile removed successfully')
  }

  store.users = store.users.filter((u) => String(u._id) !== String(target._id) && u.email?.toLowerCase() !== target.email?.toLowerCase())
  return sendSuccess(res, null, 'User profile removed successfully')
})

// --- Newsletter Signup Form Settings ---
export const getNewsletterSettings = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const settings = await getBlogSetupSetting('newsletter-settings', clientId, defaultNewsletterSettings)
  return sendSuccess(res, settings, 'Newsletter signup settings retrieved')
})

export const updateNewsletterSettings = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const current = await getBlogSetupSetting('newsletter-settings', clientId, defaultNewsletterSettings)
  const settings = { ...current, ...req.body }
  await saveBlogSetupSetting('newsletter-settings', clientId, settings)
  return sendSuccess(res, settings, 'Newsletter signup settings updated')
})

// --- Editorial Team (invites, roles, comment permissions) ---
export const getTeamMembers = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  return sendSuccess(res, members, 'Editorial team roster retrieved')
})

export const inviteTeamMember = asyncHandler(async (req, res, next) => {
  const {
    name,
    email,
    role = 'Content Writer',
    canViewComments = false,
    canReplyComments = false,
    clientId = (req.query?.clientId || req.user?.clientId || 'global'),
  } = req.body
  if (!name || !email) return next(new AppError('Please provide team member name and email', 400))

  // Requirement 3 & 4: Only non-admin roles can be invited
  const lowerRole = String(role).toLowerCase()
  if (lowerRole.includes('admin') || lowerRole.includes('superadmin') || lowerRole.includes('owneradmin')) {
    return next(new AppError('Creation of secondary Admin accounts is prohibited. The CMS permits only a single Admin account.', 403))
  }

  const members = await getBlogSetupSetting('team-members', clientId, [])
  if (members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    return next(new AppError('A team member with this email already exists', 409))
  }

  const user = req.user
  const tempPassword = `Temp@${Math.random().toString(36).slice(-6)}!9`

  const newMember = {
    id: `wri-${Date.now()}`,
    clientId,
    name,
    email,
    role,
    roleLabel: role,
    bio: '',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    accountStatus: 'pending_invite',
    invitationStatus: 'sent',
    invitationSentDate: new Date().toISOString().replace('T', ' ').substring(0, 16),
    invitationExpiresIn: '7 days',
    assignedArticles: 0,
    canViewComments,
    canReplyComments,
    joinedDate: 'Pending',
    lastActive: 'Never',
    createdBy: user?._id || null,
    createdByEmail: user?.email?.toLowerCase() || '',
  }

  // Provision User in database with mustChangePassword: true
  if (isDbConnected()) {
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (!existing) {
      await User.create({
        name,
        email: email.toLowerCase(),
        password: tempPassword,
        role,
        userType: role,
        permission: 'Limited Access',
        clientId,
        status: 'active',
        mustChangePassword: true,
        createdBy: user?._id || null,
        createdByEmail: user?.email?.toLowerCase() || '',
      })
    }
  } else {
    const existing = store.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (!existing) {
      store.users.push({
        _id: `usr-${Date.now()}`,
        id: `usr-${Date.now()}`,
        name,
        email: email.toLowerCase(),
        password: tempPassword,
        role,
        userType: role,
        permission: 'Limited Access',
        clientId,
        status: 'active',
        mustChangePassword: true,
        createdBy: user?._id || null,
        createdByEmail: user?.email?.toLowerCase() || '',
      })
    }
  }

  // Requirement B.3: Send invitation email with temporary password
  sendWriterInvitationEmail({
    email,
    websiteName: 'Deotech CMS Publication',
    role,
    temporaryPassword: tempPassword,
  }).then((res) => {
    if (!res.success) console.error('[Email Error] Team member invite delivery failed:', res.error)
  }).catch((err) => console.error('Failed to send team invitation email:', err))

  members.unshift(newMember)
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, newMember, 'Team invitation dispatched successfully', 201)
})

export const updateTeamMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const member = members.find((m) => m.id === id)
  if (!member) return next(new AppError('Team member not found', 404))

  if (req.body.role) {
    const lowerRole = String(req.body.role).toLowerCase()
    if (lowerRole.includes('admin') || lowerRole.includes('superadmin') || lowerRole.includes('owneradmin')) {
      return next(new AppError('Creation of secondary Admin accounts is prohibited. The CMS permits only a single Admin account.', 403))
    }
    member.roleLabel = req.body.role
  }

  delete req.body.role
  Object.assign(member, req.body)
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, member, 'Team member profile updated successfully')
})

export const deleteTeamMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const idx = members.findIndex((m) => m.id === id)
  if (idx === -1) return next(new AppError('Team member not found', 404))

  members.splice(idx, 1)
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, null, 'Team member removed successfully')
})

export const resendTeamInvite = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const member = members.find((m) => m.id === id)
  if (!member) return next(new AppError('Team member not found', 404))

  member.invitationSentDate = new Date().toISOString().replace('T', ' ').substring(0, 16)
  member.invitationExpiresIn = '7 days'
  member.invitationStatus = 'sent'

  // Dispatch invitation email
  sendWriterInvitationEmail({
    email: member.email,
    websiteName: 'Deotech CMS Publication',
    role: member.role || member.roleLabel || 'Content Writer',
  }).catch((err) => console.error('Failed to resend team invitation email:', err))

  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, member, 'Invitation link refreshed and dispatched')
})

export const updateTeamMemberPermissions = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const member = members.find((m) => m.id === id)
  if (!member) return next(new AppError('Team member not found', 404))

  const { canViewComments, canReplyComments } = req.body
  if (canViewComments !== undefined) member.canViewComments = canViewComments
  if (canReplyComments !== undefined) member.canReplyComments = canReplyComments
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, member, 'Comment permissions updated successfully')
})

// --- Content library utilities used by the Blog Setup import/export screen ---
export const importPosts = asyncHandler(async (req, res, next) => {
  const { posts, clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.body
  if (!Array.isArray(posts) || posts.length === 0) {
    return next(new AppError('Please provide at least one post to import', 400))
  }

  const importedAt = new Date().toISOString()
  const importedPosts = posts.map((post, index) => {
    const customId = post.id || post.customId || `imp-${Date.now()}-${index + 1}`
    return {
      ...post,
      customId,
      clientId,
      status: post.status || 'draft',
      importedAt,
      updatedAt: post.updatedAt || importedAt,
    }
  })

  if (isDbConnected()) {
    const inserted = await Post.insertMany(importedPosts)
    return sendSuccess(res, {
      importedCount: inserted.length,
      posts: inserted,
    }, `${inserted.length} post(s) imported successfully`, 201)
  }

  store.posts.unshift(...importedPosts)
  return sendSuccess(res, {
    importedCount: importedPosts.length,
    posts: importedPosts,
  }, `${importedPosts.length} post(s) imported successfully`, 201)
})

export const exportPosts = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global'), scope = 'all', includeMetadata = 'true' } = req.query
  const allowedStatuses = scope === 'published'
    ? ['published']
    : scope === 'drafts'
      ? ['draft', 'pending_review']
      : null

  if (isDbConnected()) {
    const filter = { clientId, status: { $ne: 'trash' } }
    if (allowedStatuses) filter.status = { $in: allowedStatuses }

    const posts = await Post.find(filter).sort({ createdAt: -1 })
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      scope,
      count: posts.length,
      posts,
    }

    if (includeMetadata !== 'false') {
      const [categories, writers] = await Promise.all([
        Category.find({ clientId }),
        User.find({ clientId }).select('-password'),
      ])
      payload.metadata = { clientId, categories, writers }
    }

    return sendSuccess(res, payload, 'Posts export prepared successfully')
  }

  const posts = store.posts.filter((post) => {
    if (post.clientId && post.clientId !== clientId) return false
    if (post.status === 'trash') return false
    return !allowedStatuses || allowedStatuses.includes(post.status)
  })

  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    scope,
    count: posts.length,
    posts,
  }
  if (includeMetadata !== 'false') {
    payload.metadata = {
      clientId,
      categories: store.categories.filter((item) => !item.clientId || item.clientId === clientId),
      writers: store.users.filter((item) => !item.clientId || item.clientId === clientId)
        .map(({ password, ...writer }) => writer),
    }
  }

  return sendSuccess(res, payload, 'Posts export prepared successfully')
})

export const emptyPostTrash = asyncHandler(async (req, res) => {
  const { clientId = (req.query?.clientId || req.user?.clientId || 'global') } = req.query

  if (isDbConnected()) {
    const result = await Post.deleteMany({ status: 'trash', clientId })
    const deletedCount = result.deletedCount || 0
    return sendSuccess(res, { deletedCount }, `${deletedCount} trashed post(s) permanently deleted`)
  }

  const before = store.posts.length
  store.posts = store.posts.filter((post) => !(post.status === 'trash' && (!post.clientId || post.clientId === clientId)))
  const deletedCount = before - store.posts.length
  return sendSuccess(res, { deletedCount }, `${deletedCount} trashed post(s) permanently deleted`)
})
