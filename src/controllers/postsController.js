import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify, paginate, calculateReadTime, formatPostDate } from '../utils/helpers.js'
import store from '../services/store.js'
import Post from '../models/Post.js'
import Client from '../models/Client.js'
import { isDbConnected } from '../config/db.js'

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

  let newPost

  if (isDbConnected()) {
    newPost = await Post.create({
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
      scheduledDate,
      date: postDate,
      readTime,
      author: authorName,
      authorRole,
      authorAvatar,
      authorId: user?._id || user?.id,
      clientId: effectiveClientId,
      views: 0,
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
      scheduledDate,
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

  let updatedPost = null

  if (isDbConnected()) {
    updatedPost = await Post.findByIdAndUpdate(existingPost._id, updates, { new: true, runValidators: true })
  } else {
    const index = store.posts.findIndex((p) => String(p.id) === String(id) || p.customId === id)
    if (index !== -1) {
      store.posts[index] = { ...store.posts[index], ...updates, updatedAt: new Date().toISOString() }
      updatedPost = store.posts[index]
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

  if (isDbConnected()) {
    await Post.findByIdAndDelete(existingPost._id)
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    store.posts = store.posts.filter((p) => String(p.id) !== String(id) && p.customId !== id)
  }

  return sendSuccess(res, null, 'Post deleted successfully')
})

export const updatePostStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { status, reviewNotes } = req.body
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
  const updates = { status, updatedAt: new Date() }
  if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes
  if (reviewNotes !== undefined) updates.reviewNotes = reviewNotes

  if (isDbConnected()) {
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      post = await Post.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
    }
    if (!post) {
      post = await Post.findOneAndUpdate({ customId: id }, updates, { new: true })
    }
  } else {
    post = store.posts.find((p) => String(p.id) === String(id) || p.customId === id)
    if (post) {
      post.status = status
      if (reviewNotes !== undefined) post.reviewNotes = reviewNotes
      post.updatedAt = new Date().toISOString()
    }
  }

  if (!post) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
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

