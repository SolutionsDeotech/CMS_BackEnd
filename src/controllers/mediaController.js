import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, formatPostDate } from '../utils/helpers.js'
import store from '../services/store.js'

export const getMedia = asyncHandler(async (req, res) => {
  const { category = 'all', q, clientId = 'cli-1' } = req.query

  let items = store.media.filter((item) => {
    if (clientId && item.clientId && item.clientId !== clientId) return false
    if (category !== 'all' && item.category !== category) return false
    if (q && !item.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return sendSuccess(res, items, 'Media items retrieved successfully')
})

export const uploadMedia = asyncHandler(async (req, res, next) => {
  if (!req.file && (!req.files || req.files.length === 0)) {
    return next(new AppError('No file uploaded', 400))
  }

  const file = req.file || req.files[0]
  const isImage = file.mimetype.startsWith('image/')
  const isVideo = file.mimetype.startsWith('video/')
  const category = isImage ? 'images' : isVideo ? 'videos' : 'documents'

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${category}/${file.filename}`

  const newMedia = {
    id: Date.now(),
    key: `${category}-${Date.now()}`,
    name: file.originalname,
    category,
    url: fileUrl,
    thumb: isImage ? fileUrl : 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&h=220&fit=crop',
    mimeType: file.mimetype,
    size: file.size,
    date: formatPostDate(),
    duration: isVideo ? '0 : 00' : null,
    fileType: category === 'documents' ? file.originalname.split('.').pop() : null,
    clientId: req.body.clientId || 'cli-1',
    createdAt: new Date().toISOString(),
  }

  store.media.unshift(newMedia)
  return sendSuccess(res, newMedia, 'File uploaded successfully', 201)
})

export const deleteMedia = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const initialLen = store.media.length
  store.media = store.media.filter((item) => String(item.id) !== String(id) && item.key !== id)

  if (store.media.length === initialLen) {
    return next(new AppError('Media item not found', 404))
  }
  return sendSuccess(res, null, 'Media item deleted successfully')
})

export const batchDeleteMedia = asyncHandler(async (req, res, next) => {
  const { keys } = req.body
  if (!keys || !Array.isArray(keys)) {
    return next(new AppError('Please provide an array of keys to delete', 400))
  }

  const keySet = new Set(keys)
  store.media = store.media.filter((item) => !keySet.has(item.key) && !keySet.has(String(item.id)))

  return sendSuccess(res, { deletedCount: keys.length }, 'Media items deleted successfully')
})
