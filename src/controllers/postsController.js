import mongoose from 'mongoose'
import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify, paginate, calculateReadTime, formatPostDate } from '../utils/helpers.js'
import store from '../services/store.js'
import Post from '../models/Post.js'
import Client from '../models/Client.js'
import { isDbConnected } from '../config/db.js'
import { dispatchWebhook, stageWebhookOutbox, dispatchImmediateOutboxDelivery } from '../services/webhookService.js'
import { normalizeScheduledDate, validateScheduledDate, processDueScheduledPosts } from '../services/scheduledPostService.js'

export async function withOptionalTransaction(operation) {
  if (!isDbConnected()) {
    // Isolated memory fallback for test environments without database connectivity
    return await operation(null)
  }

  const topology = mongoose.connection?.client?.topology?.description
  const topologyType = topology?.type

  // Supported transaction topologies in MongoDB Driver 6.x / Mongoose 8.x:
  // - ReplicaSetWithPrimary: Standard MongoDB Replica Set with an elected Primary
  // - ReplicaSetNoPrimary: Replica set currently in election (queued or transient error)
  // - Sharded: Sharded cluster (Mongos routers support distributed transactions since MongoDB 4.2)
  // - LoadBalanced: MongoDB 5.0+ LoadBalanced deployments (e.g. Atlas Serverless or TCP proxies to Replica Set)
  const isTransactionCapable =
    topologyType === 'ReplicaSetWithPrimary' ||
    topologyType === 'ReplicaSetNoPrimary' ||
    topologyType === 'Sharded' ||
    topologyType === 'LoadBalanced'

  if (!isTransactionCapable) {
    // Standalone / Single MongoDB server or unsupported topology:
    // Multi-document ACID transactions are not supported by the MongoDB engine in this mode.
    // Non-atomic fallback: operations execute sequentially without transaction isolation.
    return await operation(null)
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const result = await operation(session)
    await session.commitTransaction()
    return result
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

export function resolvePostWebhookEvent(prevStatus, newStatus) {
  if (prevStatus !== 'published' && newStatus === 'published') return 'post.published'
  if (prevStatus === 'published' && newStatus !== 'published') return 'post.unpublished'
  if (prevStatus === 'published' && newStatus === 'published') return 'post.updated'
  return 'post.updated'
}

export async function resolveClientId(rawClientId) {
  if (!rawClientId || typeof rawClientId !== 'string') return rawClientId
  const trimmed = rawClientId.trim()
  if (trimmed.includes('.') || trimmed.startsWith('http')) {
    const cleanHost = trimmed.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
    if (isDbConnected()) {
      const escaped = cleanHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const clientDoc = await Client.findOne({
        $or: [
          { websiteUrl: trimmed },
          { websiteUrl: `https://${cleanHost}` },
          { websiteUrl: new RegExp(escaped, 'i') },
          { customId: trimmed },
        ],
      }).lean()
      if (clientDoc?.customId) return clientDoc.customId

      try {
        const { getBlogSetupSetting } = await import('../services/blogSetupSettings.js')
        const onboardingSites = await getBlogSetupSetting('onboarding-websites', 'global', {})
        const foundSite = Object.values(onboardingSites).find((s) => {
          if (!s) return false
          if (s.id === trimmed || s.clientId === trimmed) return true
          const sUrl = s.url || s.wizard?.websiteUrl || ''
          const sHost = sUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
          return sHost && (sHost === cleanHost || sHost.includes(cleanHost) || cleanHost.includes(sHost))
        })
        if (foundSite?.id || foundSite?.clientId) return foundSite.clientId || foundSite.id
      } catch {}
    } else {
      const memClient = store.clients.find((c) => {
        if (!c) return false
        if (c.customId === trimmed || c.id === trimmed || c.websiteUrl === trimmed) return true
        if (c.websiteUrl) {
          const clientHost = c.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase()
          return clientHost === cleanHost || clientHost.includes(cleanHost) || cleanHost.includes(clientHost)
        }
        return false
      })
      if (memClient?.customId || memClient?.id) return memClient.customId || memClient.id
    }
  }
  return trimmed
}

export const getPosts = asyncHandler(async (req, res, next) => {
  const {
    q,
    category,
    tag,
    status,
    author,
    featured,
    page = 1,
    limit = 10,
    sortBy = 'date',
  } = req.query

  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const isWriter = user && (user.role === 'Content Writer' || user.userType === 'Content Writer')
  const writerAuthorName = isWriter ? user.name : null

  let clientId = req.query.clientId || req.headers['x-client-id'] || req.headers['x-tenant-id']

  // Priority 1 & 2: Public vs Authenticated handling
  if (!user) {
    // Unauthenticated public request: require and validate clientId
    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      return next(new AppError('clientId is required for public post requests', 400))
    }
    clientId = await resolveClientId(clientId)
  } else if (!isGlobalAdmin) {
    // Authenticated non-global admin (Tenant Admin, Writer, Editor, Viewer, etc.)
    clientId = await resolveClientId(user.clientId || clientId || null)
  } else {
    // Global admin can view all if clientId is omitted or 'all'
    if (clientId === 'all') clientId = null
    else if (clientId) clientId = await resolveClientId(clientId)
  }

  let posts = []

  if (isDbConnected()) {
    const filter = {}

    // Tenant isolation
    if (clientId && clientId !== 'all') {
      filter.clientId = clientId
    }

    // Priority 1: Public Blog API Security
    if (!user) {
      // Default and strictly force unauthenticated requests to status: 'published'
      // Never expose draft, pending, or trashed posts publicly
      filter.status = 'published'
    } else {
      // Authenticated users preserve existing filtering capabilities
      if (status && status !== 'all') {
        filter.status = status
      }
    }

    if (category && category !== 'all') filter.category = category
    if (tag) filter.tags = tag
    if (featured !== undefined) filter.featured = featured === 'true'

    if (writerAuthorName) {
      filter.$or = [{ author: writerAuthorName }, { authorId: user._id }]
    } else if (author) {
      filter.author = author
    }

    if (q) {
      const qFilter = [
        { title: { $regex: q, $options: 'i' } },
        { excerpt: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
      ]
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: qFilter }]
        delete filter.$or
      } else {
        filter.$or = qFilter
      }
    }

    const total = await Post.countDocuments(filter)
    const p = Math.max(1, parseInt(page, 10) || 1)
    const l = Math.max(1, parseInt(limit, 10) || 10)
    posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)

    return sendSuccess(res, posts, 'Posts retrieved successfully', 200, {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l),
    })
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  // Memory store fallback
  posts = store.posts.filter((post) => {
    // Priority 1 & 2 for memory store
    if (!user) {
      if (post.status !== 'published') return false
      if (clientId && post.clientId && post.clientId !== clientId) return false
    } else {
      if (clientId && clientId !== 'all' && post.clientId && post.clientId !== clientId) return false
      if (status && status !== 'all' && post.status !== status) return false
    }

    if (category && category !== 'all' && post.category !== category) return false
    if (tag && (!post.tags || !post.tags.includes(tag))) return false
    if (writerAuthorName && post.author !== writerAuthorName && String(post.authorId) !== String(user._id)) return false
    else if (author && post.author !== author) return false
    if (featured !== undefined && String(post.featured) !== String(featured)) return false
    if (q) {
      const query = q.toLowerCase()
      const titleMatch = post.title?.toLowerCase().includes(query)
      const excerptMatch = post.excerpt?.toLowerCase().includes(query)
      const contentMatch = post.content?.toLowerCase().includes(query)
      if (!titleMatch && !excerptMatch && !contentMatch) return false
    }
    return true
  })

  // Sort
  if (sortBy === 'views') {
    posts.sort((a, b) => (b.views || 0) - (a.views || 0))
  } else {
    posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }

  const paginated = paginate(posts, page, limit)
  return sendSuccess(res, paginated.data, 'Posts retrieved successfully', 200, paginated.pagination)
})

