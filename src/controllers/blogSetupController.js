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
  const { clientId = 'cli-1' } = req.query
  const settings = await getBlogSetupSetting('home-settings', clientId, defaultHomeSettings)
  return sendSuccess(res, settings, 'Blog homepage settings retrieved')
})

export const updateBlogHomeSettings = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const current = await getBlogSetupSetting('home-settings', clientId, defaultHomeSettings)
  const settings = { ...current, ...req.body }
  await saveBlogSetupSetting('home-settings', clientId, settings)
  return sendSuccess(res, settings, 'Blog homepage settings updated')
})

// --- Comment Policies & Moderation Settings Endpoints ---
export const getCommentSettings = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const settings = await getBlogSetupSetting('comment-settings', clientId, defaultCommentSettings)
  return sendSuccess(res, settings, 'Comment policy settings retrieved')
})

export const updateCommentSettings = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const current = await getBlogSetupSetting('comment-settings', clientId, defaultCommentSettings)
  const settings = { ...current, ...req.body }
  await saveBlogSetupSetting('comment-settings', clientId, settings)
  return sendSuccess(res, settings, 'Comment policy settings updated')
})

// --- Third-Party Integrations Endpoints ---
export const getIntegrations = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const configs = await getBlogSetupSetting('integration-settings', clientId, defaultIntegrations)
  return sendSuccess(res, configs, 'Integrations configurations retrieved')
})

export const updateIntegration = asyncHandler(async (req, res, next) => {
  const { serviceKey } = req.params
  const { clientId = 'cli-1' } = req.query
  const configs = await getBlogSetupSetting('integration-settings', clientId, defaultIntegrations)

  configs[serviceKey] = { ...(configs[serviceKey] || { id: serviceKey }), ...req.body }
  await saveBlogSetupSetting('integration-settings', clientId, configs)

  return sendSuccess(res, configs[serviceKey], `${serviceKey} integration settings updated`)
})

export const testIntegrationConnection = asyncHandler(async (req, res, next) => {
  const { serviceKey } = req.params
  const { clientId = 'cli-1' } = req.query
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
  const { clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = clientId ? { clientId } : {}
    const users = await User.find(filter).select('-password')
    return sendSuccess(res, users.map(normalizeWriter), 'Editorial writers roster retrieved')
  }

  const writers = store.users.filter((u) => !clientId || u.clientId === clientId)
  return sendSuccess(res, writers.map(normalizeWriter), 'Editorial writers roster retrieved')
})

export const createWriter = asyncHandler(async (req, res, next) => {
  const { name, email, role = 'Content Writer', bio = '', avatar = '', clientId = 'cli-1' } = req.body
  if (!name || !email) return next(new AppError('Please provide writer name and email', 400))

  const writerData = {
    name,
    email: email.toLowerCase(),
    role,
    userType: role,
    bio,
    avatar: avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    status: 'active',
    clientId,
    canViewComments: req.body.canViewComments ?? true,
    canReplyComments: req.body.canReplyComments ?? true,
    socialLinks: req.body.socialLinks || {},
    assignedArticles: 0,
    joinedDate: new Date().toISOString().split('T')[0],
  }

  if (isDbConnected()) {
    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) return next(new AppError('A user with that email already exists', 400))
    const created = await User.create({
      ...writerData,
      password: 'TemporaryPassword123!',
      permission: role === 'Admin' ? 'Full Access' : 'Limited Access',
    })

    // Send invitation email with temporary credentials
    sendWriterInvitationEmail({
      email: writerData.email,
      websiteName: 'Deotech CMS Publication',
      role,
      temporaryPassword: 'TemporaryPassword123!',
    }).catch((err) => console.error('Failed to send writer invite email:', err))

    return sendSuccess(res, normalizeWriter(created), 'Writer profile created successfully', 201)
  }

  const newWriter = {
    _id: `usr-${Date.now()}`,
    id: `wri-${Date.now()}`,
    ...writerData,
  }

  store.users.push(newWriter)

  // Send invitation email with temporary credentials
  sendWriterInvitationEmail({
    email: writerData.email,
    websiteName: 'Deotech CMS Publication',
    role,
    temporaryPassword: 'TemporaryPassword123!',
  }).catch((err) => console.error('Failed to send writer invite email:', err))

  return sendSuccess(res, newWriter, 'Writer profile created successfully', 201)
})

