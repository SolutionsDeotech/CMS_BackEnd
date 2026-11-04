import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import store from '../services/store.js'
import Post from '../models/Post.js'
import Redirect from '../models/Redirect.js'
import Subscriber from '../models/Newsletter.js'
import Activity from '../models/Activity.js'
import { isDbConnected } from '../config/db.js'
import { getBlogSetupSetting, saveBlogSetupSetting } from '../services/blogSetupSettings.js'
import { sendNewsletterWelcomeEmail } from '../services/emailService.js'

function normalizeDoc(doc) {
  const item = doc?.toObject ? doc.toObject() : doc
  return {
    ...item,
    id: item.customId || String(item._id || item.id),
  }
}

export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const posts = isDbConnected()
    ? await Post.find({ clientId, status: 'published' }).select('views')
    : store.posts.filter((post) => post.clientId === clientId && post.status === 'published')
  const views = posts.reduce((sum, post) => sum + (Number(post.views) || 0), 0)
  return sendSuccess(res, {
    views,
    publishedPosts: posts.length,
    uniqueVisitors: null,
    avgReadTime: null,
    bounceRate: null,
    chartData: [],
    trackingConfigured: false,
  }, 'Stored post view totals retrieved; visitor analytics are not configured')
})

export const getTrafficSources = asyncHandler(async (req, res) => {
  return sendSuccess(res, [], 'Traffic source tracking is not configured')
})

export const getDeviceBreakdown = asyncHandler(async (req, res) => {
  return sendSuccess(res, [], 'Device analytics tracking is not configured')
})

export const getSearchPerformance = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    configured: false,
    clicks: 0,
    impressions: 0,
    avgCtr: 0,
    avgPosition: null,
    trend: [],
    topQueries: [],
    pages: [],
  }, 'Search Console is not connected')
})

export const getSeoHealth = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const posts = isDbConnected()
    ? await Post.find({ clientId, status: 'published' }).select('title slug excerpt featuredImage')
    : store.posts.filter((post) => post.clientId === clientId && post.status === 'published')
  const taskState = await getBlogSetupSetting('seo-task-state', clientId, {})
  const issues = []
  for (const post of posts) {
    const path = `/blog/${post.slug || ''}`
    const postId = String(post.id || post._id || post.customId)
    if (!post.excerpt?.trim()) {
      const id = `${postId}:description`
      issues.push({ id, type: 'warning', title: 'Missing post description', target: path, status: taskState[id] || 'pending' })
    }
    if (!post.featuredImage?.trim()) {
      const id = `${postId}:featured-image`
      issues.push({ id, type: 'warning', title: 'Missing featured image', target: path, status: taskState[id] || 'pending' })
    }
  }
  const totalChecks = posts.length * 2
  const completed = issues.filter((issue) => issue.status === 'completed').length
  const passedChecks = Math.max(0, totalChecks - issues.length + completed)
  const score = totalChecks ? Math.round((passedChecks / totalChecks) * 100) : null
  return sendSuccess(res, {
    configured: true,
    score,
    rating: score === null ? 'No published posts' : score >= 80 ? 'Good' : 'Needs attention',
    passedChecks,
    totalChecks,
    issues,
  }, 'SEO content checks completed')
})

export const updateSeoTaskStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { status, clientId = 'cli-1' } = req.body
  if (!['pending', 'completed'].includes(status)) return next(new AppError('Status must be pending or completed', 400))
  const taskState = await getBlogSetupSetting('seo-task-state', clientId, {})
  taskState[id] = status
  await saveBlogSetupSetting('seo-task-state', clientId, taskState)
  return sendSuccess(res, { id, status }, 'SEO task status updated')
})

