import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, paginate } from '../utils/helpers.js'
import store from '../services/store.js'
import Comment from '../models/Comment.js'
import Post from '../models/Post.js'
import { isDbConnected } from '../config/db.js'
import { getBlogSetupSetting, saveBlogSetupSetting } from '../services/blogSetupSettings.js'
import mongoose from 'mongoose'

function normalizeComment(comment) {
  const value = comment?.toObject ? comment.toObject() : comment
  return {
    ...value,
    id: value.id || value._id || value.customId,
    name: value.name || value.authorName,
    email: value.email || value.authorEmail,
    blog: value.blog || value.postTitle || 'General Discussion',
    snippet: value.snippet || value.content,
  }
}

async function findComment(id) {
  if (isDbConnected()) {
    if (mongoose.Types.ObjectId.isValid(id)) return Comment.findById(id)
    return Comment.findOne({ customId: id })
  }
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('Database service is unavailable', 503)
  }
  return store.comments.find((comment) => String(comment.id) === String(id) || comment.customId === id)
}

export const getComments = asyncHandler(async (req, res, next) => {
  let { postId, status, clientId, page = 1, limit = 50 } = req.query
  const user = req.user
  const isGlobalAdmin = Boolean(user?.isPrimaryAdmin)
  if (user && !isGlobalAdmin) {
    clientId = user.clientId || clientId || null
  }

  if (isDbConnected()) {
    const filter = {}
    if (clientId && clientId !== 'all') filter.clientId = clientId
    if (postId) filter.$or = [{ postId }, { postTitle: postId }]
    if (status && status !== 'all') filter.status = status
    const currentPage = Math.max(1, parseInt(page, 10) || 1)
    const pageLimit = Math.max(1, parseInt(limit, 10) || 50)
    const [records, total] = await Promise.all([
      Comment.find(filter).sort({ createdAt: -1 }).skip((currentPage - 1) * pageLimit).limit(pageLimit),
      Comment.countDocuments(filter),
    ])
    return sendSuccess(res, records.map(normalizeComment), 'Comments retrieved successfully', 200, {
      total,
      page: currentPage,
      limit: pageLimit,
      totalPages: Math.ceil(total / pageLimit),
    })
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  let comments = store.comments.filter((c) => {
    if (clientId && clientId !== 'all' && c.clientId && c.clientId !== clientId) return false
    if (postId && c.postId !== postId && c.blog !== postId) return false
    if (status && status !== 'all' && c.status !== status) return false
    return true
  }).map(normalizeComment)

  const paginated = paginate(comments, page, limit)
  return sendSuccess(res, paginated.data, 'Comments retrieved successfully', 200, paginated.pagination)
})

export const getCommentById = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const comment = await findComment(id)

  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  return sendSuccess(res, normalizeComment(comment), 'Comment details retrieved successfully')
})

export const addComment = asyncHandler(async (req, res, next) => {
  const {
    postId,
    postTitle,
    blog,
    authorName,
    name,
    authorEmail,
    email,
    content,
    snippet,
    clientId,
  } = req.body

  const finalName = authorName || name
  const finalEmail = authorEmail || email || ''
  const finalContent = content || snippet
  const finalTitle = postTitle || blog || 'General Discussion'

  if (!postId) {
    return next(new AppError('postId is required to add a comment', 400))
  }
  if (!finalName || !finalContent) {
    return next(new AppError('Please provide author name and comment content', 400))
  }

  // Determine post author email and effective clientId
  let targetPost = null
  if (isDbConnected()) {
    targetPost = await Post.findOne({
      $or: [
        ...(mongoose.Types.ObjectId.isValid(postId) ? [{ _id: postId }] : []),
        { customId: postId },
        { slug: postId },
      ],
    }).lean()
  } else {
    targetPost = store.posts.find((p) => String(p.id) === String(postId) || p.customId === postId || p.slug === postId)
  }

  const effectiveClientId = clientId || targetPost?.clientId || req.user?.clientId || null
  const postAuthorEmail = targetPost?.authorEmail || targetPost?.authorId?.email || ''

  const commentData = {
    id: `com-${Date.now()}`,
    customId: `com-${Date.now()}`,
    postId,
    postTitle: targetPost?.title || finalTitle,
    blog: targetPost?.title || finalTitle,
    authorName: finalName,
    name: finalName,
    authorEmail: finalEmail,
    email: finalEmail,
    content: finalContent,
    snippet: finalContent,
    status: 'approved',
    likes: 0,
    replies: [],
    clientId: effectiveClientId,
  }

  let newComment
  if (isDbConnected()) {
    newComment = await Comment.create(commentData)
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    newComment = { ...commentData, date: 'Just now', createdAt: new Date().toISOString() }
    store.comments.unshift(newComment)
  }

  // Notify author if genuine email is known
  if (postAuthorEmail) {
    const notifs = await getBlogSetupSetting('comment-notifications', effectiveClientId || 'global', store.commentNotifications)
    const newNotif = {
      id: `notif-${Date.now()}`,
      writerEmail: postAuthorEmail,
      commentId: newComment.id,
      authorName: finalName,
      postTitle: newComment.postTitle,
      snippet: finalContent.slice(0, 70) + (finalContent.length > 70 ? '...' : ''),
      timestamp: 'Just now',
      isRead: false,
    }
    notifs.unshift(newNotif)
    await saveBlogSetupSetting('comment-notifications', effectiveClientId || 'global', notifs)
    store.commentNotifications.unshift(newNotif)
  }

  return sendSuccess(res, normalizeComment(newComment), 'Comment added successfully', 201)
})

