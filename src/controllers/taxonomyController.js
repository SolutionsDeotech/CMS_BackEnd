import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify } from '../utils/helpers.js'
import store from '../services/store.js'
import Category from '../models/Category.js'
import Tag from '../models/Tag.js'
import { isDbConnected } from '../config/db.js'
import { resolveClientId } from './postsController.js'
import { isGlobalAdminUser } from '../middleware/auth.js'

function normalizeCategory(c) {
  const item = c?.toObject ? c.toObject() : c
  return {
    ...item,
    id: item.customId || String(item._id || item.id),
  }
}

function normalizeTag(t) {
  const item = t?.toObject ? t.toObject() : t
  return {
    ...item,
    id: item.customId || String(item._id || item.id),
  }
}

// Categories
export const getCategories = asyncHandler(async (req, res, next) => {
  let clientId = req.query?.clientId || req.headers?.['x-client-id'] || null
  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)

  // Enforce strict tenant isolation on public unauthenticated requests
  if (!user) {
    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      return next(new AppError('clientId is required for public category requests', 400))
    }
    if (clientId === 'all') {
      return next(new AppError('Public requests cannot query all tenants', 400))
    }
    clientId = await resolveClientId(clientId)
  } else if (!isGlobalAdmin && user.clientId) {
    clientId = await resolveClientId(user.clientId)
  } else {
    if (clientId === 'all') clientId = null
    else if (clientId) clientId = await resolveClientId(clientId)
    else if (user?.clientId) clientId = await resolveClientId(user.clientId)
  }

  if (isDbConnected()) {
    const filter = (clientId && clientId !== 'all') ? { clientId } : {}
    let categories = await Category.find(filter).sort({ createdAt: -1 })

    // Auto-seed default starter categories if client currently has none
    if (categories.length === 0 && clientId && clientId !== 'all') {
      const defaultCategories = [
        {
          customId: `cat-${Date.now()}-1`,
          clientId,
          name: 'Industry Insights',
          slug: 'industry-insights',
          description: 'Trends, analysis, and perspectives in your industry.',
          color: '#2563eb',
          count: 0,
          status: 'active',
        },
        {
          customId: `cat-${Date.now()}-2`,
          clientId,
          name: 'Guides & Tutorials',
          slug: 'guides-tutorials',
          description: 'Actionable how-to guides and technical walkthroughs.',
          color: '#059669',
          count: 0,
          status: 'active',
        },
        {
          customId: `cat-${Date.now()}-3`,
          clientId,
          name: 'Company News',
          slug: 'company-news',
          description: 'Product announcements, updates, and company stories.',
          color: '#7c3aed',
          count: 0,
          status: 'active',
        },
      ]
      try {
        categories = await Category.insertMany(defaultCategories)
      } catch (seedErr) {
        console.warn('Could not auto-seed starter categories:', seedErr.message)
      }
    }

    return sendSuccess(res, categories.map(normalizeCategory), 'Categories retrieved')
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const categories = store.categories.filter((c) => {
    if (clientId && clientId !== 'all' && c.clientId && c.clientId !== clientId) return false
    return true
  })
  return sendSuccess(res, categories.map(normalizeCategory), 'Categories retrieved')
})

export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, slug, description, color } = req.body
  if (!name) return next(new AppError('Category name is required', 400))

  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)
  const targetClientId = (!isGlobalAdmin && user?.clientId) ? user.clientId : (req.body?.clientId || req.headers?.['x-client-id'] || user?.clientId || null)

  const customId = `cat-${Date.now()}`
  const generatedSlug = slug ? slugify(slug) : slugify(name)

  if (isDbConnected()) {
    const newCat = await Category.create({
      customId,
      clientId: targetClientId,
      name,
      slug: generatedSlug,
      description: description || '',
      color: color || '#6b0d0d',
      count: 0,
      status: 'active',
    })
    return sendSuccess(res, normalizeCategory(newCat), 'Category created successfully', 201)
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const newCat = {
    id: customId,
    customId,
    clientId: targetClientId,
    name,
    slug: generatedSlug,
    description: description || '',
    color: color || '#6b0d0d',
    count: 0,
    status: 'active',
  }
  store.categories.push(newCat)
  return sendSuccess(res, newCat, 'Category created successfully', 201)
})

export const updateCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = { ...req.body }
  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)

  delete updates.clientId

  if (updates.name && !updates.slug) updates.slug = slugify(updates.name)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })

    const existing = await Category.findOne({ $or: query })
    if (!existing) return next(new AppError('Category not found', 404))

    if (!isGlobalAdmin && user?.clientId && existing.clientId !== user.clientId) {
      return next(new AppError('Tenant Isolation: Cannot update category of another website.', 403))
    }

    Object.assign(existing, updates)
    await existing.save()
    return sendSuccess(res, normalizeCategory(existing), 'Category updated successfully')
  }

  const cat = store.categories.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!cat) return next(new AppError('Category not found', 404))

  if (!isGlobalAdmin && user?.clientId && cat.clientId !== user.clientId) {
    return next(new AppError('Tenant Isolation: Cannot update category of another website.', 403))
  }

  Object.assign(cat, updates)
  return sendSuccess(res, cat, 'Category updated successfully')
})

export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })

    const existing = await Category.findOne({ $or: query })
    if (!existing) return next(new AppError('Category not found', 404))

    if (!isGlobalAdmin && user?.clientId && existing.clientId !== user.clientId) {
      return next(new AppError('Tenant Isolation: Cannot delete category of another website.', 403))
    }

    await Category.findByIdAndDelete(existing._id)
    return sendSuccess(res, null, 'Category deleted successfully')
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const cat = store.categories.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!cat) return next(new AppError('Category not found', 404))

  if (!isGlobalAdmin && user?.clientId && cat.clientId !== user.clientId) {
    return next(new AppError('Tenant Isolation: Cannot delete category of another website.', 403))
  }

  store.categories = store.categories.filter((c) => String(c.id) !== String(id) && c.customId !== id)
  return sendSuccess(res, null, 'Category deleted successfully')
})

