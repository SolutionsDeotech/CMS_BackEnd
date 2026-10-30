import { Router } from 'express'
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientTheme,
  updateClientTheme,
  detectThemeFromUrl,
  getClientThemeVersions,
  publishClientTheme,
  rollbackClientTheme,
  resetClientTheme,
} from '../controllers/clientsController.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { clientSchemas } from '../middleware/validationSchemas.js'
import { themeSchemas } from '../middleware/validationSchemas.js'

const router = Router()

router.get('/', validate(clientSchemas.query, 'query'), optionalAuth, getClients)
router.get('/:id', optionalAuth, getClientById)
router.post('/', verifyToken, validate(clientSchemas.create), createClient)
router.put('/:id', verifyToken, validate(clientSchemas.update), updateClient)
router.delete('/:id', verifyToken, deleteClient)

// Client theme endpoints
router.get('/:id/theme', optionalAuth, getClientTheme)
router.put('/:id/theme', verifyToken, validate(themeSchemas.update), updateClientTheme)
router.post('/:id/theme/detect', verifyToken, validate(themeSchemas.detect), detectThemeFromUrl)
router.get('/:id/theme/versions', optionalAuth, getClientThemeVersions)
router.post('/:id/theme/publish', verifyToken, validate(themeSchemas.publish), publishClientTheme)
router.post('/:id/theme/rollback/:version', verifyToken, validate(themeSchemas.empty), rollbackClientTheme)
router.post('/:id/theme/reset', verifyToken, validate(themeSchemas.empty), resetClientTheme)

export default router
