import { Router } from 'express'
import {
  getLandingPageConfig,
  updateLandingPageConfig,
  resetLandingPageConfig,
} from '../controllers/landingPageController.js'
import { verifyToken, requireAdmin } from '../middleware/auth.js'

const router = Router()

// Public route to fetch landing page content
router.get('/', getLandingPageConfig)

// SuperAdmin protected routes to edit or reset landing page content
router.put('/', verifyToken, requireAdmin, updateLandingPageConfig)
router.post('/reset', verifyToken, requireAdmin, resetLandingPageConfig)

export default router