// Tags
export const getTags = asyncHandler(async (req, res, next) => {
  let clientId = req.query?.clientId || req.headers?.['x-client-id'] || null
  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)

  // Enforce strict tenant isolation on public unauthenticated requests
  if (!user) {
    if (!clientId || typeof clientId !== 'string' || !clientId.trim()) {
      return next(new AppError('clientId is required for public tag requests', 400))
    }
    if (clientId === 'all') {
      return next(new AppError('Public requests cannot query all tenants', 400))
    }
    clientId = await resolveClientId(clientId)
  } else if (!isGlobalAdmin && user.clientId) {
    clientId = await resolveClientId(user.clientId)
  } else {
    if (clientId === 'all') clientId = null
    else if (clientId) clientId = await resolveClientId(clientId)
    else if (user?.clientId) clientId = await resolveClientId(user.clientId)
  }

  if (isDbConnected()) {
    const filter = (clientId && clientId !== 'all') ? { clientId } : {}
    let tags = await Tag.find(filter).sort({ createdAt: -1 })

    // Auto-seed default starter tags if client currently has none
    if (tags.length === 0 && clientId && clientId !== 'all') {
      const defaultTags = [
        {
          customId: `tag-${Date.now()}-1`,
          clientId,
          name: 'Featured',
          slug: 'featured',
          description: 'Highlighting top and featured articles',
          count: 0,
        },
        {
          customId: `tag-${Date.now()}-2`,
          clientId,
          name: 'Case Study',
          slug: 'case-study',
          description: 'Real customer results and success stories',
          count: 0,
        },
        {
          customId: `tag-${Date.now()}-3`,
          clientId,
          name: 'Best Practices',
          slug: 'best-practices',
          description: 'Actionable tips and standard operating procedures',
          count: 0,
        },
      ]
      try {
        tags = await Tag.insertMany(defaultTags)
      } catch (seedErr) {
        console.warn('Could not auto-seed starter tags:', seedErr.message)
      }
    }

    return sendSuccess(res, tags.map(normalizeTag), 'Tags retrieved')
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const tags = store.tags.filter((t) => {
    if (clientId && clientId !== 'all' && t.clientId && t.clientId !== clientId) return false
    return true
  })
  return sendSuccess(res, tags.map(normalizeTag), 'Tags retrieved')
})

export const createTag = asyncHandler(async (req, res, next) => {
  const { name, slug, description } = req.body
  if (!name) return next(new AppError('Tag name is required', 400))

  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)
  const targetClientId = (!isGlobalAdmin && user?.clientId) ? user.clientId : (req.body?.clientId || req.headers?.['x-client-id'] || user?.clientId || null)

  const customId = `tag-${Date.now()}`
  const generatedSlug = slug ? slugify(slug) : slugify(name)

  if (isDbConnected()) {
    const newTag = await Tag.create({
      customId,
      clientId: targetClientId,
      name,
      slug: generatedSlug,
      description: description || '',
      count: 0,
    })
    return sendSuccess(res, normalizeTag(newTag), 'Tag created successfully', 201)
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const newTag = {
    id: customId,
    customId,
    clientId: targetClientId,
    name,
    slug: generatedSlug,
    description: description || '',
    count: 0,
  }
  store.tags.push(newTag)
  return sendSuccess(res, newTag, 'Tag created successfully', 201)
})

export const updateTag = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = { ...req.body }
  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)

  delete updates.clientId
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })

    const existing = await Tag.findOne({ $or: query })
    if (!existing) return next(new AppError('Tag not found', 404))

    if (!isGlobalAdmin && user?.clientId && existing.clientId !== user.clientId) {
      return next(new AppError('Tenant Isolation: Cannot update tag of another website.', 403))
    }

    Object.assign(existing, updates)
    await existing.save()
    return sendSuccess(res, normalizeTag(existing), 'Tag updated successfully')
  }

  const tag = store.tags.find((t) => String(t.id) === String(id) || t.customId === id)
  if (!tag) return next(new AppError('Tag not found', 404))

  if (!isGlobalAdmin && user?.clientId && tag.clientId !== user.clientId) {
    return next(new AppError('Tenant Isolation: Cannot update tag of another website.', 403))
  }

  Object.assign(tag, updates)
  return sendSuccess(res, tag, 'Tag updated successfully')
})

export const deleteTag = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const user = req.user
  const isGlobalAdmin = isGlobalAdminUser(user)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })

    const existing = await Tag.findOne({ $or: query })
    if (!existing) return next(new AppError('Tag not found', 404))

    if (!isGlobalAdmin && user?.clientId && existing.clientId !== user.clientId) {
      return next(new AppError('Tenant Isolation: Cannot delete tag of another website.', 403))
    }

    await Tag.findByIdAndDelete(existing._id)
    return sendSuccess(res, null, 'Tag deleted successfully')
  }

  if (process.env.NODE_ENV === 'production') {
    return next(new AppError('Database service is unavailable', 503))
  }

  const tag = store.tags.find((t) => String(t.id) === String(id) || t.customId === id)
  if (!tag) return next(new AppError('Tag not found', 404))

  if (!isGlobalAdmin && user?.clientId && tag.clientId !== user.clientId) {
    return next(new AppError('Tenant Isolation: Cannot delete tag of another website.', 403))
  }

  store.tags = store.tags.filter((t) => String(t.id) !== String(id) && t.customId !== id)
  return sendSuccess(res, null, 'Tag deleted successfully')
})
