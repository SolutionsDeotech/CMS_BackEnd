import { Router } from 'express'
import {
  getPublicSubscriptionPlans,
  getAllSubscriptionPlansAdmin,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  createSubscriber,
  getSubscribersAnalytics,
  updateSubscriberStatus,
  deleteSubscriber,
} from '../controllers/subscriptionController.js'
import { verifyToken, requireAdmin } from '../middleware/auth.js'

const router = Router()

// Public routes
router.get('/plans', getPublicSubscriptionPlans)
router.post('/subscribe', createSubscriber)

// SuperAdmin protected routes for plan management
router.get('/admin/plans', verifyToken, requireAdmin, getAllSubscriptionPlansAdmin)
router.post('/admin/plans', verifyToken, requireAdmin, createSubscriptionPlan)
router.put('/admin/plans/:id', verifyToken, requireAdmin, updateSubscriptionPlan)
router.delete('/admin/plans/:id', verifyToken, requireAdmin, deleteSubscriptionPlan)

// SuperAdmin protected routes for revenue & subscriber analytics dashboard
router.get('/admin/analytics', verifyToken, requireAdmin, getSubscribersAnalytics)
router.patch('/admin/subscribers/:id/status', verifyToken, requireAdmin, updateSubscriberStatus)
router.delete('/admin/subscribers/:id', verifyToken, requireAdmin, deleteSubscriber)

export default router

