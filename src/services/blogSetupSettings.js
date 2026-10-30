import BlogSetupSetting from '../models/BlogSetupSetting.js'
import { isDbConnected } from '../config/db.js'

const memorySettings = new Map()

export async function getBlogSetupSetting(key, clientId = 'global', fallback = {}) {
  if (isDbConnected()) {
    const record = await BlogSetupSetting.findOne({ key, clientId }).lean()
    return record?.value ?? fallback
  }

  return memorySettings.get(`${clientId}:${key}`) ?? fallback
}

export async function saveBlogSetupSetting(key, clientId = 'global', value = {}) {
  if (isDbConnected()) {
    await BlogSetupSetting.findOneAndUpdate(
      { key, clientId },
      { $set: { value } },
      { upsert: true, new: true, runValidators: true }
    )
  }

  memorySettings.set(`${clientId}:${key}`, value)
  return value
}
