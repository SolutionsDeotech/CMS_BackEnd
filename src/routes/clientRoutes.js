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
} from '../controllers/clientsController.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', optionalAuth, getClients)
router.get('/:id', optionalAuth, getClientById)
router.post('/', verifyToken, createClient)
router.put('/:id', verifyToken, updateClient)
router.delete('/:id', verifyToken, deleteClient)

// Client theme endpoints
router.get('/:id/theme', optionalAuth, getClientTheme)
router.put('/:id/theme', verifyToken, updateClientTheme)
router.post('/:id/theme/detect', verifyToken, detectThemeFromUrl)

export default router
