import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import store from '../services/store.js'
import Client from '../models/Client.js'
import User from '../models/User.js'
import { isDbConnected } from '../config/db.js'
import { PERMISSIONS } from '../config/constants.js'
import { getBlogSetupSetting, saveBlogSetupSetting } from '../services/blogSetupSettings.js'
import { sendWelcomeRegistrationEmail } from '../services/emailService.js'

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
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    let client = await Client.findOne({ $or: query })
    if (!client) {
      try {
        const onboardingSites = await getBlogSetupSetting('onboarding-websites', 'global', {})
        const site = onboardingSites[id] || Object.values(onboardingSites).find((s) => s && (s.id === id || s.clientId === id))
        if (site) {
          const siteUrl = site.url || site.wizard?.websiteUrl || site.wizard?.resultingUrl || ''
          const siteName = site.name || site.details?.blogName || 'Tenant Website'
          const isCompleted = Boolean(site.isCompleted || site.status === 'active')
          client = await Client.create({
            customId: site.id || id,
            websiteName: siteName,
            websiteUrl: siteUrl,
            industry: site.industry || 'Technology & Cloud',
            status: site.status || (isCompleted ? 'active' : 'pending'),
            onboarding: { isCompleted, completedAt: isCompleted ? new Date().toISOString() : null },
            clientAdmin: {
              name: 'Admin',
              email: 'admin@domain.com',
              phone: '',
              role: 'Client Admin',
            },
            theme: {
              websiteUrl: siteUrl,
              websiteName: siteName,
            },
            stats: { totalPosts: 0, writersCount: 0, monthlyViews: '0' },
            notes: site.details?.tagline || 'Onboarded publication',
          })
        }
      } catch (err) {
        // Fallback gracefully
      }
    }
    if (!client) {
      if (next) next(new AppError('Client not found', 404))
      return null
    }
    return client
  }

  let client = store.clients.find((item) => item.id === id || item.customId === id)
  if (!client) {
    try {
      const onboardingSites = await getBlogSetupSetting('onboarding-websites', 'global', {})
      const site = onboardingSites[id] || Object.values(onboardingSites).find((s) => s && (s.id === id || s.clientId === id))
      if (site) {
        const siteUrl = site.url || site.wizard?.websiteUrl || site.wizard?.resultingUrl || ''
        const siteName = site.name || site.details?.blogName || 'Tenant Website'
        const isCompleted = Boolean(site.isCompleted || site.status === 'active')
        client = {
          id: site.id || id,
          customId: site.id || id,
          websiteName: siteName,
          websiteUrl: siteUrl,
          industry: site.industry || 'Technology & Cloud',
          status: site.status || (isCompleted ? 'active' : 'pending'),
          onboarding: { isCompleted },
          clientAdmin: { name: 'Admin', email: 'admin@domain.com', phone: '', role: 'Client Admin' },
          theme: { websiteUrl: siteUrl, websiteName: siteName },
          stats: { totalPosts: 0, writersCount: 0, monthlyViews: '0' },
          notes: 'Onboarded publication',
        }
        store.clients.push(client)
      }
    } catch {}
  }

  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      if (next) next(new AppError('Database service is unavailable', 503))
      return null
    }
    if (next) next(new AppError('Client not found', 404))
    return null
  }
  return client
}