export const getPostByIdOrSlug = asyncHandler(async (req, res, next) => {
  const { idOrSlug } = req.params
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)

  let clientId = req.query.clientId || req.headers['x-client-id'] || req.headers['x-tenant-id']

  // Priority 1 & 2: Public vs Authenticated handling
  if (!user) {
    // 1. Require and validate clientId for public requests
    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      return next(new AppError('clientId is required for public post lookup', 400))
    }
    clientId = await resolveClientId(clientId)
  } else if (!isGlobalAdmin) {
    // Authenticated non-global admin (Tenant Admin, Writer, Editor, etc.)
    clientId = await resolveClientId(user.clientId || clientId)
  } else {
    // Global admin can view any post; if clientId is specified, scope to it
    if (clientId === 'all') clientId = null
    else if (clientId) clientId = await resolveClientId(clientId)
  }

  const isObjectId = Boolean(idOrSlug.match(/^[0-9a-fA-F]{24}$/))
  let post = null

  if (isDbConnected()) {
    // Construct lookup condition matching identifier
    const identifierCondition = isObjectId
      ? [{ _id: idOrSlug }, { customId: idOrSlug }, { slug: idOrSlug }]
      : [{ customId: idOrSlug }, { slug: idOrSlug }]

    const query = {
      $or: identifierCondition,
    }

    // Tenant isolation: require matching clientId
    if (clientId) {
      query.clientId = clientId
    }

    // Priority 1: Never expose draft, pending, or trashed posts publicly
    if (!user) {
      query.status = 'published'
    }

    post = await Post.findOne(query)
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    // Memory store fallback
    post = store.posts.find((p) => {
      const matchesId =
        String(p.id) === String(idOrSlug) ||
        p.customId === idOrSlug ||
        p.slug === idOrSlug
      if (!matchesId) return false

      if (clientId && p.clientId && p.clientId !== clientId) return false
      if (!user && p.status !== 'published') return false
      return true
    })
  }

  if (!post) {
    return next(new AppError(`Blog post not found with identifier: ${idOrSlug}`, 404))
  }

  // Cross-tenant protection for authenticated non-global-admin users
  if (user && !isGlobalAdmin && post.clientId && user.clientId && post.clientId !== user.clientId) {
    return next(new AppError('Access denied: You do not have permission to view content from another tenant', 403))
  }

  // Writer protection: writers can only view published posts or their own drafts
  if (user && (user.role === 'Content Writer' || user.userType === 'Content Writer')) {
    if (
      post.status !== 'published' &&
      post.author !== user.name &&
      String(post.authorId) !== String(user._id || user.id)
    ) {
      return next(new AppError('Access denied: You cannot view unpublished posts from other authors', 403))
    }
  }

  return sendSuccess(res, post, 'Post retrieved successfully')
})

