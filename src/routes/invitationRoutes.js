import { Router } from 'express'
import {
  verifyInvitationToken,
  acceptInvitation,
  getInvitations,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  sendNewsletterCampaign,
  getEmailLogs,
} from '../controllers/invitationController.js'
import { verifyToken, requireClientAdminOrHigher, requireAdmin } from '../middleware/auth.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { validate } from '../middleware/validate.js'
import { invitationSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// Public invitation verification & acceptance
router.get('/verify/:token', authLimiter, verifyInvitationToken)
router.post('/accept/:token', authLimiter, validate(invitationSchemas.accept), acceptInvitation)

// Protected invitation management
router.use(verifyToken)
router.get('/', requireClientAdminOrHigher, getInvitations)
router.post('/', requireClientAdminOrHigher, validate(invitationSchemas.create), createInvitation)
router.post('/:id/resend', requireClientAdminOrHigher, resendInvitation)
router.delete('/:id', requireClientAdminOrHigher, revokeInvitation)

export default router

export const emailRoutes = Router()
emailRoutes.use(verifyToken)
emailRoutes.get('/logs', requireClientAdminOrHigher, getEmailLogs)
emailRoutes.post('/campaign', requireClientAdminOrHigher, validate(invitationSchemas.campaign), sendNewsletterCampaign)
