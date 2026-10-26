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

const router = Router()

// Public auth routes
router.post('/register', register)
router.post('/login', authLimiter, login)
router.post('/forgot-password', authLimiter, forgotPassword)
router.post('/verify-otp', authLimiter, verifyOtp)
router.post('/reset-password', authLimiter, resetPassword)

// Protected user & profile routes
router.use(verifyToken)
router.get('/me', getMe)
router.put('/profile', updateProfile)
router.put('/change-password', changePassword)
router.get('/sessions', getActiveSessions)
router.post('/logout-all', logoutAllOtherSessions)
router.delete('/sessions/:sessionId', revokeSession)

export default router
