import LandingPageConfig from '../models/LandingPageConfig.js'
import store from '../services/store.js'
import { isDbConnected } from '../config/db.js'
import { defaultLandingPageConfig } from '../data/landingPageDefaults.js'
import logger from '../utils/logger.js'

// Deep merge helper ensuring every single property and array exists with full fallback defaults
export const mergeWithDefaults = (existing) => {
  const defaults = JSON.parse(JSON.stringify(defaultLandingPageConfig))
  if (!existing) return defaults

  return {
    ...defaults,
    ...existing,
    key: 'main_landing_page',
    header: {
      ...defaults.header,
      ...(existing.header || {}),
    },
    announcement: {
      ...defaults.announcement,
      ...(existing.announcement || {}),
    },
    hero: {
      ...defaults.hero,
      ...(existing.hero || {}),
    },
    sectionsMeta: {
      ...defaults.sectionsMeta,
      ...(existing.sectionsMeta || {}),
    },
    guaranteeBanner: {
      ...defaults.guaranteeBanner,
      ...(existing.guaranteeBanner || {}),
    },
    ctaBanner: {
      ...defaults.ctaBanner,
      ...(existing.ctaBanner || {}),
    },
    footer: {
      ...defaults.footer,
      ...(existing.footer || {}),
    },
    trustBadges: Array.isArray(existing.trustBadges) && existing.trustBadges.length > 0
      ? existing.trustBadges
      : defaults.trustBadges,
    whyUs: Array.isArray(existing.whyUs) && existing.whyUs.length > 0
      ? existing.whyUs
      : defaults.whyUs,
    features: Array.isArray(existing.features) && existing.features.length > 0
      ? existing.features
      : defaults.features,
    comparison: Array.isArray(existing.comparison) && existing.comparison.length > 0
      ? existing.comparison
      : defaults.comparison,
    faqs: Array.isArray(existing.faqs) && existing.faqs.length > 0
      ? existing.faqs
      : defaults.faqs,
  }
}

export const getLandingPageConfig = async (req, res, next) => {
  try {
    let config = null
    if (isDbConnected()) {
      config = await LandingPageConfig.findOne({ key: 'main_landing_page' }).lean()
      if (!config) {
        // Auto-seed in MongoDB on first retrieval so it's permanently stored
        try {
          const seeded = await LandingPageConfig.create(defaultLandingPageConfig)
          config = seeded.toObject ? seeded.toObject() : seeded
          logger.info('Auto-seeded default LandingPageConfig into MongoDB.')
        } catch (seedErr) {
          logger.warn(`Non-blocking error auto-seeding LandingPageConfig: ${seedErr.message}`)
        }
      }
    }

    if (!config) {
      config = store.landingPageConfig || defaultLandingPageConfig
    }

    const fullConfig = mergeWithDefaults(config)

    res.status(200).json({
      success: true,
      message: 'Landing page configuration retrieved successfully.',
      data: fullConfig,
    })
  } catch (error) {
    logger.error(`Error in getLandingPageConfig: ${error.message}`)
    next(error)
  }
}

export const updateLandingPageConfig = async (req, res, next) => {
  try {
    const rawUpdate = req.body || {}
    rawUpdate.updatedBy = req.user?.name || req.user?.email || 'SuperAdmin'
    rawUpdate.key = 'main_landing_page'

    // Get current config for clean deep merge
    let current = null
    if (isDbConnected()) {
      current = await LandingPageConfig.findOne({ key: 'main_landing_page' }).lean()
    }
    if (!current) {
      current = store.landingPageConfig || defaultLandingPageConfig
    }

    const mergedToSave = mergeWithDefaults({
      ...current,
      ...rawUpdate,
      header: { ...(current.header || {}), ...(rawUpdate.header || {}) },
      announcement: { ...(current.announcement || {}), ...(rawUpdate.announcement || {}) },
      hero: { ...(current.hero || {}), ...(rawUpdate.hero || {}) },
      sectionsMeta: { ...(current.sectionsMeta || {}), ...(rawUpdate.sectionsMeta || {}) },
      guaranteeBanner: { ...(current.guaranteeBanner || {}), ...(rawUpdate.guaranteeBanner || {}) },
      ctaBanner: { ...(current.ctaBanner || {}), ...(rawUpdate.ctaBanner || {}) },
      footer: { ...(current.footer || {}), ...(rawUpdate.footer || {}) },
      trustBadges: Array.isArray(rawUpdate.trustBadges) && rawUpdate.trustBadges.length > 0 ? rawUpdate.trustBadges : current.trustBadges,
      whyUs: Array.isArray(rawUpdate.whyUs) && rawUpdate.whyUs.length > 0 ? rawUpdate.whyUs : current.whyUs,
      features: Array.isArray(rawUpdate.features) && rawUpdate.features.length > 0 ? rawUpdate.features : current.features,
      comparison: Array.isArray(rawUpdate.comparison) && rawUpdate.comparison.length > 0 ? rawUpdate.comparison : current.comparison,
      faqs: Array.isArray(rawUpdate.faqs) && rawUpdate.faqs.length > 0 ? rawUpdate.faqs : current.faqs,
    })

    let updatedConfig = null
    if (isDbConnected()) {
      updatedConfig = await LandingPageConfig.findOneAndUpdate(
        { key: 'main_landing_page' },
        { $set: mergedToSave },
        { new: true, upsert: true, runValidators: true }
      ).lean()
    }

    store.landingPageConfig = mergedToSave

    res.status(200).json({
      success: true,
      message: 'Landing page configuration updated successfully.',
      data: updatedConfig || mergedToSave,
    })
  } catch (error) {
    logger.error(`Error in updateLandingPageConfig: ${error.message}`)
    next(error)
  }
}

export const resetLandingPageConfig = async (req, res, next) => {
  try {
    const resetData = JSON.parse(JSON.stringify(defaultLandingPageConfig))
    resetData.updatedBy = req.user?.name || req.user?.email || 'SuperAdmin'

    if (isDbConnected()) {
      await LandingPageConfig.findOneAndUpdate(
        { key: 'main_landing_page' },
        { $set: resetData },
        { new: true, upsert: true }
      )
    }

    store.landingPageConfig = resetData

    res.status(200).json({
      success: true,
      message: 'Landing page configuration successfully reset to defaults.',
      data: resetData,
    })
  } catch (error) {
    logger.error(`Error in resetLandingPageConfig: ${error.message}`)
    next(error)
  }
}