// Team & Roles
export const getRoles = asyncHandler(async (req, res) => {
  const { clientId = 'global' } = req.query
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const targetClient = (!isGlobalAdmin && user?.clientId) ? user.clientId : clientId

  let roles = await getBlogSetupSetting(`system-roles-${targetClient}`, targetClient, null)
  if (!roles || roles.length === 0) {
    // Fallback to global roles
    roles = await getBlogSetupSetting('system-roles', 'global', [
      {
        id: 'role-admin',
        name: 'Admin',
        description: 'Complete administrative authority over the CMS',
        permission: 'Full Access',
        isSystem: true,
        permissions: {
          dashboard: ['view'],
          blogPosts: ['view', 'create', 'edit', 'delete', 'publish', 'unpublish'],
          categories: ['view', 'create', 'edit', 'delete'],
          comments: ['view', 'approve', 'reject', 'delete'],
          mediaLibrary: ['view', 'upload', 'delete'],
          users: ['view', 'create', 'edit', 'delete', 'assign_roles'],
          rolesPermissions: ['view', 'manage'],
          blogSettings: ['view', 'manage'],
          websiteSetup: ['view', 'manage'],
          profileSettings: ['view', 'manage'],
        },
      },
      {
        id: 'role-content-writer',
        name: 'Content Writer',
        description: 'Drafts, creates, and submits blog articles for review',
        permission: 'Limited Access',
        isSystem: true,
        permissions: {
          dashboard: ['view'],
          blogPosts: ['view', 'create', 'edit'],
          categories: ['view'],
          comments: ['view'],
          mediaLibrary: ['view', 'upload'],
          users: [],
          rolesPermissions: [],
          blogSettings: [],
          websiteSetup: [],
          profileSettings: ['view', 'manage'],
        },
      },
      {
        id: 'role-editor',
        name: 'Editor',
        description: 'Reviews, refines, and publishes articles',
        permission: 'Limited Access',
        isSystem: true,
        permissions: {
          dashboard: ['view'],
          blogPosts: ['view', 'create', 'edit', 'delete', 'publish', 'unpublish'],
          categories: ['view', 'create', 'edit'],
          comments: ['view', 'approve', 'reject'],
          mediaLibrary: ['view', 'upload', 'delete'],
          users: ['view'],
          rolesPermissions: [],
          blogSettings: [],
          websiteSetup: [],
          profileSettings: ['view', 'manage'],
        },
      },
      {
        id: 'role-comment-manager',
        name: 'Comment Manager',
        description: 'Moderates, approves, rejects, and replies to reader comments',
        permission: 'Limited Access',
        isSystem: true,
        permissions: {
          dashboard: ['view'],
          blogPosts: ['view'],
          categories: ['view'],
          comments: ['view', 'approve', 'reject', 'delete', 'manage'],
          mediaLibrary: ['view'],
          users: [],
          rolesPermissions: [],
          blogSettings: [],
          websiteSetup: [],
          profileSettings: ['view', 'manage'],
        },
      },
      {
        id: 'role-seo-manager',
        name: 'SEO Manager',
        description: 'Manages meta tags, schema, keyword optimizations, and SEO performance',
        permission: 'Limited Access',
        isSystem: true,
        permissions: {
          dashboard: ['view'],
          blogPosts: ['view', 'edit'],
          categories: ['view', 'edit'],
          comments: [],
          mediaLibrary: ['view'],
          users: [],
          rolesPermissions: [],
          blogSettings: ['view'],
          websiteSetup: ['view'],
          profileSettings: ['view', 'manage'],
        },
      },
      {
        id: 'role-viewer',
        name: 'Viewer',
        description: 'Read-only access to permitted modules and analytics',
        permission: 'Can View Only',
        isSystem: true,
        permissions: {
          dashboard: ['view'],
          blogPosts: ['view'],
          categories: ['view'],
          comments: ['view'],
          mediaLibrary: ['view'],
          users: [],
          rolesPermissions: [],
          blogSettings: [],
          websiteSetup: [],
          profileSettings: ['view', 'manage'],
        },
      },
    ])
  }
  return sendSuccess(res, roles, 'Roles and permissions retrieved')
})

export const createRole = asyncHandler(async (req, res, next) => {
  const { name, description = '', permissions = {}, permission = 'Limited Access', clientId = 'global' } = req.body
  if (!name) return next(new AppError('Please provide a role name', 400))

  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const lowerName = name.trim().toLowerCase()

  // Requirement B.6 & Rules: Client Admin cannot create new Admin roles
  if (!isGlobalAdmin && (lowerName.includes('admin') || lowerName.includes('superadmin') || lowerName.includes('owneradmin'))) {
    return next(new AppError('Client Admin cannot create new Admin roles. Only Super Admin can manage Admin roles.', 403))
  }

  // Requirement A.5: Super Admin controls Admin roles and global permissions
  const targetClient = (!isGlobalAdmin && user?.clientId) ? user.clientId : clientId

  let roles = await getBlogSetupSetting(`system-roles-${targetClient}`, targetClient, [])
  if (roles.length === 0) {
    const globalRoles = await getBlogSetupSetting('system-roles', 'global', store.roles)
    roles = [...globalRoles]
  }

  const existing = roles.find((r) => r.name.toLowerCase() === name.trim().toLowerCase())
  if (existing) return next(new AppError('A role with this name already exists', 409))

  const newRole = {
    id: `role-${Date.now()}`,
    name: name.trim(),
    description,
    permission,
    isCustom: true,
    clientId: targetClient,
    permissions: permissions || {},
    createdAt: new Date().toISOString(),
  }

  roles.push(newRole)
  await saveBlogSetupSetting(`system-roles-${targetClient}`, targetClient, roles)
  return sendSuccess(res, newRole, 'Custom role created successfully', 201)
})

