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
import validate from '../middleware/validator.js'
import { commentSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// Public / reader comment routes
router.get('/', validate(commentSchemas.query, 'query'), optionalAuth, getComments)
router.get('/notifications', verifyToken, getCommentNotifications)
router.patch('/notifications/:id/read', verifyToken, markNotificationRead)
router.get('/:id', optionalAuth, getCommentById)
router.post('/', optionalAuth, validate(commentSchemas.create), addComment)
router.patch('/:id/like', toggleLikeComment)

// Management / moderation routes
router.post('/:id/reply', verifyToken, validate(commentSchemas.reply), replyToComment)
router.patch('/:id/status', verifyToken, validate(commentSchemas.status), updateCommentStatus)
router.put('/:id', verifyToken, validate(commentSchemas.update), updateComment)
router.delete('/:id', verifyToken, deleteComment)

export default router
