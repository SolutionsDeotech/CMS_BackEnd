import { Router } from 'express'
import {
  getComments,
  getCommentById,
  addComment,
  replyToComment,
  toggleLikeComment,
  updateCommentStatus,
  updateComment,
  deleteComment,
  getCommentNotifications,
  markNotificationRead,
} from '../controllers/commentsController.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'

const router = Router()

// Public / reader comment routes
router.get('/', optionalAuth, getComments)
router.get('/notifications', verifyToken, getCommentNotifications)
router.patch('/notifications/:id/read', verifyToken, markNotificationRead)
router.get('/:id', optionalAuth, getCommentById)
router.post('/', optionalAuth, addComment)
router.patch('/:id/like', toggleLikeComment)

// Management / moderation routes
router.post('/:id/reply', verifyToken, replyToComment)
router.patch('/:id/status', verifyToken, updateCommentStatus)
router.put('/:id', verifyToken, updateComment)
router.delete('/:id', verifyToken, deleteComment)

export default router