export const updateRolePermission = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { permission, permissions, name, description } = req.body
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const targetClient = (!isGlobalAdmin && user?.clientId) ? user.clientId : 'global'

  let roles = await getBlogSetupSetting(`system-roles-${targetClient}`, targetClient, null)
  if (!roles || roles.length === 0) {
    roles = await getBlogSetupSetting('system-roles', 'global', store.roles)
  }

  const role = roles.find((r) => String(r.id) === String(id))
  if (!role) return next(new AppError('Role not found', 404))

  // Requirement A.4, A.5 & D.2: Client Admin cannot modify Super Admin or Admin roles
  const isTargetAdminRole = role.name === 'Admin' || role.name === 'Super Admin' || role.name === 'OwnerAdmin' || role.name === 'Client Admin'
  if (isTargetAdminRole && !isGlobalAdmin) {
    return next(new AppError('Client Admin cannot modify Admin or Super Admin roles/permissions. Only Super Admin can configure Admin roles.', 403))
  }

  if (permission) role.permission = permission
  if (permissions) role.permissions = permissions
  if (name && role.isCustom) role.name = name
  if (description !== undefined) role.description = description

  await saveBlogSetupSetting(`system-roles-${targetClient}`, targetClient, roles)
  return sendSuccess(res, role, 'Role updated successfully')
})

export const deleteRole = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const targetClient = (!isGlobalAdmin && user?.clientId) ? user.clientId : 'global'

  let roles = await getBlogSetupSetting(`system-roles-${targetClient}`, targetClient, null)
  if (!roles || roles.length === 0) {
    roles = await getBlogSetupSetting('system-roles', 'global', store.roles)
  }

  const role = roles.find((r) => String(r.id) === String(id))
  if (!role) return next(new AppError('Role not found', 404))

  // Protection: System roles cannot be deleted
  if (role.isSystem || role.name === 'Admin' || role.name === 'Content Writer') {
    return next(new AppError('System default roles cannot be deleted.', 403))
  }

  roles = roles.filter((r) => String(r.id) !== String(id))
  await saveBlogSetupSetting(`system-roles-${targetClient}`, targetClient, roles)
  return sendSuccess(res, null, 'Role deleted successfully')
})

// Activity Log
export const getActivities = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = clientId ? { clientId } : {}
    const list = await Activity.find(filter).sort({ createdAt: -1 }).limit(100)
    return sendSuccess(res, list.map(normalizeDoc), 'Activities retrieved')
  }

  const activities = store.activities.filter((a) => !clientId || a.clientId === clientId)
  return sendSuccess(res, activities.map(normalizeDoc), 'Activities retrieved')
})

// Redirects
export const getRedirects = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = clientId ? { clientId } : {}
    const list = await Redirect.find(filter).sort({ createdAt: -1 })
    return sendSuccess(res, list.map(normalizeDoc), 'Redirects retrieved')
  }

  const redirects = store.redirects.filter((r) => !clientId || r.clientId === clientId)
  return sendSuccess(res, redirects.map(normalizeDoc), 'Redirects retrieved')
})

export const createRedirect = asyncHandler(async (req, res, next) => {
  const { sourceUrl, targetUrl, statusCode = 301, clientId = 'cli-1' } = req.body
  if (!sourceUrl || !targetUrl) return next(new AppError('Source and Target URLs required', 400))

  const customId = `red-${Date.now()}`
  const redirectData = {
    customId,
    clientId,
    sourceUrl,
    targetUrl,
    statusCode: Number(statusCode),
    hits: 0,
    status: 'active',
  }

  if (isDbConnected()) {
    const created = await Redirect.create(redirectData)
    return sendSuccess(res, normalizeDoc(created), 'Redirect rule created', 201)
  }

  const newRedirect = {
    id: customId,
    ...redirectData,
  }
  store.redirects.push(newRedirect)
  return sendSuccess(res, newRedirect, 'Redirect rule created', 201)
})

