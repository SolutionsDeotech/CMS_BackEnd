import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import store from '../services/store.js'

export const getAnalyticsOverview = asyncHandler(async (req, res) => {
  const { range = 'last7Days' } = req.query

  const overview = {
    views: '14,820',
    uniqueVisitors: '9,410',
    avgReadTime: '4m 32s',
    bounceRate: '34.2%',
    viewsChange: '+18.4%',
    visitorsChange: '+12.1%',
    readTimeChange: '+8.6%',
    bounceChange: '-3.1%',
    chartData: [
      { date: 'Oct 14', views: 1840, visitors: 1120 },
      { date: 'Oct 15', views: 2450, visitors: 1540 },
      { date: 'Oct 16', views: 2190, visitors: 1390 },
      { date: 'Oct 17', views: 1980, visitors: 1240 },
      { date: 'Oct 18', views: 2310, visitors: 1480 },
      { date: 'Oct 19', views: 2620, visitors: 1680 },
      { date: 'Oct 20', views: 1430, visitors: 960 },
    ],
  }

  return sendSuccess(res, overview, 'Analytics overview retrieved')
})

export const getTrafficSources = asyncHandler(async (req, res) => {
  const sources = [
    { name: 'Organic Google Search', percentage: 48, visits: '28,036', color: '#2563eb' },
    { name: 'Direct URL Navigation', percentage: 24, visits: '14,018', color: '#6b0d0d' },
    { name: 'Social (LinkedIn & X)', percentage: 16, visits: '9,345', color: '#059669' },
    { name: 'Referral & Tech Blogs', percentage: 8, visits: '4,672', color: '#7c3aed' },
    { name: 'Weekly Newsletter', percentage: 4, visits: '2,336', color: '#d97706' },
  ]
  return sendSuccess(res, sources, 'Traffic sources breakdown')
})

export const getDeviceBreakdown = asyncHandler(async (req, res) => {
  const devices = [
    { device: 'Desktop Workstations', percentage: 65, icon: '🖥️' },
    { device: 'Mobile Smartphones', percentage: 31, icon: '📱' },
    { device: 'Tablet Devices', percentage: 4, icon: '📟' },
  ]
  return sendSuccess(res, devices, 'Device breakdown retrieved')
})

export const getSearchPerformance = asyncHandler(async (req, res) => {
  const performance = {
    clicks: '12.4K',
    impressions: '184.2K',
    avgCtr: '6.7%',
    avgPosition: '14.2',
    topQueries: [
      { query: 'micro-frontend design tokens', clicks: 1420, impressions: 18200, ctr: '7.8%', position: 3.4 },
      { query: 'edge caching strategies 2026', clicks: 980, impressions: 14100, ctr: '6.9%', position: 4.1 },
      { query: 'multi-tenant cms architecture', clicks: 840, impressions: 12500, ctr: '6.7%', position: 5.2 },
    ],
  }
  return sendSuccess(res, performance, 'Search console performance')
})

export const getSeoHealth = asyncHandler(async (req, res) => {
  const health = {
    score: 92,
    rating: 'Excellent',
    passedChecks: 23,
    totalChecks: 25,
    issues: [
      { type: 'warning', title: 'Missing meta description on 1 post', target: '/blog/compliance-pipelines' },
      { type: 'info', title: 'OpenGraph image aspect ratio could be optimized', target: '/blog/edge-caching' },
    ],
  }
  return sendSuccess(res, health, 'SEO Health audit status')
})

// Team & Roles
export const getRoles = asyncHandler(async (req, res) => {
  return sendSuccess(res, store.roles, 'Roles and permissions retrieved')
})

export const updateRolePermission = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { permission } = req.body
  const role = store.roles.find((r) => String(r.id) === String(id))
  if (!role) return next(new AppError('Role not found', 404))
  role.permission = permission
  return sendSuccess(res, role, 'Role permission updated successfully')
})

export const deleteRole = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  store.roles = store.roles.filter((r) => String(r.id) !== String(id))
  return sendSuccess(res, null, 'Role deleted successfully')
})

// Activity Log
export const getActivities = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const activities = store.activities.filter((a) => !clientId || a.clientId === clientId)
  return sendSuccess(res, activities, 'Activities retrieved')
})

// Redirects
export const getRedirects = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const redirects = store.redirects.filter((r) => !clientId || r.clientId === clientId)
  return sendSuccess(res, redirects, 'Redirects retrieved')
})

export const createRedirect = asyncHandler(async (req, res, next) => {
  const { sourceUrl, targetUrl, statusCode = 301, clientId = 'cli-1' } = req.body
  if (!sourceUrl || !targetUrl) return next(new AppError('Source and Target URLs required', 400))

  const newRedirect = {
    id: `red-${Date.now()}`,
    customId: `red-${Date.now()}`,
    clientId,
    sourceUrl,
    targetUrl,
    statusCode: Number(statusCode),
    hits: 0,
    status: 'active',
  }
  store.redirects.push(newRedirect)
  return sendSuccess(res, newRedirect, 'Redirect rule created', 201)
})

export const deleteRedirect = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  store.redirects = store.redirects.filter((r) => r.id !== id && r.customId !== id)
  return sendSuccess(res, null, 'Redirect rule deleted')
})

// Newsletter Subscribers
export const subscribeNewsletter = asyncHandler(async (req, res, next) => {
  const { email, source = 'Blog Footer', clientId = 'cli-1' } = req.body
  if (!email) return next(new AppError('Please provide an email address', 400))

  const existing = store.subscribers.find((s) => s.email.toLowerCase() === email.toLowerCase())
  if (existing) {
    return sendSuccess(res, existing, 'You are already subscribed to the newsletter!')
  }

  const sub = {
    id: `sub-${Date.now()}`,
    email: email.toLowerCase(),
    status: 'active',
    source,
    subscribedAt: new Date().toISOString().split('T')[0],
    clientId,
  }
  store.subscribers.push(sub)
  return sendSuccess(res, sub, 'Subscribed to newsletter successfully', 201)
})

export const getSubscribers = asyncHandler(async (req, res) => {
  return sendSuccess(res, store.subscribers, 'Subscribers list retrieved')
})
