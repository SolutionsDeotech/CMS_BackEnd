import { Router } from 'express'
import {
  getPosts,
  getPostByIdOrSlug,
  createPost,
  updatePost,
  deletePost,
  updatePostStatus,
  getPostStats,
  triggerScheduledCheck,
} from '../controllers/postsController.js'
import { optionalAuth, verifyToken, requirePermission } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { postSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// Public listing and single post retrieval
router.get('/', validate(postSchemas.query, 'query'), optionalAuth, getPosts)
router.get('/stats/overview', verifyToken, requirePermission('dashboard', 'view'), getPostStats)

// Scheduled posts manual/cron execution trigger
router.post('/scheduled/run', verifyToken, requirePermission('posts', 'publish'), triggerScheduledCheck)

router.get('/:idOrSlug', optionalAuth, getPostByIdOrSlug)

// Protected post editing actions
router.post('/', verifyToken, requirePermission('posts', 'create'), validate(postSchemas.create), createPost)
router.put('/:id', verifyToken, requirePermission('posts', 'edit'), validate(postSchemas.update), updatePost)
router.delete('/:id', verifyToken, requirePermission('posts', 'delete'), deletePost)
router.patch('/:id/status', verifyToken, requirePermission('posts', 'publish'), validate(postSchemas.status), updatePostStatus)

export default router
