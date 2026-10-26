import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import store from '../services/store.js'

export const getClients = asyncHandler(async (req, res) => {
  const { industry, status, q } = req.query

  let clients = store.clients.filter((c) => {
    if (industry && industry !== 'All Industries' && c.industry !== industry) return false
    if (status && status !== 'all' && c.status !== status) return false
    if (q && !c.websiteName.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return sendSuccess(res, clients, 'Clients retrieved successfully')
})

export const getClientById = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const client = store.clients.find((c) => c.id === id || c.customId === id)

  if (!client) {
    return next(new AppError(`Client not found with id: ${id}`, 404))
  }
  return sendSuccess(res, client, 'Client details retrieved')
})

export const createClient = asyncHandler(async (req, res, next) => {
  const { websiteName, websiteUrl, industry, clientAdmin, notes } = req.body

  if (!websiteName || !websiteUrl) {
    return next(new AppError('Please provide websiteName and websiteUrl', 400))
  }

  const newClient = {
    id: `cli-${Date.now()}`,
    customId: `cli-${Date.now()}`,
    websiteName,
    websiteUrl,
    industry: industry || 'SaaS & Tech',
    status: 'active',
    createdAt: new Date().toISOString().split('T')[0],
    clientAdmin: clientAdmin || {
      name: '',
      email: '',
      phone: '',
      role: 'Client Admin',
    },
    stats: {
      totalPosts: 0,
      writersCount: 0,
      monthlyViews: '0',
    },
    notes: notes || '',
  }

  store.clients.unshift(newClient)
  return sendSuccess(res, newClient, 'Client onboarded successfully', 201)
})

export const updateClient = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = req.body

  const client = store.clients.find((c) => c.id === id || c.customId === id)
  if (!client) {
    return next(new AppError('Client not found', 404))
  }

  Object.assign(client, updates)
  return sendSuccess(res, client, 'Client updated successfully')
})

export const deleteClient = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const initialLen = store.clients.length
  store.clients = store.clients.filter((c) => c.id !== id && c.customId !== id)

  if (store.clients.length === initialLen) {
    return next(new AppError('Client not found', 404))
  }
  return sendSuccess(res, null, 'Client removed successfully')
})

export const getClientTheme = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const client = store.clients.find((c) => c.id === id || c.customId === id)
  if (!client) return next(new AppError('Client not found', 404))

  const theme = client.theme || {
    primaryColor: '#6b0d0d',
    secondaryColor: '#5a0a0a',
    accentColor: '#d97706',
    surfaceColor: '#ffffff',
    bodyBg: '#f9fafb',
    headerBg: '#6b0d0d',
    headerTextColor: '#ffffff',
    textColor: '#1f2937',
    mutedColor: '#6b7280',
    linkColor: '#2563eb',
    linkHoverColor: '#1d4ed8',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    headingFont: 'Outfit, system-ui, sans-serif',
    buttonRadius: '9999px',
    cardRadius: '14px',
    buttonStyle: 'filled',
    cardStyle: 'subtle-border',
  }

  return sendSuccess(res, theme, 'Client theme configuration')
})

export const updateClientTheme = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const themeUpdates = req.body

  const client = store.clients.find((c) => c.id === id || c.customId === id)
  if (!client) return next(new AppError('Client not found', 404))

  client.theme = { ...client.theme, ...themeUpdates }
  return sendSuccess(res, client.theme, 'Client theme updated successfully')
})

export const detectThemeFromUrl = asyncHandler(async (req, res) => {
  const { url } = req.body

  const detected = {
    url,
    primaryColor: '#6b0d0d',
    secondaryColor: '#5a0a0a',
    accentColor: '#d97706',
    surfaceColor: '#ffffff',
    bodyBg: '#f9fafb',
    headerBg: '#6b0d0d',
    headerTextColor: '#ffffff',
    textColor: '#1f2937',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    headingFont: 'Outfit, system-ui, sans-serif',
    buttonRadius: '9999px',
    confidenceScore: '98%',
    detectedAssets: ['favicon.ico', 'brand-logo.svg', 'primary-tokens.css'],
    designDrift: {
      hasDrift: false,
      detectedAt: 'Just now',
      driftAlert: 'All theme tokens are in sync with live website.',
      changes: [],
    },
  }

  return sendSuccess(res, detected, 'Brand theme successfully detected from website')
})