export const getClients = asyncHandler(async (req, res, next) => {
  const { industry, status, q } = req.query

  if (isDbConnected()) {
    const filter = {}
    if (industry && industry !== 'All Industries') filter.industry = industry
    if (status && status !== 'all') filter.status = status
    if (q) filter.websiteName = { $regex: q, $options: 'i' }

    let clients = await Client.find(filter).sort({ createdAt: -1 })

    // Auto-sync any onboarding websites that don't yet exist in the Client collection
    try {
      const onboardingSites = await getBlogSetupSetting('onboarding-websites', 'global', {})
      const existingIds = new Set(clients.map((c) => c.customId || String(c._id)))
      const missingSites = Object.values(onboardingSites).filter((s) => s && s.id && !existingIds.has(s.id))

      for (const site of missingSites) {
        try {
          const siteUrl = site.url || site.wizard?.websiteUrl || site.wizard?.resultingUrl || ''
          const siteName = site.name || site.details?.blogName || 'Tenant Website'
          const isCompleted = Boolean(site.isCompleted || site.status === 'active')
          const created = await Client.create({
            customId: site.id,
            websiteName: siteName,
            websiteUrl: siteUrl,
            industry: site.industry || 'Technology & Cloud',
            status: site.status || (isCompleted ? 'active' : 'pending'),
            onboarding: { isCompleted, completedAt: isCompleted ? new Date().toISOString() : null },
            clientAdmin: {
              name: 'Admin',
              email: 'admin@domain.com',
              phone: '',
              role: 'Client Admin',
            },
            theme: {
              websiteUrl: siteUrl,
              websiteName: siteName,
            },
            stats: { totalPosts: 0, writersCount: 0, monthlyViews: '0' },
            notes: site.details?.tagline || 'Onboarded publication',
          })
          clients.push(created)
        } catch {
          const existing = await Client.findOne({ customId: site.id })
          if (existing && !existingIds.has(site.id)) clients.push(existing)
        }
      }
    } catch {
      // Continue with retrieved clients
    }

    return sendSuccess(res, clients.map(normalizeClient), 'Clients retrieved successfully')
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  try {
    const onboardingSites = await getBlogSetupSetting('onboarding-websites', 'global', {})
    const existingIds = new Set(store.clients.map((c) => c.customId || c.id))
    Object.values(onboardingSites).forEach((site) => {
      if (site && site.id && !existingIds.has(site.id)) {
        const siteUrl = site.url || site.wizard?.websiteUrl || site.wizard?.resultingUrl || ''
        const siteName = site.name || site.details?.blogName || 'Tenant Website'
        store.clients.push({
          id: site.id,
          customId: site.id,
          websiteName: siteName,
          websiteUrl: siteUrl,
          industry: site.industry || 'Technology & Cloud',
          status: site.status || (site.isCompleted ? 'active' : 'pending'),
          clientAdmin: { name: 'Admin', email: 'admin@domain.com', phone: '', role: 'Client Admin' },
          theme: { websiteUrl: siteUrl, websiteName: siteName },
          stats: { totalPosts: 0, writersCount: 0, monthlyViews: '0' },
          notes: 'Onboarded publication',
        })
      }
    })
  } catch {}

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

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
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
  const adminPassword = clientAdmin?.password || req.body.adminPassword || 'TempPass123!'
  const adminEmail = clientAdmin?.email ? clientAdmin.email.trim().toLowerCase() : ''
  const adminName = clientAdmin?.name ? clientAdmin.name.trim() : (websiteName + ' Admin')

  const clientData = {
    customId,
    websiteName,
    websiteUrl,
    industry: industry || 'SaaS & Tech',
    status: 'active',
    clientAdmin: {
      name: adminName,
      email: adminEmail,
      phone: clientAdmin?.phone || '',
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

    // Requirement A.1 & Hierarchy: Provision Tenant Admin user account with password
    if (adminEmail) {
      let existingUser = await User.findOne({ email: adminEmail })
      if (!existingUser) {
        await User.create({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          role: 'OwnerAdmin',
          userType: 'Admin',
          permission: PERMISSIONS.FULL_ACCESS,
          clientId: customId,
          status: 'active',
          mustChangePassword: false,
          createdBy: req.user?._id || null,
          createdByEmail: req.user?.email || '',
        })
        sendWelcomeRegistrationEmail({
          email: adminEmail,
          name: adminName,
          role: 'Tenant Admin',
        }).catch((err) => console.error('Failed to send admin welcome email:', err))
      } else {
        existingUser.clientId = customId
        existingUser.role = 'OwnerAdmin'
        existingUser.userType = 'Admin'
        if (adminPassword) {
          existingUser.password = adminPassword
        }
        await existingUser.save()
      }
    }

    return sendSuccess(res, normalizeClient(created), 'Client onboarded successfully', 201)
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const newClient = {
    id: customId,
    ...clientData,
    createdAt: new Date().toISOString().split('T')[0],
  }

  store.clients.unshift(newClient)

  if (adminEmail) {
    const existingIndex = store.users.findIndex((u) => u.email?.toLowerCase() === adminEmail)
    if (existingIndex === -1) {
      store.users.push({
        _id: `usr-${Date.now()}`,
        id: `usr-${Date.now()}`,
        name: adminName,
        email: adminEmail,
        password: adminPassword,
        role: 'OwnerAdmin',
        userType: 'Admin',
        permission: PERMISSIONS.FULL_ACCESS,
        clientId: customId,
        status: 'active',
        mustChangePassword: false,
        createdBy: req.user?._id || null,
        createdByEmail: req.user?.email || '',
      })
      sendWelcomeRegistrationEmail({
        email: adminEmail,
        name: adminName,
        role: 'Tenant Admin',
      }).catch((err) => console.error('Failed to send admin welcome email:', err))
    }
  }

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

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
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

    const targetId = deleted.customId || id
    // Synchronize and remove from onboarding settings in blogsetupsettings
    const websites = await getBlogSetupSetting('onboarding-websites', 'global', {})
    if (websites[targetId] || websites[id]) {
      delete websites[targetId]
      delete websites[id]
      await saveBlogSetupSetting('onboarding-websites', 'global', websites)
    }

    // Unassign users mapped to this deleted client
    await User.updateMany({ clientId: { $in: [targetId, id] } }, { $set: { clientId: '' } })

    store.clients = store.clients.filter((c) => c.id !== targetId && c.customId !== targetId && c.id !== id && c.customId !== id)
    return sendSuccess(res, null, 'Client removed successfully')
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const initialLen = store.clients.length
  store.clients = store.clients.filter((c) => c.id !== id && c.customId !== id)

  const websites = await getBlogSetupSetting('onboarding-websites', 'global', {})
  if (websites[id]) {
    delete websites[id]
    await saveBlogSetupSetting('onboarding-websites', 'global', websites)
  }

  if (store.clients.length === initialLen) {
    return next(new AppError('Client not found', 404))
  }
  return sendSuccess(res, null, 'Client removed successfully')
})

export const getClientTheme = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const client = await getClientOrFail(id, next)
  if (!client) return

  const defaultTheme = {
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

  const clientObj = client.toObject ? client.toObject() : client
  const theme = {
    ...defaultTheme,
    ...(clientObj.theme || {}),
    id: clientObj.customId || clientObj.id || String(clientObj._id),
    clientId: clientObj.customId || clientObj.id || String(clientObj._id),
    clientName: clientObj.websiteName || clientObj.name || 'Tenant Website',
    websiteName: clientObj.websiteName || clientObj.name || clientObj.theme?.websiteName || 'Tenant Website',
    websiteUrl: clientObj.websiteUrl || clientObj.theme?.websiteUrl || '',
    status: clientObj.status || 'active',
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
