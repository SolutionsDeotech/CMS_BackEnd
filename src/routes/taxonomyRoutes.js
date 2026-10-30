import { Router } from 'express'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getTags,
  createTag,
  updateTag,
  deleteTag,
} from '../controllers/taxonomyController.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { taxonomySchemas } from '../middleware/validationSchemas.js'

export const categoryRouter = Router()
categoryRouter.get('/', validate(taxonomySchemas.query, 'query'), optionalAuth, getCategories)
categoryRouter.post('/', verifyToken, validate(taxonomySchemas.create), createCategory)
categoryRouter.put('/:id', verifyToken, validate(taxonomySchemas.update), updateCategory)
categoryRouter.delete('/:id', verifyToken, deleteCategory)

export const tagRouter = Router()
tagRouter.get('/', validate(taxonomySchemas.query, 'query'), optionalAuth, getTags)
tagRouter.post('/', verifyToken, validate(taxonomySchemas.create), createTag)
tagRouter.put('/:id', verifyToken, validate(taxonomySchemas.update), updateTag)
tagRouter.delete('/:id', verifyToken, deleteTag)
