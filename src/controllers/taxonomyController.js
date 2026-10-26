import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify } from '../utils/helpers.js'
import store from '../services/store.js'

// Categories
export const getCategories = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const categories = store.categories.filter((c) => !clientId || c.clientId === clientId)
  return sendSuccess(res, categories, 'Categories retrieved')
})

export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, slug, description, color, clientId = 'cli-1' } = req.body
  if (!name) return next(new AppError('Category name is required', 400))

  const newCat = {
    id: `cat-${Date.now()}`,
    customId: `cat-${Date.now()}`,
    clientId,
    name,
    slug: slug ? slugify(slug) : slugify(name),
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
  const updates = req.body
  const cat = store.categories.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!cat) return next(new AppError('Category not found', 404))

  Object.assign(cat, updates)
  if (updates.name && !updates.slug) cat.slug = slugify(updates.name)

  return sendSuccess(res, cat, 'Category updated successfully')
})

export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const initialLen = store.categories.length
  store.categories = store.categories.filter((c) => String(c.id) !== String(id) && c.customId !== id)
  if (store.categories.length === initialLen) return next(new AppError('Category not found', 404))
  return sendSuccess(res, null, 'Category deleted successfully')
})

// Tags
export const getTags = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query
  const tags = store.tags.filter((t) => !clientId || t.clientId === clientId)
  return sendSuccess(res, tags, 'Tags retrieved')
})

export const createTag = asyncHandler(async (req, res, next) => {
  const { name, slug, description, clientId = 'cli-1' } = req.body
  if (!name) return next(new AppError('Tag name is required', 400))

  const newTag = {
    id: `tag-${Date.now()}`,
    customId: `tag-${Date.now()}`,
    clientId,
    name,
    slug: slug ? slugify(slug) : slugify(name),
    description: description || '',
    count: 0,
  }
  store.tags.push(newTag)
  return sendSuccess(res, newTag, 'Tag created successfully', 201)
})

export const updateTag = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const updates = req.body
  const tag = store.tags.find((t) => String(t.id) === String(id) || t.customId === id)
  if (!tag) return next(new AppError('Tag not found', 404))

  Object.assign(tag, updates)
  if (updates.name && !updates.slug) tag.slug = slugify(updates.name)

  return sendSuccess(res, tag, 'Tag updated successfully')
})

export const deleteTag = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const initialLen = store.tags.length
  store.tags = store.tags.filter((t) => String(t.id) !== String(id) && t.customId !== id)
  if (store.tags.length === initialLen) return next(new AppError('Tag not found', 404))
  return sendSuccess(res, null, 'Tag deleted successfully')
})