export const createPost = asyncHandler(async (req, res, next) => {
  const {
    title,
    slug,
    content,
    excerpt,
    category,
    tags,
    status = 'draft',
    featuredImage,
    featured = false,
    scheduledDate,
    clientId,
  } = req.body

  if (!title) {
    return next(new AppError('Please provide a post title', 400))
  }

  const generatedSlug = slug ? slugify(slug) : slugify(title)
  const readTime = calculateReadTime(content)
  const postDate = formatPostDate()
  const authorName = req.user?.name || 'Author'
  const authorRole = req.user?.role || 'Author'
  const authorAvatar = req.user?.avatar || ''

  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const isWriter = user && (user.role === 'Content Writer' || user.userType === 'Content Writer')

  // Scoped clientId: non-global admin always uses own assigned tenant
  const effectiveClientId = (!isGlobalAdmin && user?.clientId) ? user.clientId : (clientId || user?.clientId || null)

  // Requirement: Content Writer cannot publish without permission
  let postStatus = status
  if (isWriter && postStatus === 'published' && user.permission !== 'Full Access') {
    postStatus = 'pending_review'
  }

  let validatedScheduledDate = null
  if (postStatus === 'scheduled') {
    const validation = validateScheduledDate(scheduledDate)
    if (!validation.valid) {
      return next(new AppError(validation.error, 400))
    }
    validatedScheduledDate = validation.date
  } else if (scheduledDate) {
    validatedScheduledDate = normalizeScheduledDate(scheduledDate)
  }

  const publishedAt = postStatus === 'published' ? new Date() : null

  let newPost
  let outboxStage = null

  if (isDbConnected()) {
    const postPayload = {
      customId: `post-${Date.now()}`,
      title,
      slug: generatedSlug,
      content: content || '',
      excerpt: excerpt || '',
      category: category || 'General',
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
      status: postStatus,
      featuredImage: featuredImage || '',
      featured,
      scheduledDate: validatedScheduledDate,
      publishedAt,
      date: postDate,
      readTime,
      author: authorName,
      authorRole,
      authorAvatar,
      authorId: user?._id || user?.id,
      clientId: effectiveClientId,
      views: 0,
    }

    await withOptionalTransaction(async (session) => {
      const createOptions = session ? { session } : {}
      const [created] = await Post.create([postPayload], createOptions)
      newPost = created

      if (newPost?.status === 'published' && effectiveClientId) {
        const postId = String(newPost.id || newPost._id || newPost.customId)
        const postTimestamp = newPost.createdAt || Date.now()
        outboxStage = await stageWebhookOutbox(
          effectiveClientId,
          'post.published',
          {
            id: postId,
            slug: newPost.slug,
            title: newPost.title,
            status: newPost.status,
            publishedAt: newPost.publishedAt,
          },
          {
            postId,
            eventIdentity: `${effectiveClientId}:post.published:${postId}:${new Date(postTimestamp).getTime()}`,
          },
          session
        )
      }
    })
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    newPost = {
      id: `post-${Date.now()}`,
      customId: `post-${Date.now()}`,
      title,
      slug: generatedSlug,
      content: content || '',
      excerpt: excerpt || '',
      category: category || 'General',
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
      status: postStatus,
      featuredImage: featuredImage || '',
      featured,
      scheduledDate: validatedScheduledDate ? validatedScheduledDate.toISOString() : null,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      date: postDate,
      readTime,
      author: authorName,
      authorRole,
      authorAvatar,
      authorId: user?._id || user?.id,
      clientId: effectiveClientId,
      views: 0,
      createdAt: new Date().toISOString(),
    }
    store.posts.unshift(newPost)
  }

  if (outboxStage?.error) {
    return next(new AppError(`Webhook outbox persistence failed: ${outboxStage.error}`, 500))
  }

  if (outboxStage?.staged && outboxStage?.delivery) {
    dispatchImmediateOutboxDelivery(outboxStage.delivery, outboxStage.secret, 'dispatcher-immediate').catch(() => {})
  } else if (newPost?.status === 'published' && effectiveClientId && !outboxStage) {
    const postId = String(newPost.id || newPost._id || newPost.customId)
    const postTimestamp = newPost.createdAt || Date.now()
    dispatchWebhook(
      effectiveClientId,
      'post.published',
      {
        id: postId,
        slug: newPost.slug,
        title: newPost.title,
        status: newPost.status,
        publishedAt: newPost.publishedAt,
      },
      {
        postId,
        eventIdentity: `${effectiveClientId}:post.published:${postId}:${new Date(postTimestamp).getTime()}`,
      }
    ).catch(() => {})
  }

  return sendSuccess(res, newPost, 'Post created successfully', 201)
})

