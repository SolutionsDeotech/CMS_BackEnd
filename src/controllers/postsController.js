import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify, paginate, calculateReadTime, formatPostDate } from '../utils/helpers.js'
import store from '../services/store.js'
import Post from '../models/Post.js'
import { isDbConnected } from '../config/db.js'

export const getPosts = asyncHandler(async (req, res) => {
  const {
    q,
    category,
    tag,
    status,
    author,
    featured,
    clientId = 'cli-1',
    page = 1,
    limit = 10,
    sortBy = 'date',
  } = req.query

  let posts = []

  if (isDbConnected()) {
    const filter = {}
    if (clientId) filter.clientId = clientId
    if (status && status !== 'all') filter.status = status
    if (category && category !== 'all') filter.category = category
    if (tag) filter.tags = tag
    if (featured !== undefined) filter.featured = featured === 'true'
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { excerpt: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } },
      ]
    }
    const total = await Post.countDocuments(filter)
    const p = Math.max(1, parseInt(page, 10))
    const l = Math.max(1, parseInt(limit, 10))
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

  // Memory store fallback
  posts = store.posts.filter((post) => {
    if (clientId && post.clientId && post.clientId !== clientId) return false
    if (status && status !== 'all' && post.status !== status) return false
    if (category && category !== 'all' && post.category !== category) return false
    if (tag && (!post.tags || !post.tags.includes(tag))) return false
    if (author && post.author !== author) return false
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

  let post = null

  if (isDbConnected()) {
    if (idOrSlug.match(/^[0-9a-fA-F]{24}$/)) {
      post = await Post.findById(idOrSlug)
    }
    if (!post) {
      post = await Post.findOne({ $or: [{ customId: idOrSlug }, { slug: idOrSlug }] })
    }
  } else {
    post = store.posts.find(
      (p) =>
        String(p.id) === String(idOrSlug) ||
        p.customId === idOrSlug ||
        p.slug === idOrSlug
    )
  }

  if (!post) {
    return next(new AppError(`Blog post not found with identifier: ${idOrSlug}`, 404))
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
    clientId = 'cli-1',
  } = req.body

  if (!title) {
    return next(new AppError('Please provide a post title', 400))
  }

  const generatedSlug = slug ? slugify(slug) : slugify(title)
  const readTime = calculateReadTime(content)
  const postDate = formatPostDate()
  const authorName = req.user?.name || 'Jane Doe'
  const authorRole = req.user?.role || 'Author'
  const authorAvatar = req.user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face'

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
      status,
      featuredImage: featuredImage || '',
      featured,
      scheduledDate,
      date: postDate,
      readTime,
      author: authorName,
      authorRole,
      authorAvatar,
      clientId,
      views: 0,
    })
  } else {
    newPost = {
      id: `post-${Date.now()}`,
      customId: `post-${Date.now()}`,
      title,
      slug: generatedSlug,
      content: content || '',
      excerpt: excerpt || '',
      category: category || 'General',
      tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
      status,
      featuredImage: featuredImage || '',
      featured,
      scheduledDate,
      date: postDate,
      readTime,
      author: authorName,
      authorRole,
      authorAvatar,
      clientId,
      views: 0,
      createdAt: new Date().toISOString(),
    }
    store.posts.unshift(newPost)
  }

  return sendSuccess(res, newPost, 'Post created successfully', 201)
})

export const updatePost = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = req.body

  if (updates.title && !updates.slug) {
    updates.slug = slugify(updates.title)
  }
  if (updates.content) {
    updates.readTime = calculateReadTime(updates.content)
  }

  let updatedPost = null

  if (isDbConnected()) {
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      updatedPost = await Post.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
    }
    if (!updatedPost) {
      updatedPost = await Post.findOneAndUpdate({ customId: id }, updates, { new: true })
    }
  } else {
    const index = store.posts.findIndex((p) => String(p.id) === String(id) || p.customId === id)
    if (index !== -1) {
      store.posts[index] = { ...store.posts[index], ...updates, updatedAt: new Date().toISOString() }
      updatedPost = store.posts[index]
    }
  }

  if (!updatedPost) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
  }

  return sendSuccess(res, updatedPost, 'Post updated successfully')
})

export const deletePost = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    let deleted = null
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      deleted = await Post.findByIdAndDelete(id)
    }
    if (!deleted) {
      deleted = await Post.findOneAndDelete({ customId: id })
    }
    if (!deleted) {
      return next(new AppError(`Blog post not found with id: ${id}`, 404))
    }
  } else {
    const initialLen = store.posts.length
    store.posts = store.posts.filter((p) => String(p.id) !== String(id) && p.customId !== id)
    if (store.posts.length === initialLen) {
      return next(new AppError(`Blog post not found with id: ${id}`, 404))
    }
  }

  return sendSuccess(res, null, 'Post deleted successfully')
})

export const updatePostStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { status, reviewNotes } = req.body

  if (!status) {
    return next(new AppError('Please provide a new status', 400))
  }

  const post = store.posts.find((p) => String(p.id) === String(id) || p.customId === id)
  if (!post) {
    return next(new AppError(`Blog post not found with id: ${id}`, 404))
  }

  post.status = status
  if (reviewNotes !== undefined) post.reviewNotes = reviewNotes
  post.updatedAt = new Date().toISOString()

  return sendSuccess(res, post, `Post status updated to ${status}`)
})

export const getPostStats = asyncHandler(async (req, res) => {
  const posts = store.posts
  const total = posts.length
  const published = posts.filter((p) => p.status === 'published').length
  const draft = posts.filter((p) => p.status === 'draft').length
  const pendingReview = posts.filter((p) => p.status === 'pending_review').length
  const scheduled = posts.filter((p) => p.status === 'scheduled').length

  const chartData = [
    { month: 'Jan', value: 420 },
    { month: 'Feb', value: 580 },
    { month: 'Mar', value: 510 },
    { month: 'Apr', value: 640 },
    { month: 'May', value: 720 },
    { month: 'Jun', value: 680 },
    { month: 'Jul', value: 920 },
    { month: 'Aug', value: 760 },
    { month: 'Sep', value: 690 },
    { month: 'Oct', value: 810 },
    { month: 'Nov', value: 740 },
    { month: 'Dec', value: 880 },
  ]

  return sendSuccess(res, {
    total,
    published,
    draft,
    pendingReview,
    scheduled,
    chartData,
  }, 'Post activity overview statistics')
})
