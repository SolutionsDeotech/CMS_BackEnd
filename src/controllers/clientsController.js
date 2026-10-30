import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import store from '../services/store.js'
import Client from '../models/Client.js'
import { isDbConnected } from '../config/db.js'

function normalizeClient(client) {
  const item = client?.toObject ? client.toObject() : client
  return {
    ...item,
    id: item.customId || String(item._id || item.id),
  }
}

const getClientOrFail = async (id, next) => {
  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const client = await Client.findOne({ $or: query })
    if (!client) {
      next(new AppError('Client not found', 404))
      return null
    }
    return client
  }

  const client = store.clients.find((item) => item.id === id || item.customId === id)
  if (!client) {
    next(new AppError('Client not found', 404))
    return null
  }
  return client
}

export const getClients = asyncHandler(async (req, res) => {
  const { industry, status, q } = req.query

  if (isDbConnected()) {
    const filter = {}
    if (industry && industry !== 'All Industries') filter.industry = industry
    if (status && status !== 'all') filter.status = status
    if (q) filter.websiteName = { $regex: q, $options: 'i' }

    const clients = await Client.find(filter).sort({ createdAt: -1 })
    return sendSuccess(res, clients.map(normalizeClient), 'Clients retrieved successfully')
  }

  let clients = store.clients.filter((c) => {
    if (industry && industry !== 'All Industries' && c.industry !== industry) return false
    if (status && status !== 'all' && c.status !== status) return false
    if (q && !c.websiteName.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return sendSuccess(res, clients.map(normalizeClient), 'Clients retrieved successfully')
})

export const getClientById = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const client = await Client.findOne({ $or: query })
    if (!client) return next(new AppError(`Client not found with id: ${id}`, 404))
    return sendSuccess(res, normalizeClient(client), 'Client details retrieved')
  }

  const client = store.clients.find((c) => c.id === id || c.customId === id)
  if (!client) {
    return next(new AppError(`Client not found with id: ${id}`, 404))
  }
  return sendSuccess(res, normalizeClient(client), 'Client details retrieved')
})

export const createClient = asyncHandler(async (req, res, next) => {
  const { websiteName, websiteUrl, industry, clientAdmin, notes } = req.body

  if (!websiteName || !websiteUrl) {
    return next(new AppError('Please provide websiteName and websiteUrl', 400))
  }

  const customId = `cli-${Date.now()}`
  const clientData = {
    customId,
    websiteName,
    websiteUrl,
    industry: industry || 'SaaS & Tech',
    status: 'active',
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

  if (isDbConnected()) {
    const created = await Client.create(clientData)
    return sendSuccess(res, normalizeClient(created), 'Client onboarded successfully', 201)
  }

  const newClient = {
    id: customId,
    ...clientData,
    createdAt: new Date().toISOString().split('T')[0],
  }

  store.clients.unshift(newClient)
  return sendSuccess(res, newClient, 'Client onboarded successfully', 201)
})

export const updateClient = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = req.body

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const client = await Client.findOneAndUpdate({ $or: query }, updates, { new: true, runValidators: true })
    if (!client) return next(new AppError('Client not found', 404))
    return sendSuccess(res, normalizeClient(client), 'Client updated successfully')
  }

  const client = store.clients.find((c) => c.id === id || c.customId === id)
  if (!client) {
    return next(new AppError('Client not found', 404))
  }

  Object.assign(client, updates)
  return sendSuccess(res, client, 'Client updated successfully')
})

export const deleteClient = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await Client.findOneAndDelete({ $or: query })
    if (!deleted) return next(new AppError('Client not found', 404))
    return sendSuccess(res, null, 'Client removed successfully')
  }

  const initialLen = store.clients.length
  store.clients = store.clients.filter((c) => c.id !== id && c.customId !== id)

  if (store.clients.length === initialLen) {
    return next(new AppError('Client not found', 404))
  }
  return sendSuccess(res, null, 'Client removed successfully')
})

export const getClientTheme = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const client = await getClientOrFail(id, next)
  if (!client) return

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

  const client = await getClientOrFail(id, next)
  if (!client) return

  client.theme = { ...client.theme, ...themeUpdates }
  if (isDbConnected()) {
    await Client.findByIdAndUpdate(client._id, { theme: client.theme })
  }
  return sendSuccess(res, client.theme, 'Client theme updated successfully')
})

// Theme history used by the Blog Setup theme editor. Draft saves do not create a
// version; only an explicit publish creates an immutable rollback point.
export const getClientThemeVersions = asyncHandler(async (req, res, next) => {
  const client = await getClientOrFail(req.params.id, next)
  if (!client) return
  return sendSuccess(res, client.themeVersions || [], 'Client theme version history retrieved')
})

export const publishClientTheme = asyncHandler(async (req, res, next) => {
  const client = await getClientOrFail(req.params.id, next)
  if (!client) return

  const { version, notes = '' } = req.body
  const versions = client.themeVersions || []
  const releaseVersion = version || `v${versions.length + 1}.0`
  if (versions.some((item) => item.version === releaseVersion)) {
    return next(new AppError('A theme version with this label already exists', 409))
  }

  const release = {
    version: releaseVersion,
    status: 'active',
    notes,
    publishedAt: new Date().toISOString(),
    theme: JSON.parse(JSON.stringify(client.theme || {})),
  }
  client.themeVersions = [release, ...versions.map((item) => ({ ...item, status: 'archived' }))]
  if (isDbConnected()) {
    await Client.findByIdAndUpdate(client._id, { themeVersions: client.themeVersions })
  }
  return sendSuccess(res, release, 'Client theme published successfully', 201)
})

export const rollbackClientTheme = asyncHandler(async (req, res, next) => {
  const client = await getClientOrFail(req.params.id, next)
  if (!client) return

  const release = (client.themeVersions || []).find((item) => item.version === req.params.version)
  if (!release) return next(new AppError('Theme version not found', 404))

  client.theme = JSON.parse(JSON.stringify(release.theme || {}))
  client.themeVersions = client.themeVersions.map((item) => ({
    ...item,
    status: item.version === release.version ? 'active' : 'archived',
  }))
  if (isDbConnected()) {
    await Client.findByIdAndUpdate(client._id, { theme: client.theme, themeVersions: client.themeVersions })
  }
  return sendSuccess(res, { theme: client.theme, release }, `Theme rolled back to ${release.version}`)
})

export const resetClientTheme = asyncHandler(async (req, res, next) => {
  const client = await getClientOrFail(req.params.id, next)
  if (!client) return
  client.theme = {}
  if (isDbConnected()) {
    await Client.findByIdAndUpdate(client._id, { theme: client.theme })
  }
  return sendSuccess(res, client.theme, 'Client theme reset to the system defaults')
})

export const detectThemeFromUrl = asyncHandler(async (req, res, next) => {
  const { url } = req.body
  if (!url) return next(new AppError('Please provide a website URL', 400))
  return sendSuccess(res, {
    configured: false,
    url,
    message: 'Automatic brand extraction is not configured. Enter theme tokens manually.',
  }, 'Automatic theme detection is unavailable')
})
