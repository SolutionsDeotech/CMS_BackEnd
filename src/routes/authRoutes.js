import { Router } from 'express'
import {
  register,
  login,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getMe,
  updateProfile,
  changePassword,
  getActiveSessions,
  logoutAllOtherSessions,
  revokeSession,
} from '../controllers/authController.js'
import { verifyToken } from '../middleware/auth.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import validate from '../middleware/validator.js'
import { authSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// Public auth routes
router.post('/register', validate(authSchemas.register), register)
router.post('/login', authLimiter, validate(authSchemas.login), login)
router.post('/forgot-password', authLimiter, validate(authSchemas.email), forgotPassword)
router.post('/verify-otp', authLimiter, validate(authSchemas.verifyOtp), verifyOtp)
router.post('/reset-password', authLimiter, validate(authSchemas.resetPassword), resetPassword)

// Protected user & profile routes
router.use(verifyToken)
router.get('/me', getMe)
router.put('/profile', validate(authSchemas.profile), updateProfile)
router.put('/change-password', validate(authSchemas.changePassword), changePassword)
router.get('/sessions', getActiveSessions)
router.post('/logout-all', logoutAllOtherSessions)
router.delete('/sessions/:sessionId', revokeSession)

export default router