export const updatePost = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = { ...req.body }
  const user = req.user

  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const isWriter = user && (user.role === 'Content Writer' || user.userType === 'Content Writer')

  // Find the post first to verify tenant and authorship
  let existingPost = null
  if (isDbConnected()) {
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      existingPost = await Post.findById(id)
    }
    if (!existingPost) {
      existingPost = await Post.findOne({ customId: id })
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    existingPost = store.posts.find((p) => String(p.id) === String(id) || p.customId === id)
  }

  if (!existingPost) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
  }

  // Tenant Isolation: Non-global admins can only edit posts belonging to their assigned clientId
  if (!isGlobalAdmin && user?.clientId && existingPost.clientId !== user.clientId) {
    return next(
      new AppError(
        `Tenant Isolation: You are not authorized to modify posts outside your assigned website (${user.clientId}).`,
        403,
        { code: 'TENANT_ISOLATION_VIOLATION' }
      )
    )
  }

  // Writer Author Isolation: Writers can only edit their own posts
  if (isWriter) {
    const isOwnPost = existingPost.author === user.name || String(existingPost.authorId) === String(user._id)
    if (!isOwnPost) {
      return next(new AppError('Access denied. Writers can only edit their own authored posts.', 403))
    }
    // Writers cannot directly publish without review
    if (updates.status === 'published' && user.permission !== 'Full Access') {
      updates.status = 'pending_review'
    }
  }

  // Never allow changing clientId through updates
  delete updates.clientId

  if (updates.title && !updates.slug) {
    updates.slug = slugify(updates.title)
  }
  if (updates.content) {
    updates.readTime = calculateReadTime(updates.content)
  }

  const targetStatus = updates.status !== undefined ? updates.status : existingPost.status
  if (targetStatus === 'scheduled') {
    const rawSchedDate = updates.scheduledDate !== undefined ? updates.scheduledDate : existingPost.scheduledDate
    const validation = validateScheduledDate(rawSchedDate)
    if (!validation.valid) {
      return next(new AppError(validation.error, 400))
    }
    updates.scheduledDate = validation.date
  } else if (updates.scheduledDate) {
    updates.scheduledDate = normalizeScheduledDate(updates.scheduledDate)
  }

  if (updates.status === 'published') {
    if (!existingPost.publishedAt) {
      updates.publishedAt = new Date()
    }
    updates.publishingLock = { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null }
  } else if (updates.status && updates.status !== 'scheduled') {
    updates.publishingLock = { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null }
  }

  let updatedPost = null
  let outboxStage = null

  if (isDbConnected()) {
    await withOptionalTransaction(async (session) => {
      const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true }
      updatedPost = await Post.findByIdAndUpdate(existingPost._id, updates, updateOptions)

      if (updatedPost) {
        const targetClientId = updatedPost.clientId || existingPost?.clientId
        if (targetClientId) {
          const prevStatus = existingPost?.status || 'draft'
          const newStatus = updatedPost.status || prevStatus
          const event = resolvePostWebhookEvent(prevStatus, newStatus)
          const postId = String(updatedPost.id || updatedPost._id || updatedPost.customId)
          const postTimestamp = updatedPost.updatedAt || Date.now()
          outboxStage = await stageWebhookOutbox(
            targetClientId,
            event,
            {
              id: postId,
              slug: updatedPost.slug,
              title: updatedPost.title,
              status: updatedPost.status,
              previousStatus: prevStatus,
              publishedAt: updatedPost.publishedAt,
            },
            {
              postId,
              eventIdentity: `${targetClientId}:${event}:${postId}:${new Date(postTimestamp).getTime()}`,
            },
            session
          )
        }
      }
    })
  } else {
    const index = store.posts.findIndex((p) => String(p.id) === String(id) || p.customId === id)
    if (index !== -1) {
      const current = store.posts[index]
      const currentSched = updates.scheduledDate !== undefined
        ? (updates.scheduledDate ? updates.scheduledDate.toISOString() : null)
        : current.scheduledDate
      const currentPub = updates.publishedAt !== undefined
        ? (updates.publishedAt ? updates.publishedAt.toISOString() : null)
        : current.publishedAt
      const mergedLock = updates.publishingLock !== undefined ? updates.publishingLock : current.publishingLock

      store.posts[index] = {
        ...current,
        ...updates,
        scheduledDate: currentSched,
        publishedAt: currentPub,
        publishingLock: mergedLock,
        updatedAt: new Date().toISOString(),
      }
      updatedPost = store.posts[index]
    }
  }

  if (outboxStage?.error) {
    return next(new AppError(`Webhook outbox persistence failed: ${outboxStage.error}`, 500))
  }

  if (outboxStage?.staged && outboxStage?.delivery) {
    dispatchImmediateOutboxDelivery(outboxStage.delivery, outboxStage.secret, 'dispatcher-immediate').catch(() => {})
  } else if (updatedPost && !outboxStage) {
    const targetClientId = updatedPost.clientId || existingPost?.clientId
    if (targetClientId) {
      const prevStatus = existingPost?.status || 'draft'
      const newStatus = updatedPost.status || prevStatus
      const event = resolvePostWebhookEvent(prevStatus, newStatus)
      const postId = String(updatedPost.id || updatedPost._id || updatedPost.customId)
      const postTimestamp = updatedPost.updatedAt || Date.now()
      dispatchWebhook(
        targetClientId,
        event,
        {
          id: postId,
          slug: updatedPost.slug,
          title: updatedPost.title,
          status: updatedPost.status,
          previousStatus: prevStatus,
          publishedAt: updatedPost.publishedAt,
        },
        {
          postId,
          eventIdentity: `${targetClientId}:${event}:${postId}:${new Date(postTimestamp).getTime()}`,
        }
      ).catch(() => {})
    }
  }

  return sendSuccess(res, updatedPost, 'Post updated successfully')
})

