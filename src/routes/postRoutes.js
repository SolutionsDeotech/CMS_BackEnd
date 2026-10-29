import { Router } from 'express'
import {
  getPosts,
  getPostByIdOrSlug,
  createPost,
  updatePost,
  deletePost,
  updatePostStatus,
  getPostStats,
} from '../controllers/postsController.js'
import { optionalAuth, verifyToken } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { postSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// Public listing and single post retrieval
router.get('/', validate(postSchemas.query, 'query'), optionalAuth, getPosts)
router.get('/stats/overview', getPostStats)
router.get('/:idOrSlug', optionalAuth, getPostByIdOrSlug)

// Protected post editing actions
router.post('/', verifyToken, validate(postSchemas.create), createPost)
router.put('/:id', verifyToken, validate(postSchemas.update), updatePost)
router.delete('/:id', verifyToken, deletePost)
router.patch('/:id/status', verifyToken, validate(postSchemas.status), updatePostStatus)

export default router
