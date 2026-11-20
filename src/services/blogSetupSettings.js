import BlogSetupSetting from '../models/BlogSetupSetting.js'
import { isDbConnected } from '../config/db.js'

const memorySettings = new Map()
const settingsCache = new Map()
const SETTINGS_CACHE_TTL_MS = 60 * 1000

export const clearSettingsCache = (key = null, clientId = 'global') => {
  if (key) {
    settingsCache.delete(`${clientId}:${key}`)
  } else {
    settingsCache.clear()
  }
}

export async function getBlogSetupSetting(key, clientId = 'global', fallback = {}) {
  const cacheKey = `${clientId}:${key}`
  const cached = settingsCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SETTINGS_CACHE_TTL_MS) {
    return cached.value
  }

  if (isDbConnected()) {
    const record = await BlogSetupSetting.findOne({ key, clientId }).lean()
    const val = record?.value ?? fallback
    settingsCache.set(cacheKey, { value: val, timestamp: Date.now() })
    return val
  }

  const val = memorySettings.get(cacheKey) ?? fallback
  settingsCache.set(cacheKey, { value: val, timestamp: Date.now() })
  return val
}

export async function saveBlogSetupSetting(key, clientId = 'global', value = {}) {
  const cacheKey = `${clientId}:${key}`
  if (isDbConnected()) {
    await BlogSetupSetting.findOneAndUpdate(
      { key, clientId },
      { $set: { value } },
      { upsert: true, new: true, runValidators: true }
    )
  }

  memorySettings.set(cacheKey, value)
  settingsCache.set(cacheKey, { value, timestamp: Date.now() })
  return value
}
