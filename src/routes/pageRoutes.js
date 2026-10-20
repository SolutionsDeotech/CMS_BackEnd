import { Router } from 'express'
import {
  getPages,
  getPageByIdOrSlug,
  createPage,
  updatePage,
  deletePage,
} from '../controllers/pagesController.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', optionalAuth, getPages)
router.get('/:slugOrId', optionalAuth, getPageByIdOrSlug)
router.post('/', verifyToken, createPage)
router.put('/:slugOrId', verifyToken, updatePage)
router.delete('/:slugOrId', verifyToken, deletePage)

export default router
