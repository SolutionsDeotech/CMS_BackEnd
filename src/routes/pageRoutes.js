import { Router } from 'express'
import {
  getPages,
  getPageByIdOrSlug,
  createPage,
  updatePage,
  deletePage,
} from '../controllers/pagesController.js'
import { verifyToken, optionalAuth, requireClientAdminOrHigher } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { pageSchemas } from '../middleware/validationSchemas.js'

const router = Router()

router.get('/', validate(pageSchemas.query, 'query'), optionalAuth, getPages)
router.get('/:slugOrId', optionalAuth, getPageByIdOrSlug)
router.post('/', verifyToken, requireClientAdminOrHigher, validate(pageSchemas.create), createPage)
router.put('/:slugOrId', verifyToken, requireClientAdminOrHigher, validate(pageSchemas.update), updatePage)
router.delete('/:slugOrId', verifyToken, requireClientAdminOrHigher, deletePage)

export default router
