import { Router } from 'express'
import {
  getAnalyticsOverview,
  getTrafficSources,
  getDeviceBreakdown,
  getSearchPerformance,
  getSeoHealth,
  getRoles,
  updateRolePermission,
  deleteRole,
  getActivities,
  getRedirects,
  createRedirect,
  deleteRedirect,
  subscribeNewsletter,
  getSubscribers,
} from '../controllers/opsController.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'

export const opsRouter = Router()

// Analytics
opsRouter.get('/analytics/overview', optionalAuth, getAnalyticsOverview)
opsRouter.get('/analytics/traffic-sources', optionalAuth, getTrafficSources)
opsRouter.get('/analytics/devices', optionalAuth, getDeviceBreakdown)

// SEO & Search Performance
opsRouter.get('/seo/performance', optionalAuth, getSearchPerformance)
opsRouter.get('/seo/health', optionalAuth, getSeoHealth)

// User Roles & Permissions
opsRouter.get('/roles', optionalAuth, getRoles)
opsRouter.put('/roles/:id', verifyToken, updateRolePermission)
opsRouter.delete('/roles/:id', verifyToken, deleteRole)

// Activity Log
opsRouter.get('/activity', optionalAuth, getActivities)

// Redirects Manager
opsRouter.get('/redirects', optionalAuth, getRedirects)
opsRouter.post('/redirects', verifyToken, createRedirect)
opsRouter.delete('/redirects/:id', verifyToken, deleteRedirect)

// Newsletter
opsRouter.post('/newsletter/subscribe', subscribeNewsletter)
opsRouter.get('/newsletter/subscribers', verifyToken, getSubscribers)