export const deletePost = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const isWriter = user && (user.role === 'Content Writer' || user.userType === 'Content Writer')

  // Find post to check permissions
  let existingPost = null
  if (isDbConnected()) {
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      existingPost = await Post.findById(id)
    }
    if (!existingPost) {
      existingPost = await Post.findOne({ customId: id })
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    existingPost = store.posts.find((p) => String(p.id) === String(id) || p.customId === id)
  }

  if (!existingPost) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
  }

  // Tenant Isolation
  if (!isGlobalAdmin && user?.clientId && existingPost.clientId !== user.clientId) {
    return next(
      new AppError(
        `Tenant Isolation: You are not authorized to delete posts from other websites.`,
        403,
        { code: 'TENANT_ISOLATION_VIOLATION' }
      )
    )
  }

  // Writers cannot delete published posts, only their own drafts
  if (isWriter) {
    const isOwnPost = existingPost.author === user.name || String(existingPost.authorId) === String(user._id)
    if (!isOwnPost || existingPost.status === 'published') {
      return next(new AppError('Access denied. Writers can only delete their own draft posts.', 403))
    }
  }

  let outboxStage = null

  if (isDbConnected()) {
    await withOptionalTransaction(async (session) => {
      const deleteOptions = session ? { session } : {}
      await Post.findByIdAndDelete(existingPost._id, deleteOptions)

      if (existingPost?.clientId) {
        const postId = String(existingPost.id || existingPost._id || existingPost.customId)
        outboxStage = await stageWebhookOutbox(
          existingPost.clientId,
          'post.deleted',
          {
            id: postId,
            slug: existingPost.slug,
            title: existingPost.title,
          },
          {
            postId,
            eventIdentity: `${existingPost.clientId}:post.deleted:${postId}:${Date.now()}`,
          },
          session
        )
      }
    })
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    store.posts = store.posts.filter((p) => String(p.id) !== String(id) && p.customId !== id)
  }

  if (outboxStage?.error) {
    return next(new AppError(`Webhook outbox persistence failed: ${outboxStage.error}`, 500))
  }

  if (outboxStage?.staged && outboxStage?.delivery) {
    dispatchImmediateOutboxDelivery(outboxStage.delivery, outboxStage.secret, 'dispatcher-immediate').catch(() => {})
  } else if (existingPost?.clientId && !outboxStage) {
    const postId = String(existingPost.id || existingPost._id || existingPost.customId)
    dispatchWebhook(
      existingPost.clientId,
      'post.deleted',
      {
        id: postId,
        slug: existingPost.slug,
        title: existingPost.title,
      },
      {
        postId,
        eventIdentity: `${existingPost.clientId}:post.deleted:${postId}:${Date.now()}`,
      }
    ).catch(() => {})
  }

  return sendSuccess(res, null, 'Post deleted successfully')
})

