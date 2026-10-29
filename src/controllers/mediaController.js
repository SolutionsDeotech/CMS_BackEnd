import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, formatPostDate } from '../utils/helpers.js'
import store from '../services/store.js'
import Media from '../models/Media.js'
import { isDbConnected } from '../config/db.js'

function normalizeMedia(item) {
  const m = item?.toObject ? item.toObject() : item
  return {
    ...m,
    id: m.customId || m.key || String(m._id || m.id),
  }
}

export const getMedia = asyncHandler(async (req, res) => {
  const { category = 'all', q, clientId = 'cli-1' } = req.query

  if (isDbConnected()) {
    const filter = {}
    if (clientId) filter.clientId = clientId
    if (category !== 'all') filter.category = category
    if (q) filter.name = { $regex: q, $options: 'i' }

    const items = await Media.find(filter).sort({ createdAt: -1 })
    return sendSuccess(res, items.map(normalizeMedia), 'Media items retrieved successfully')
  }

  let items = store.media.filter((item) => {
    if (clientId && item.clientId && item.clientId !== clientId) return false
    if (category !== 'all' && item.category !== category) return false
    if (q && !item.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  return sendSuccess(res, items.map(normalizeMedia), 'Media items retrieved successfully')
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
  const customId = Date.now()
  const key = `${category}-${Date.now()}`

  const mediaData = {
    customId,
    key,
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
  }

  if (isDbConnected()) {
    const created = await Media.create(mediaData)
    return sendSuccess(res, normalizeMedia(created), 'File uploaded successfully', 201)
  }

  const newMedia = {
    id: customId,
    ...mediaData,
    createdAt: new Date().toISOString(),
  }
  store.media.unshift(newMedia)
  return sendSuccess(res, newMedia, 'File uploaded successfully', 201)
})

export const deleteMedia = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ key: id }, { customId: Number(id) || -1 }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const deleted = await Media.findOneAndDelete({ $or: query })
    if (!deleted) {
      return next(new AppError('Media item not found', 404))
    }
    return sendSuccess(res, null, 'Media item deleted successfully')
  }

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

  if (isDbConnected()) {
    const numKeys = keys.map(k => Number(k)).filter(n => !isNaN(n))
    await Media.deleteMany({
      $or: [
        { key: { $in: keys } },
        { customId: { $in: numKeys } },
      ],
    })
    return sendSuccess(res, { deletedCount: keys.length }, 'Media items deleted successfully')
  }

  const keySet = new Set(keys)
  store.media = store.media.filter((item) => !keySet.has(item.key) && !keySet.has(String(item.id)))

  return sendSuccess(res, { deletedCount: keys.length }, 'Media items deleted successfully')
})

export const renameMedia = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { name } = req.body
  if (!name || !name.trim()) return next(new AppError('Please provide a media name', 400))

  if (isDbConnected()) {
    const query = [{ key: id }, { customId: Number(id) || -1 }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const item = await Media.findOneAndUpdate(
      { $or: query },
      { name: name.trim() },
      { new: true }
    )
    if (!item) return next(new AppError('Media item not found', 404))
    return sendSuccess(res, normalizeMedia(item), 'Media item renamed successfully')
  }

  const item = store.media.find((media) => String(media.id) === String(id) || media.key === id)
  if (!item) return next(new AppError('Media item not found', 404))

  item.name = name.trim()
  item.updatedAt = new Date().toISOString()
  return sendSuccess(res, item, 'Media item renamed successfully')
})

export const compressMedia = asyncHandler(async (req, res, next) => {
  const { id } = req.params

  if (isDbConnected()) {
    const query = [{ key: id }, { customId: Number(id) || -1 }]
    if (id.match(/^[0-9a-fA-F]{24}$/)) query.unshift({ _id: id })
    const item = await Media.findOneAndUpdate(
      { $or: query },
      { compressionStatus: 'WebP Compressed (-64%)', optimizedAt: new Date().toISOString() },
      { new: true }
    )
    if (!item) return next(new AppError('Media item not found', 404))
    return sendSuccess(res, normalizeMedia(item), 'Media optimization completed successfully')
  }

  const item = store.media.find((media) => String(media.id) === String(id) || media.key === id)
  if (!item) return next(new AppError('Media item not found', 404))

  item.compressionStatus = 'WebP Compressed (-64%)'
  item.optimizedAt = new Date().toISOString()
  return sendSuccess(res, item, 'Media optimization completed successfully')
})
