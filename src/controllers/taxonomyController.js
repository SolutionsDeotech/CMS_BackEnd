import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, slugify } from '../utils/helpers.js'
import store from '../services/store.js'
import Category from '../models/Category.js'
import Tag from '../models/Tag.js'
import { isDbConnected } from '../config/db.js'

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
export const getCategories = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = clientId ? { clientId } : {}
    const categories = await Category.find(filter).sort({ createdAt: -1 })
    return sendSuccess(res, categories.map(normalizeCategory), 'Categories retrieved')
  }

  const categories = store.categories.filter((c) => !clientId || c.clientId === clientId)
  return sendSuccess(res, categories.map(normalizeCategory), 'Categories retrieved')
})

export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, slug, description, color, clientId = 'cli-1' } = req.body
  if (!name) return next(new AppError('Category name is required', 400))

  const customId = `cat-${Date.now()}`
  const generatedSlug = slug ? slugify(slug) : slugify(name)

  if (isDbConnected()) {
    const newCat = await Category.create({
      customId,
      clientId,
      name,
      slug: generatedSlug,
      description: description || '',
      color: color || '#6b0d0d',
      count: 0,
      status: 'active',
    })
    return sendSuccess(res, normalizeCategory(newCat), 'Category created successfully', 201)
  }

  const newCat = {
    id: customId,
    customId,
    clientId,
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
  const updates = req.body
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const cat = await Category.findOneAndUpdate({ $or: query }, updates, { new: true, runValidators: true })
    if (!cat) return next(new AppError('Category not found', 404))
    return sendSuccess(res, normalizeCategory(cat), 'Category updated successfully')
  }

  const cat = store.categories.find((c) => String(c.id) === String(id) || c.customId === id)
  if (!cat) return next(new AppError('Category not found', 404))

  Object.assign(cat, updates)
  return sendSuccess(res, cat, 'Category updated successfully')
})

export const deleteCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await Category.findOneAndDelete({ $or: query })
    if (!deleted) return next(new AppError('Category not found', 404))
    return sendSuccess(res, null, 'Category deleted successfully')
  }

  const initialLen = store.categories.length
  store.categories = store.categories.filter((c) => String(c.id) !== String(id) && c.customId !== id)
  if (store.categories.length === initialLen) return next(new AppError('Category not found', 404))
  return sendSuccess(res, null, 'Category deleted successfully')
})

// Tags
export const getTags = asyncHandler(async (req, res) => {
  const { clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = clientId ? { clientId } : {}
    const tags = await Tag.find(filter).sort({ createdAt: -1 })
    return sendSuccess(res, tags.map(normalizeTag), 'Tags retrieved')
  }

  const tags = store.tags.filter((t) => !clientId || t.clientId === clientId)
  return sendSuccess(res, tags.map(normalizeTag), 'Tags retrieved')
})

export const createTag = asyncHandler(async (req, res, next) => {
  const { name, slug, description, clientId = 'cli-1' } = req.body
  if (!name) return next(new AppError('Tag name is required', 400))

  const customId = `tag-${Date.now()}`
  const generatedSlug = slug ? slugify(slug) : slugify(name)

  if (isDbConnected()) {
    const newTag = await Tag.create({
      customId,
      clientId,
      name,
      slug: generatedSlug,
      description: description || '',
      count: 0,
    })
    return sendSuccess(res, normalizeTag(newTag), 'Tag created successfully', 201)
  }

  const newTag = {
    id: customId,
    customId,
    clientId,
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
  const updates = req.body
  if (updates.name && !updates.slug) updates.slug = slugify(updates.name)

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const tag = await Tag.findOneAndUpdate({ $or: query }, updates, { new: true, runValidators: true })
    if (!tag) return next(new AppError('Tag not found', 404))
    return sendSuccess(res, normalizeTag(tag), 'Tag updated successfully')
  }

  const tag = store.tags.find((t) => String(t.id) === String(id) || t.customId === id)
  if (!tag) return next(new AppError('Tag not found', 404))

  Object.assign(tag, updates)
  return sendSuccess(res, tag, 'Tag updated successfully')
})

export const deleteTag = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ customId: id }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await Tag.findOneAndDelete({ $or: query })
    if (!deleted) return next(new AppError('Tag not found', 404))
    return sendSuccess(res, null, 'Tag deleted successfully')
  }

  const initialLen = store.tags.length
  store.tags = store.tags.filter((t) => String(t.id) !== String(id) && t.customId !== id)
  if (store.tags.length === initialLen) return next(new AppError('Tag not found', 404))
  return sendSuccess(res, null, 'Tag deleted successfully')
})