export const updatePostStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { status, reviewNotes, scheduledDate } = req.body
  const user = req.user

  if (!status) {
    return next(new AppError('Please provide a new status', 400))
  }

  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  const isWriter = user && (user.role === 'Content Writer' || user.userType === 'Content Writer')

  let existingPost = null
  if (isDbConnected()) {
    if (id.match(/^[0-9a-fA-F]{24}$/)) existingPost = await Post.findById(id)
    if (!existingPost) existingPost = await Post.findOne({ customId: id })
  } else {
    existingPost = store.posts.find((p) => String(p.id) === String(id) || p.customId === id)
  }

  if (!existingPost) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
  }

  // Tenant Isolation
  if (!isGlobalAdmin && user?.clientId && existingPost.clientId !== user.clientId) {
    return next(new AppError('Tenant Isolation: Unauthorized cross-tenant modification.', 403))
  }

  // Writer check: Writers can submit for review or save draft, but cannot self-approve or publish
  if (isWriter) {
    const isOwnPost = existingPost.author === user.name || String(existingPost.authorId) === String(user._id)
    if (!isOwnPost) {
      return next(new AppError('Access denied. Writers can only update status on their own posts.', 403))
    }
    if (status === 'published' && user.permission !== 'Full Access') {
      return next(new AppError('Writers cannot publish posts directly. Please submit for review.', 403))
    }
  }

  let post = null
  let outboxStage = null
  const updates = { status, updatedAt: new Date() }
  if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes

  if (status === 'scheduled') {
    const rawSchedDate = scheduledDate !== undefined ? scheduledDate : existingPost.scheduledDate
    const validation = validateScheduledDate(rawSchedDate)
    if (!validation.valid) {
      return next(new AppError(validation.error, 400))
    }
    updates.scheduledDate = validation.date
  } else if (scheduledDate) {
    updates.scheduledDate = normalizeScheduledDate(scheduledDate)
  }

  if (status === 'published') {
    if (!existingPost.publishedAt) {
      updates.publishedAt = new Date()
    }
    updates.publishingLock = { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null }
  } else if (status !== 'scheduled') {
    updates.publishingLock = { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null }
  }

  if (isDbConnected()) {
    await withOptionalTransaction(async (session) => {
      const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true }
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        post = await Post.findByIdAndUpdate(id, updates, updateOptions)
      }
      if (!post) {
        post = await Post.findOneAndUpdate({ customId: id }, updates, session ? { session, new: true } : { new: true })
      }

      if (post) {
        const targetClientId = post.clientId || existingPost?.clientId
        if (targetClientId) {
          const prevStatus = existingPost?.status || 'draft'
          const event = resolvePostWebhookEvent(prevStatus, status)
          const postId = String(post.id || post._id || post.customId)
          const postTimestamp = post.updatedAt || Date.now()
          outboxStage = await stageWebhookOutbox(
            targetClientId,
            event,
            {
              id: postId,
              slug: post.slug,
              title: post.title,
              status: post.status,
              previousStatus: prevStatus,
              publishedAt: post.publishedAt,
            },
            {
              postId,
              eventIdentity: `${targetClientId}:${event}:${postId}:${new Date(postTimestamp).getTime()}`,
            },
            session
          )
        }
      }
    })
  } else {
    post = store.posts.find((p) => String(p.id) === String(id) || p.customId === id)
    if (post) {
      const currentSched = updates.scheduledDate !== undefined
        ? (updates.scheduledDate ? updates.scheduledDate.toISOString() : null)
        : post.scheduledDate
      const currentPub = updates.publishedAt !== undefined
        ? (updates.publishedAt ? updates.publishedAt.toISOString() : null)
        : post.publishedAt
      const mergedLock = updates.publishingLock !== undefined ? updates.publishingLock : post.publishingLock

      Object.assign(post, updates, {
        scheduledDate: currentSched,
        publishedAt: currentPub,
        publishingLock: mergedLock,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  if (!post) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
  }

  if (outboxStage?.error) {
    return next(new AppError(`Webhook outbox persistence failed: ${outboxStage.error}`, 500))
  }

  if (outboxStage?.staged && outboxStage?.delivery) {
    dispatchImmediateOutboxDelivery(outboxStage.delivery, outboxStage.secret, 'dispatcher-immediate').catch(() => {})
  } else if (post && !outboxStage) {
    const targetClientId = post.clientId || existingPost?.clientId
    if (targetClientId) {
      const prevStatus = existingPost?.status || 'draft'
      const event = resolvePostWebhookEvent(prevStatus, status)
      const postId = String(post.id || post._id || post.customId)
      const postTimestamp = post.updatedAt || Date.now()
      dispatchWebhook(
        targetClientId,
        event,
        {
          id: postId,
          slug: post.slug,
          title: post.title,
          status: post.status,
          previousStatus: prevStatus,
          publishedAt: post.publishedAt,
        },
        {
          postId,
          eventIdentity: `${targetClientId}:${event}:${postId}:${new Date(postTimestamp).getTime()}`,
        }
      ).catch(() => {})
    }
  }

  return sendSuccess(res, post, `Post status updated to ${status}`)
})

export const getPostStats = asyncHandler(async (req, res, next) => {
  let { clientId } = req.query
  const user = req.user

  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  if (user && !isGlobalAdmin) {
    clientId = user.clientId || null
  }

  const isWriter = user && (user.role === 'Content Writer' || user.userType === 'Content Writer')
  const writerAuthorName = isWriter ? user.name : null

  let total = 0
  let published = 0
  let draft = 0
  let pendingReview = 0
  let scheduled = 0
  let allPosts = []

  const baseFilter = {}
  if (clientId && clientId !== 'all') {
    baseFilter.clientId = clientId
  }
  if (writerAuthorName) {
    baseFilter.$or = [{ author: writerAuthorName }, { authorId: user._id }]
  }

  if (isDbConnected()) {
    const [t, p, d, pr, s, posts] = await Promise.all([
      Post.countDocuments(baseFilter),
      Post.countDocuments({ ...baseFilter, status: 'published' }),
      Post.countDocuments({ ...baseFilter, status: 'draft' }),
      Post.countDocuments({ ...baseFilter, status: 'pending_review' }),
      Post.countDocuments({ ...baseFilter, status: 'scheduled' }),
      Post.find(baseFilter).select('createdAt date').lean(),
    ])
    total = t
    published = p
    draft = d
    pendingReview = pr
    scheduled = s
    allPosts = posts
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    const posts = store.posts.filter((post) => {
      if (clientId && clientId !== 'all' && post.clientId && post.clientId !== clientId) return false
      return true
    })
    total = posts.length
    published = posts.filter((p) => p.status === 'published').length
    draft = posts.filter((p) => p.status === 'draft').length
    pendingReview = posts.filter((p) => p.status === 'pending_review').length
    scheduled = posts.filter((p) => p.status === 'scheduled').length
    allPosts = posts
  }

  // Calculate real monthly distribution
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthlyCounts = {}
  monthNames.forEach((m) => { monthlyCounts[m] = 0 })

  allPosts.forEach((post) => {
    let d = null
    if (post.createdAt) d = new Date(post.createdAt)
    else if (post.date) d = new Date(post.date)
    if (d && !isNaN(d.getTime())) {
      const m = monthNames[d.getMonth()]
      monthlyCounts[m] = (monthlyCounts[m] || 0) + 1
    }
  })

  const chartData = monthNames.map((month) => ({
    month,
    value: monthlyCounts[month] || 0,
  }))

  return sendSuccess(res, {
    total,
    published,
    draft,
    pendingReview,
    scheduled,
    chartData,
  }, 'Post activity overview statistics')
})

export const triggerScheduledCheck = asyncHandler(async (req, res, next) => {
  const result = await processDueScheduledPosts(50, `manual-${req.user?.id || req.user?._id || 'admin'}`)
  return sendSuccess(res, result, 'Scheduled posts processing triggered successfully')
})

