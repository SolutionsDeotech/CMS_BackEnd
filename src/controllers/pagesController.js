import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify } from '../utils/helpers.js'
import store from '../services/store.js'

export const getPages = asyncHandler(async (req, res) => {
  const { parent, status, q, clientId = 'cli-1' } = req.query

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

  return sendSuccess(res, pages, 'Pages retrieved successfully')
})

export const getPageByIdOrSlug = asyncHandler(async (req, res, next) => {
  const { slugOrId } = req.params

  const page = store.pages.find(
    (p) =>
      String(p.id) === String(slugOrId) ||
      p.slug === slugOrId ||
      p.title.toLowerCase() === slugOrId.toLowerCase()
  )

  if (!page) {
    return next(new AppError(`Page not found with identifier: ${slugOrId}`, 404))
  }

  return sendSuccess(res, page, 'Page details retrieved')
})

export const createPage = asyncHandler(async (req, res, next) => {
  const { title, slug, type = 'Core Page', parent = '—', showInMenu = true, status = 'published', sections = {}, clientId = 'cli-1' } = req.body

  if (!title) {
    return next(new AppError('Page title is required', 400))
  }

  const newPage = {
    id: Date.now(),
    customId: Date.now(),
    title,
    slug: slug ? slugify(slug) : slugify(title),
    type,
    parent,
    status,
    showInMenu,
    drillDown: title === 'Services' ? 'Services' : null,
    updated: 'Just now',
    updatedBy: req.user?.name || 'Admin',
    sections,
    clientId,
    createdAt: new Date().toISOString(),
  }

  store.pages.push(newPage)
  return sendSuccess(res, newPage, 'Page created successfully', 201)
})

export const updatePage = asyncHandler(async (req, res, next) => {
  const { slugOrId } = req.params
  const updates = req.body

  const page = store.pages.find(
    (p) =>
      String(p.id) === String(slugOrId) ||
      p.slug === slugOrId ||
      p.title.toLowerCase() === slugOrId.toLowerCase()
  )

  if (!page) {
    return next(new AppError(`Page not found with identifier: ${slugOrId}`, 404))
  }

  Object.assign(page, updates, {
    updated: 'Just now',
    updatedBy: req.user?.name || 'Admin',
    updatedAt: new Date().toISOString(),
  })

  return sendSuccess(res, page, 'Page updated successfully')
})

export const deletePage = asyncHandler(async (req, res, next) => {
  const { slugOrId } = req.params
  const initialLen = store.pages.length

  store.pages = store.pages.filter(
    (p) =>
      String(p.id) !== String(slugOrId) &&
      p.slug !== slugOrId &&
      p.title.toLowerCase() !== slugOrId.toLowerCase()
  )

  if (store.pages.length === initialLen) {
    return next(new AppError('Page not found', 404))
  }

  return sendSuccess(res, null, 'Page deleted successfully')
})