export const replyToComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { authorName, author, name, authorRole, isAuthor = false, content, text } = req.body

  const finalAuthor = authorName || author || name || 'Admin'
  const finalContent = content || text

  if (!finalContent) {
    return next(new AppError('Please provide content for reply', 400))
  }

  const comment = await findComment(id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  const reply = {
    id: `rep-${Date.now()}`,
    authorName: finalAuthor,
    authorRole: authorRole || (isAuthor ? 'Author' : 'Reader'),
    isAuthor,
    content: finalContent,
    date: 'Just now',
  }

  if (!comment.replies) comment.replies = []
  comment.replies.push(reply)
  if (isDbConnected()) await comment.save()

  return sendSuccess(res, normalizeComment(comment), 'Reply added successfully')
})

export const toggleLikeComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const comment = await findComment(id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  comment.likes = (comment.likes || 0) + 1
  if (isDbConnected()) await comment.save()
  return sendSuccess(res, { likes: comment.likes }, 'Comment liked successfully')
})

export const updateCommentStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { status } = req.body

  if (!status) {
    return next(new AppError('Please provide comment status', 400))
  }

  const comment = await findComment(id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  const isGlobalAdmin = Boolean(req.user?.isPrimaryAdmin)
  if (req.user && !isGlobalAdmin && comment.clientId && req.user.clientId && comment.clientId !== req.user.clientId) {
    return next(new AppError('Forbidden: Cannot modify comments for another tenant', 403))
  }

  comment.status = status
  if (isDbConnected()) await comment.save()
  return sendSuccess(res, normalizeComment(comment), `Comment status updated to ${status}`)
})

export const updateComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { content, snippet, status } = req.body

  const comment = await findComment(id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  const isGlobalAdmin = Boolean(req.user?.isPrimaryAdmin)
  if (req.user && !isGlobalAdmin && comment.clientId && req.user.clientId && comment.clientId !== req.user.clientId) {
    return next(new AppError('Forbidden: Cannot modify comments for another tenant', 403))
  }

  if (content !== undefined) comment.content = content
  if (snippet !== undefined) {
    comment.snippet = snippet
    if (!content) comment.content = snippet
  }
  if (status !== undefined) comment.status = status
  if (isDbConnected()) await comment.save()
  return sendSuccess(res, normalizeComment(comment), 'Comment updated successfully')
})

export const deleteComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const comment = await findComment(id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  const isGlobalAdmin = Boolean(req.user?.isPrimaryAdmin)
  if (req.user && !isGlobalAdmin && comment.clientId && req.user.clientId && comment.clientId !== req.user.clientId) {
    return next(new AppError('Forbidden: Cannot delete comments for another tenant', 403))
  }

  if (isDbConnected()) {
    await comment.deleteOne()
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    store.comments = store.comments.filter((c) => String(c.id) !== String(id) && c.customId !== id)
  }

  return sendSuccess(res, null, 'Comment deleted successfully')
})

export const getCommentNotifications = asyncHandler(async (req, res) => {
  const notifs = await getBlogSetupSetting('comment-notifications', 'global', store.commentNotifications)
  return sendSuccess(res, notifs, 'Notifications retrieved')
})

export const markNotificationRead = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const notifs = await getBlogSetupSetting('comment-notifications', 'global', store.commentNotifications)
  const notif = notifs.find((n) => n.id === id)
  if (!notif) {
    return next(new AppError('Notification not found', 404))
  }
  notif.isRead = true
  await saveBlogSetupSetting('comment-notifications', 'global', notifs)
  const memNotif = store.commentNotifications.find((n) => n.id === id)
  if (memNotif) memNotif.isRead = true
  return sendSuccess(res, notif, 'Notification marked as read')
})
