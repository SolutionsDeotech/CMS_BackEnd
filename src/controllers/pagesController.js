import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify } from '../utils/helpers.js'
import store from '../services/store.js'
import Page from '../models/Page.js'
import { isDbConnected } from '../config/db.js'

function normalizePage(page) {
  const value = page?.toObject ? page.toObject() : page
  return {
    ...value,
    id: value.id || value._id || value.customId,
    updated: value.updated || (value.updatedAt ? new Date(value.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Just now'),
  }
}

async function findPage(slugOrId) {
  if (isDbConnected()) {
    const query = [{ slug: slugOrId }, { title: new RegExp(`^${slugOrId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }]
    if (/^[0-9a-fA-F]{24}$/.test(slugOrId)) query.unshift({ _id: slugOrId })
    return Page.findOne({ $or: query })
  }
  return store.pages.find((page) =>
    String(page.id) === String(slugOrId) || page.slug === slugOrId || page.title.toLowerCase() === slugOrId.toLowerCase()
  )
}

export const getPages = asyncHandler(async (req, res) => {
  const { parent, status, q, clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = { clientId }
    if (parent) filter.parent = parent
    else filter.parent = { $in: [null, '', '—'] }
    if (status && status !== 'all') filter.status = status
    if (q) filter.title = { $regex: q, $options: 'i' }
    const pages = await Page.find(filter).sort({ updatedAt: -1 })
    return sendSuccess(res, pages.map(normalizePage), 'Pages retrieved successfully')
  }

  let pages = store.pages.filter((p) => {
    if (clientId && p.clientId && p.clientId !== clientId) return false
    if (parent) {
      if (p.parent !== parent) return false
    } else {
      if (p.parent && p.parent !== '—') return false
    }
    if (status && status !== 'all' && p.status !== status) return false
    if (q && !p.title.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return sendSuccess(res, pages.map(normalizePage), 'Pages retrieved successfully')
})

export const getPageByIdOrSlug = asyncHandler(async (req, res, next) => {
  const { slugOrId } = req.params

  const page = await findPage(slugOrId)

  if (!page) {
    return next(new AppError(`Page not found with identifier: ${slugOrId}`, 404))
  }

  return sendSuccess(res, normalizePage(page), 'Page details retrieved')
})

export const createPage = asyncHandler(async (req, res, next) => {
  const { title, slug, type = 'Core Page', parent = '—', showInMenu = true, status = 'published', sections = {}, clientId = 'cli-1' } = req.body

  if (!title) {
    return next(new AppError('Page title is required', 400))
  }

  const pageData = {
    customId: Date.now(),
    title,
    slug: slug ? slugify(slug) : slugify(title),
    type,
    parent,
    status,
    showInMenu,
    drillDown: title === 'Services' ? 'Services' : null,
    updatedBy: req.user?.name || 'Admin',
    sections,
    clientId,
  }

  const newPage = isDbConnected()
    ? await Page.create(pageData)
    : { ...pageData, id: pageData.customId, updated: 'Just now', createdAt: new Date().toISOString() }
  if (!isDbConnected()) store.pages.push(newPage)
  return sendSuccess(res, normalizePage(newPage), 'Page created successfully', 201)
})

export const updatePage = asyncHandler(async (req, res, next) => {
  const { slugOrId } = req.params
  const updates = req.body

  const page = await findPage(slugOrId)

  if (!page) {
    return next(new AppError(`Page not found with identifier: ${slugOrId}`, 404))
  }

  Object.assign(page, updates, { updatedBy: req.user?.name || 'Admin' })
  if (isDbConnected()) await page.save()
  else Object.assign(page, { updated: 'Just now', updatedAt: new Date().toISOString() })

  return sendSuccess(res, normalizePage(page), 'Page updated successfully')
})

export const deletePage = asyncHandler(async (req, res, next) => {
  const { slugOrId } = req.params
  if (isDbConnected()) {
    const page = await findPage(slugOrId)
    if (!page) return next(new AppError('Page not found', 404))
    await page.deleteOne()
  } else {
    const initialLen = store.pages.length
    store.pages = store.pages.filter(
      (p) => String(p.id) !== String(slugOrId) && p.slug !== slugOrId && p.title.toLowerCase() !== slugOrId.toLowerCase()
    )
    if (store.pages.length === initialLen) return next(new AppError('Page not found', 404))
  }

  return sendSuccess(res, null, 'Page deleted successfully')
})