export const updateWriter = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ email: id.toLowerCase() }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const updated = await User.findOneAndUpdate({ $or: query }, req.body, { new: true, runValidators: true }).select('-password')
    if (!updated) return next(new AppError('Writer profile not found', 404))
    return sendSuccess(res, normalizeWriter(updated), 'Writer profile updated successfully')
  }

  const writer = store.users.find((u) => u._id === id || u.id === id)
  if (!writer) return next(new AppError('Writer profile not found', 404))

  Object.assign(writer, req.body)
  return sendSuccess(res, writer, 'Writer profile updated successfully')
})

export const deleteWriter = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ email: id.toLowerCase() }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await User.findOneAndDelete({ $or: query })
    if (!deleted) return next(new AppError('Writer profile not found', 404))
    return sendSuccess(res, null, 'Writer profile removed successfully')
  }

  store.users = store.users.filter((u) => u._id !== id && u.id !== id)
  return sendSuccess(res, null, 'Writer profile removed successfully')
})

// --- Newsletter Signup Form Settings ---
export const getNewsletterSettings = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const settings = await getBlogSetupSetting('newsletter-settings', clientId, defaultNewsletterSettings)
  return sendSuccess(res, settings, 'Newsletter signup settings retrieved')
})

export const updateNewsletterSettings = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const current = await getBlogSetupSetting('newsletter-settings', clientId, defaultNewsletterSettings)
  const settings = { ...current, ...req.body }
  await saveBlogSetupSetting('newsletter-settings', clientId, settings)
  return sendSuccess(res, settings, 'Newsletter signup settings updated')
})

// --- Editorial Team (invites, roles, comment permissions) ---
export const getTeamMembers = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
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
    clientId = 'cli-1',
  } = req.body
  if (!name || !email) return next(new AppError('Please provide team member name and email', 400))

  const members = await getBlogSetupSetting('team-members', clientId, [])
  if (members.some((m) => m.email.toLowerCase() === email.toLowerCase())) {
    return next(new AppError('A team member with this email already exists', 409))
  }

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
  }

  members.unshift(newMember)
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, newMember, 'Team invitation dispatched successfully', 201)
})

export const updateTeamMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = 'cli-1' } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const member = members.find((m) => m.id === id)
  if (!member) return next(new AppError('Team member not found', 404))

  Object.assign(member, req.body)
  if (req.body.role) member.roleLabel = req.body.role
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, member, 'Team member profile updated successfully')
})

export const deleteTeamMember = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = 'cli-1' } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const idx = members.findIndex((m) => m.id === id)
  if (idx === -1) return next(new AppError('Team member not found', 404))

  members.splice(idx, 1)
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, null, 'Team member removed successfully')
})

export const resendTeamInvite = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = 'cli-1' } = req.query
  const members = await getBlogSetupSetting('team-members', clientId, [])
  const member = members.find((m) => m.id === id)
  if (!member) return next(new AppError('Team member not found', 404))

  member.invitationSentDate = new Date().toISOString().replace('T', ' ').substring(0, 16)
  member.invitationExpiresIn = '7 days'
  member.invitationStatus = 'sent'
  await saveBlogSetupSetting('team-members', clientId, members)
  return sendSuccess(res, member, 'Invitation link refreshed and dispatched')
})

export const updateTeamMemberPermissions = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { clientId = 'cli-1' } = req.query
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
  const { posts, clientId = 'cli-1' } = req.body
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
  const { clientId = 'cli-1', scope = 'all', includeMetadata = 'true' } = req.query
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
  const { clientId = 'cli-1' } = req.query

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
