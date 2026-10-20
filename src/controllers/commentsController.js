import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, paginate } from '../utils/helpers.js'
import store from '../services/store.js'

export const getComments = asyncHandler(async (req, res) => {
  const { postId, status, clientId = 'cli-1', page = 1, limit = 50 } = req.query

  let comments = store.comments.filter((c) => {
    if (clientId && c.clientId && c.clientId !== clientId) return false
    if (postId && c.postId !== postId && c.blog !== postId) return false
    if (status && status !== 'all' && c.status !== status) return false
    return true
  }).map((c) => ({
    ...c,
    name: c.name || c.authorName,
    email: c.email || c.authorEmail,
    blog: c.blog || c.postTitle || 'General Discussion',
    snippet: c.snippet || c.content,
  }))

  const paginated = paginate(comments, page, limit)
  return sendSuccess(res, paginated.data, 'Comments retrieved successfully', 200, paginated.pagination)
})

export const getCommentById = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const comment = store.comments.find((c) => String(c.id) === String(id) || c.customId === id)

  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  const normalized = {
    ...comment,
    name: comment.name || comment.authorName,
    email: comment.email || comment.authorEmail,
    blog: comment.blog || comment.postTitle || 'General Discussion',
    snippet: comment.snippet || comment.content,
  }

  return sendSuccess(res, normalized, 'Comment details retrieved successfully')
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
    clientId = 'cli-1',
  } = req.body

  const finalName = authorName || name
  const finalEmail = authorEmail || email || ''
  const finalContent = content || snippet
  const finalTitle = postTitle || blog || 'General Discussion'
  const finalPostId = postId || 'post-101'

  if (!finalName || !finalContent) {
    return next(new AppError('Please provide author name and comment content', 400))
  }

  const newComment = {
    id: `com-${Date.now()}`,
    customId: `com-${Date.now()}`,
    postId: finalPostId,
    postTitle: finalTitle,
    blog: finalTitle,
    authorName: finalName,
    name: finalName,
    authorEmail: finalEmail,
    email: finalEmail,
    content: finalContent,
    snippet: finalContent,
    date: 'Just now',
    status: 'approved',
    likes: 0,
    replies: [],
    clientId,
    createdAt: new Date().toISOString(),
  }

  store.comments.unshift(newComment)

  // Notify author
  store.commentNotifications.unshift({
    id: `notif-${Date.now()}`,
    writerEmail: 'rohan.s@deotech.com',
    commentId: newComment.id,
    authorName,
    postTitle: newComment.postTitle,
    snippet: content.slice(0, 70) + '...',
    timestamp: 'Just now',
    isRead: false,
  })

  return sendSuccess(res, newComment, 'Comment added successfully', 201)
})

export const replyToComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { authorName, author, name, authorRole, isAuthor = false, content, text } = req.body

  const finalAuthor = authorName || author || name || 'Admin'
  const finalContent = content || text

  if (!finalContent) {
    return next(new AppError('Please provide content for reply', 400))
  }

  const comment = store.comments.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  const reply = {
    id: `rep-${Date.now()}`,
    authorName,
    authorRole: authorRole || (isAuthor ? 'Author' : 'Reader'),
    isAuthor,
    content,
    date: 'Just now',
  }

  if (!comment.replies) comment.replies = []
  comment.replies.push(reply)

  return sendSuccess(res, comment, 'Reply added successfully')
})

export const toggleLikeComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const comment = store.comments.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  comment.likes = (comment.likes || 0) + 1
  return sendSuccess(res, { likes: comment.likes }, 'Comment liked successfully')
})

export const updateCommentStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { status } = req.body

  if (!status) {
    return next(new AppError('Please provide comment status', 400))
  }

  const comment = store.comments.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  comment.status = status
  return sendSuccess(res, comment, `Comment status updated to ${status}`)
})

export const updateComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { content, snippet, status } = req.body

  const comment = store.comments.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!comment) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }

  if (content !== undefined) comment.content = content
  if (snippet !== undefined) {
    comment.snippet = snippet
    if (!content) comment.content = snippet
  }
  if (status !== undefined) comment.status = status
  return sendSuccess(res, comment, 'Comment updated successfully')
})

export const deleteComment = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const initialLen = store.comments.length
  store.comments = store.comments.filter((c) => String(c.id) !== String(id) && c.customId !== id)

  if (store.comments.length === initialLen) {
    return next(new AppError(`Comment not found with id: ${id}`, 404))
  }
  return sendSuccess(res, null, 'Comment deleted successfully')
})

export const getCommentNotifications = asyncHandler(async (req, res) => {
  return sendSuccess(res, store.commentNotifications, 'Notifications retrieved')
})

export const markNotificationRead = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const notif = store.commentNotifications.find((n) => n.id === id)
  if (!notif) {
    return next(new AppError('Notification not found', 404))
  }
  notif.isRead = true
  return sendSuccess(res, notif, 'Notification marked as read')
})