export const updateRedirect = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = req.body
  if (updates.statusCode !== undefined) updates.statusCode = Number(updates.statusCode)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const redirect = await Redirect.findOneAndUpdate({ $or: query }, updates, { new: true, runValidators: true })
    if (!redirect) return next(new AppError('Redirect rule not found', 404))
    return sendSuccess(res, normalizeDoc(redirect), 'Redirect rule updated successfully')
  }

  const redirect = store.redirects.find((r) => r.id === id || r.customId === id)
  if (!redirect) return next(new AppError('Redirect rule not found', 404))

  Object.assign(redirect, updates)
  return sendSuccess(res, redirect, 'Redirect rule updated successfully')
})

export const deleteRedirect = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await Redirect.findOneAndDelete({ $or: query })
    if (!deleted) return next(new AppError('Redirect rule not found', 404))
    return sendSuccess(res, null, 'Redirect rule deleted')
  }

  store.redirects = store.redirects.filter((r) => r.id !== id && r.customId !== id)
  return sendSuccess(res, null, 'Redirect rule deleted')
})

// Newsletter Subscribers
export const subscribeNewsletter = asyncHandler(async (req, res, next) => {
  const { email, source = 'Blog Footer', clientId = 'cli-1' } = req.body
  if (!email) return next(new AppError('Please provide an email address', 400))

  const normalizedEmail = email.trim().toLowerCase()

  if (isDbConnected()) {
    const existing = await Subscriber.findOne({ email: normalizedEmail, clientId })
    if (existing) {
      return sendSuccess(res, normalizeDoc(existing), 'You are already subscribed to the newsletter!')
    }
    const created = await Subscriber.create({
      email: normalizedEmail,
      status: 'active',
      source,
      subscribedAt: new Date().toISOString().split('T')[0],
      clientId,
    })

    // Send welcome email
    sendNewsletterWelcomeEmail({ email: normalizedEmail, websiteName: 'Deotech CMS' }).catch((err) =>
      console.error('Newsletter welcome email error:', err)
    )

    return sendSuccess(res, normalizeDoc(created), 'Subscribed to newsletter successfully', 201)
  }

  const existing = store.subscribers.find((s) => s.email.toLowerCase() === normalizedEmail)
  if (existing) {
    return sendSuccess(res, existing, 'You are already subscribed to the newsletter!')
  }

  const sub = {
    id: `sub-${Date.now()}`,
    email: normalizedEmail,
    status: 'active',
    source,
    subscribedAt: new Date().toISOString().split('T')[0],
    clientId,
  }
  store.subscribers.push(sub)

  // Send welcome email
  sendNewsletterWelcomeEmail({ email: normalizedEmail, websiteName: 'Deotech CMS' }).catch((err) =>
    console.error('Newsletter welcome email error:', err)
  )

  return sendSuccess(res, sub, 'Subscribed to newsletter successfully', 201)
})

export const getSubscribers = asyncHandler(async (req, res) => {
  const { clientId } = req.query

  if (isDbConnected()) {
    const filter = clientId ? { clientId } : {}
    const list = await Subscriber.find(filter).sort({ createdAt: -1 })
    return sendSuccess(res, list.map(normalizeDoc), 'Subscribers list retrieved')
  }

  let list = store.subscribers
  if (clientId) {
    list = list.filter((s) => !s.clientId || s.clientId === clientId)
  }
  return sendSuccess(res, list.map(normalizeDoc), 'Subscribers list retrieved')
})

export const updateSubscriber = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ email: id.toLowerCase() }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const sub = await Subscriber.findOneAndUpdate({ $or: query }, req.body, { new: true, runValidators: true })
    if (!sub) return next(new AppError('Subscriber not found', 404))
    return sendSuccess(res, normalizeDoc(sub), 'Subscriber updated successfully')
  }

  const sub = store.subscribers.find((s) => s.id === id)
  if (!sub) return next(new AppError('Subscriber not found', 404))

  Object.assign(sub, req.body)
  return sendSuccess(res, sub, 'Subscriber updated successfully')
})

export const deleteSubscriber = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ email: id.toLowerCase() }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await Subscriber.findOneAndDelete({ $or: query })
    if (!deleted) return next(new AppError('Subscriber not found', 404))
    return sendSuccess(res, null, 'Subscriber removed successfully')
  }

  const before = store.subscribers.length
  store.subscribers = store.subscribers.filter((s) => s.id !== id)
  if (store.subscribers.length === before) return next(new AppError('Subscriber not found', 404))
  return sendSuccess(res, null, 'Subscriber removed successfully')
})
