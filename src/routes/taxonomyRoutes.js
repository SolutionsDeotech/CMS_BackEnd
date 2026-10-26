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

export const categoryRouter = Router()
categoryRouter.get('/', optionalAuth, getCategories)
categoryRouter.post('/', verifyToken, createCategory)
categoryRouter.put('/:id', verifyToken, updateCategory)
categoryRouter.delete('/:id', verifyToken, deleteCategory)

export const tagRouter = Router()
tagRouter.get('/', optionalAuth, getTags)
tagRouter.post('/', verifyToken, createTag)
tagRouter.put('/:id', verifyToken, updateTag)
tagRouter.delete('/:id', verifyToken, deleteTag)
