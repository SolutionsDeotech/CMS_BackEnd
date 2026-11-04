import { Router } from 'express'
import {
  getAnalyticsOverview,
  getTrafficSources,
  getDeviceBreakdown,
  getSearchPerformance,
  getSeoHealth,
  updateSeoTaskStatus,
  getRoles,
  createRole,
  updateRolePermission,
  deleteRole,
  getActivities,
  getRedirects,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  subscribeNewsletter,
  getSubscribers,
  updateSubscriber,
  deleteSubscriber,
} from '../controllers/opsController.js'
import { verifyToken, optionalAuth, requireAdmin, requireClientAdminOrHigher } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { opsSchemas, themeSchemas } from '../middleware/validationSchemas.js'

export const opsRouter = Router()

// Analytics
opsRouter.get('/analytics/overview', optionalAuth, getAnalyticsOverview)
opsRouter.get('/analytics/traffic-sources', optionalAuth, getTrafficSources)
opsRouter.get('/analytics/devices', optionalAuth, getDeviceBreakdown)

// SEO & Search Performance
opsRouter.get('/seo/performance', optionalAuth, getSearchPerformance)
opsRouter.get('/seo/health', optionalAuth, getSeoHealth)
opsRouter.patch('/seo/issues/:id', verifyToken, validate(opsSchemas.seoTask), updateSeoTaskStatus)

// User Roles & Permissions (Admin & Tenant Admin)
opsRouter.get('/roles', optionalAuth, getRoles)
opsRouter.post('/roles', verifyToken, requireClientAdminOrHigher, createRole)
opsRouter.put('/roles/:id', verifyToken, requireClientAdminOrHigher, updateRolePermission)
opsRouter.delete('/roles/:id', verifyToken, requireClientAdminOrHigher, validate(themeSchemas.empty), deleteRole)

// Activity Log
opsRouter.get('/activity', optionalAuth, getActivities)

// Redirects Manager
opsRouter.get('/redirects', optionalAuth, getRedirects)
opsRouter.post('/redirects', verifyToken, requireClientAdminOrHigher, validate(opsSchemas.redirect), createRedirect)
opsRouter.put('/redirects/:id', verifyToken, requireClientAdminOrHigher, validate(opsSchemas.redirectUpdate), updateRedirect)
opsRouter.delete('/redirects/:id', verifyToken, requireClientAdminOrHigher, validate(themeSchemas.empty), deleteRedirect)

// Newsletter
opsRouter.post('/newsletter/subscribe', validate(opsSchemas.subscribe), subscribeNewsletter)
opsRouter.get('/newsletter/subscribers', verifyToken, getSubscribers)
opsRouter.patch('/newsletter/subscribers/:id', verifyToken, validate(opsSchemas.subscriberUpdate), updateSubscriber)
opsRouter.delete('/newsletter/subscribers/:id', verifyToken, validate(themeSchemas.empty), deleteSubscriber)
