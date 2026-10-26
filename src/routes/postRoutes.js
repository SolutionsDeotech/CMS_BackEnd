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

const router = Router()

// Public listing and single post retrieval
router.get('/', optionalAuth, getPosts)
router.get('/stats/overview', getPostStats)
router.get('/:idOrSlug', optionalAuth, getPostByIdOrSlug)

// Protected post editing actions
router.post('/', verifyToken, createPost)
router.put('/:id', verifyToken, updatePost)
router.delete('/:id', verifyToken, deletePost)
router.patch('/:id/status', verifyToken, updatePostStatus)

export default router
