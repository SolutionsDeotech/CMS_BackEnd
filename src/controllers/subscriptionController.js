import SubscriptionPlan from '../models/SubscriptionPlan.js'
import SubscriptionRecord from '../models/SubscriptionRecord.js'
import store from '../services/store.js'
import { isDbConnected } from '../config/db.js'
import { defaultSubscriptionPlans, initialSubscriptionRecords } from '../data/landingPageDefaults.js'
import logger from '../utils/logger.js'

// ==========================================
// 1. PUBLIC SUBSCRIPTION PLANS
// ==========================================
export const getPublicSubscriptionPlans = async (req, res, next) => {
  try {
    let plans = []
    if (isDbConnected()) {
      plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 }).lean()
      if (!plans || plans.length === 0) {
        try {
          await SubscriptionPlan.insertMany(defaultSubscriptionPlans)
          plans = await SubscriptionPlan.find({ isActive: true }).sort({ sortOrder: 1 }).lean()
          logger.info('Auto-seeded default subscription plans into MongoDB.')
        } catch (seedErr) {
          logger.warn(`Non-blocking error seeding plans: ${seedErr.message}`)
        }
      }
    }

    if (!plans || plans.length === 0) {
      plans = (store.subscriptionPlans || defaultSubscriptionPlans).filter((p) => p.isActive !== false)
    }

    res.status(200).json({
      success: true,
      message: 'Active subscription plans retrieved successfully.',
      data: plans,
    })
  } catch (error) {
    logger.error(`Error in getPublicSubscriptionPlans: ${error.message}`)
    next(error)
  }
}

// ==========================================
// 2. ADMIN SUBSCRIPTION PLANS MANAGEMENT
// ==========================================
export const getAllSubscriptionPlansAdmin = async (req, res, next) => {
  try {
    let plans = []
    if (isDbConnected()) {
      plans = await SubscriptionPlan.find().sort({ sortOrder: 1 }).lean()
      if (!plans || plans.length === 0) {
        try {
          await SubscriptionPlan.insertMany(defaultSubscriptionPlans)
          plans = await SubscriptionPlan.find().sort({ sortOrder: 1 }).lean()
          logger.info('Auto-seeded default subscription plans for admin in MongoDB.')
        } catch (seedErr) {
          logger.warn(`Non-blocking error seeding admin plans: ${seedErr.message}`)
        }
      }
    }

    if (!plans || plans.length === 0) {
      plans = store.subscriptionPlans || defaultSubscriptionPlans
    }

    res.status(200).json({
      success: true,
      message: 'All subscription plans retrieved successfully.',
      data: plans,
    })
  } catch (error) {
    logger.error(`Error in getAllSubscriptionPlansAdmin: ${error.message}`)
    next(error)
  }
}

export const createSubscriptionPlan = async (req, res, next) => {
  try {
    const {
      planId,
      name,
      tagline,
      monthlyPriceUSD,
      annualPriceUSD,
      monthlyPriceINR,
      annualPriceINR,
      badge,
      isPopular,
      isActive,
      buttonText,
      features,
      missingFeatures,
      sortOrder,
    } = req.body

    if (!planId || !name) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and Name are required.',
      })
    }

    const normalizedPlanId = planId.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '')

    const newPlanData = {
      planId: normalizedPlanId,
      name: name.trim(),
      tagline: tagline || '',
      monthlyPriceUSD: Number(monthlyPriceUSD) || 0,
      annualPriceUSD: Number(annualPriceUSD) || 0,
      monthlyPriceINR: Number(monthlyPriceINR) || 0,
      annualPriceINR: Number(annualPriceINR) || 0,
      badge: badge || '',
      isPopular: Boolean(isPopular),
      isActive: isActive !== false,
      buttonText: buttonText || 'Start Free Trial',
      features: Array.isArray(features) ? features : [],
      missingFeatures: Array.isArray(missingFeatures) ? missingFeatures : [],
      sortOrder: Number(sortOrder) || 0,
    }

    let savedPlan = null
    if (isDbConnected()) {
      const existing = await SubscriptionPlan.findOne({ planId: normalizedPlanId })
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `A plan with ID '${normalizedPlanId}' already exists.`,
        })
      }
      savedPlan = await SubscriptionPlan.create(newPlanData)
    }

    // In-memory store sync
    if (!store.subscriptionPlans) store.subscriptionPlans = [...defaultSubscriptionPlans]
    const memoryIdx = store.subscriptionPlans.findIndex((p) => p.planId === normalizedPlanId)
    if (memoryIdx >= 0) {
      store.subscriptionPlans[memoryIdx] = { ...newPlanData, _id: store.subscriptionPlans[memoryIdx]._id }
    } else {
      store.subscriptionPlans.push({ ...newPlanData, _id: `plan-${Date.now()}` })
    }

    res.status(201).json({
      success: true,
      message: 'Subscription plan created successfully.',
      data: savedPlan || newPlanData,
    })
  } catch (error) {
    logger.error(`Error in createSubscriptionPlan: ${error.message}`)
    next(error)
  }
}

export const updateSubscriptionPlan = async (req, res, next) => {
  try {
    const { id } = req.params
    const updateData = req.body || {}

    let updatedPlan = null
    if (isDbConnected()) {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        updatedPlan = await SubscriptionPlan.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean()
      }
      if (!updatedPlan) {
        updatedPlan = await SubscriptionPlan.findOneAndUpdate(
          { planId: id.toLowerCase() },
          { $set: updateData },
          { new: true }
        ).lean()
      }
    }

    // In-memory store sync
    if (!store.subscriptionPlans) store.subscriptionPlans = [...defaultSubscriptionPlans]
    const idx = store.subscriptionPlans.findIndex((p) => p.planId === id.toLowerCase() || String(p._id) === id)
    if (idx >= 0) {
      store.subscriptionPlans[idx] = { ...store.subscriptionPlans[idx], ...updateData }
      if (!updatedPlan) updatedPlan = store.subscriptionPlans[idx]
    }

    if (!updatedPlan) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found.',
      })
    }

    res.status(200).json({
      success: true,
      message: 'Subscription plan updated successfully.',
      data: updatedPlan,
    })
  } catch (error) {
    logger.error(`Error in updateSubscriptionPlan: ${error.message}`)
    next(error)
  }
}

export const deleteSubscriptionPlan = async (req, res, next) => {
  try {
    const { id } = req.params

    if (isDbConnected()) {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        await SubscriptionPlan.findByIdAndDelete(id)
      } else {
        await SubscriptionPlan.findOneAndDelete({ planId: id.toLowerCase() })
      }
    }

    // In-memory store sync
    if (store.subscriptionPlans) {
      store.subscriptionPlans = store.subscriptionPlans.filter(
        (p) => p.planId !== id.toLowerCase() && String(p._id) !== id
      )
    }

    res.status(200).json({
      success: true,
      message: 'Subscription plan deleted successfully.',
    })
  } catch (error) {
    logger.error(`Error in deleteSubscriptionPlan: ${error.message}`)
    next(error)
  }
}

// ==========================================
// 3. SUBSCRIBER CREATION / CHECKOUT
// ==========================================
export const createSubscriber = async (req, res, next) => {
  try {
    const {
      subscriberName,
      subscriberEmail,
      companyName,
      planId,
      billingCycle,
      currency,
      country,
      state,
      city,
      paymentMethod,
    } = req.body

    if (!subscriberName || !subscriberEmail || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and subscription plan are required.',
      })
    }

    // Lookup plan to determine correct amount
    let plan = null
    if (isDbConnected()) {
      plan = await SubscriptionPlan.findOne({ planId: planId.toLowerCase() }).lean()
    }
    if (!plan) {
      const plansList = store.subscriptionPlans || defaultSubscriptionPlans
      plan = plansList.find((p) => p.planId === planId.toLowerCase())
    }

    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly'
    const curr = currency === 'INR' ? 'INR' : 'USD'

    let amount = 0
    if (plan) {
      if (curr === 'INR') {
        amount = cycle === 'annual' ? (plan.annualPriceINR || 1199) * 12 : (plan.monthlyPriceINR || 1499)
      } else {
        amount = cycle === 'annual' ? (plan.annualPriceUSD || 15) * 12 : (plan.monthlyPriceUSD || 19)
      }
    } else {
      amount = curr === 'INR' ? 1499 : 19
    }

    const recordData = {
      subscriberName: subscriberName.trim(),
      subscriberEmail: subscriberEmail.toLowerCase().trim(),
      companyName: (companyName || '').trim(),
      planId: planId.toLowerCase(),
      planName: plan?.name || planId,
      billingCycle: cycle,
      currency: curr,
      amount,
      status: 'active',
      country: country || (curr === 'INR' ? 'India' : 'United States'),
      state: state || (curr === 'INR' ? 'Maharashtra' : 'California'),
      city: city || '',
      paymentMethod: paymentMethod || (curr === 'INR' ? 'upi' : 'credit_card'),
      startDate: new Date(),
      nextBillingDate: new Date(Date.now() + (cycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000),
    }

    let savedRecord = null
    if (isDbConnected()) {
      savedRecord = await SubscriptionRecord.create(recordData)
    }

    // Also push to in-memory store
    if (!store.subscriptionRecords) store.subscriptionRecords = [...initialSubscriptionRecords]
    const memoryRecord = {
      ...recordData,
      _id: savedRecord?._id ? String(savedRecord._id) : `sub-${Date.now()}`,
      createdAt: new Date().toISOString(),
    }
    store.subscriptionRecords.unshift(memoryRecord)

    res.status(201).json({
      success: true,
      message: 'Subscription created successfully!',
      data: savedRecord || memoryRecord,
    })
  } catch (error) {
    logger.error(`Error in createSubscriber: ${error.message}`)
    next(error)
  }
}

// ==========================================
// 4. SUPER ADMIN REVENUE & ANALYTICS DASHBOARD
// ==========================================
export const getSubscribersAnalytics = async (req, res, next) => {
  try {
    const {
      dateRange = 'all',
      startDate,
      endDate,
      country = 'all',
      state = 'all',
      planId = 'all',
      status = 'all',
      search = '',
    } = req.query

    let records = []
    if (isDbConnected()) {
      records = await SubscriptionRecord.find().sort({ createdAt: -1 }).lean()
      if (!records || records.length === 0) {
        try {
          await SubscriptionRecord.insertMany(initialSubscriptionRecords)
          records = await SubscriptionRecord.find().sort({ createdAt: -1 }).lean()
          logger.info('Auto-seeded initial subscription records into MongoDB.')
        } catch (seedErr) {
          logger.warn(`Non-blocking error seeding records: ${seedErr.message}`)
        }
      }
    }

    if (!records || records.length === 0) {
      records = store.subscriptionRecords || initialSubscriptionRecords
    }

    // Determine unique countries and states from records for filters
    const availableCountries = Array.from(new Set(records.map((r) => r.country).filter(Boolean))).sort()
    const availableStates = Array.from(
      new Set(
        records
          .filter((r) => (country === 'all' ? true : r.country === country))
          .map((r) => r.state)
          .filter(Boolean)
      )
    ).sort()

    // 1. Filter by Date Range
    const now = new Date()
    let rangeStart = null
    if (dateRange === '7d') {
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (dateRange === '30d') {
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else if (dateRange === '90d') {
      rangeStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    } else if (dateRange === '1y') {
      rangeStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    } else if (startDate) {
      rangeStart = new Date(startDate)
    }

    let filtered = records.filter((r) => {
      const recordDate = new Date(r.startDate || r.createdAt || Date.now())
      if (rangeStart && recordDate < rangeStart) return false
      if (endDate && recordDate > new Date(endDate)) return false
      return true
    })

    // 2. Filter by Country
    if (country && country !== 'all') {
      filtered = filtered.filter((r) => r.country?.toLowerCase() === country.toLowerCase())
    }

    // 3. Filter by State
    if (state && state !== 'all') {
      filtered = filtered.filter((r) => r.state?.toLowerCase() === state.toLowerCase())
    }

    // 4. Filter by Plan
    if (planId && planId !== 'all') {
      filtered = filtered.filter((r) => r.planId?.toLowerCase() === planId.toLowerCase())
    }

    // 5. Filter by Status
    if (status && status !== 'all') {
      filtered = filtered.filter((r) => r.status?.toLowerCase() === status.toLowerCase())
    }

    // 6. Search by name, email, or company
    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.subscriberName?.toLowerCase().includes(q) ||
          r.subscriberEmail?.toLowerCase().includes(q) ||
          r.companyName?.toLowerCase().includes(q)
      )
    }

    // Compute Metrics
    const totalSubscribers = filtered.length
    const activeSubscribers = filtered.filter((r) => r.status === 'active').length
    const trialingSubscribers = filtered.filter((r) => r.status === 'trialing').length
    const cancelledSubscribers = filtered.filter((r) => r.status === 'cancelled').length

    let totalRevenueUSD = 0
    let totalRevenueINR = 0

    filtered.forEach((r) => {
      if (r.status !== 'cancelled') {
        if (r.currency === 'INR') {
          totalRevenueINR += Number(r.amount) || 0
        } else {
          totalRevenueUSD += Number(r.amount) || 0
        }
      }
    })

    // Plan Popularity Breakdown
    const planCounts = {}
    const planRevenuesUSD = {}
    const planRevenuesINR = {}
    const planNames = {}

    filtered.forEach((r) => {
      const id = r.planId || 'starter'
      planCounts[id] = (planCounts[id] || 0) + 1
      planNames[id] = r.planName || id
      if (r.currency === 'INR') {
        planRevenuesINR[id] = (planRevenuesINR[id] || 0) + (Number(r.amount) || 0)
      } else {
        planRevenuesUSD[id] = (planRevenuesUSD[id] || 0) + (Number(r.amount) || 0)
      }
    })

    let mostPurchasedPlanId = ''
    let maxPurchases = 0

    const planBreakdown = Object.keys(planCounts).map((pId) => {
      const count = planCounts[pId]
      if (count > maxPurchases) {
        maxPurchases = count
        mostPurchasedPlanId = pId
      }
      return {
        planId: pId,
        planName: planNames[pId],
        count,
        percentage: totalSubscribers > 0 ? Math.round((count / totalSubscribers) * 100) : 0,
        revenueUSD: planRevenuesUSD[pId] || 0,
        revenueINR: planRevenuesINR[pId] || 0,
      }
    })

    const mostPurchasedPlan = {
      planId: mostPurchasedPlanId,
      planName: planNames[mostPurchasedPlanId] || 'None',
      count: maxPurchases,
      percentage: totalSubscribers > 0 ? Math.round((maxPurchases / totalSubscribers) * 100) : 0,
    }

    res.status(200).json({
      success: true,
      message: 'Subscribers and revenue analytics calculated successfully.',
      data: {
        summary: {
          totalSubscribers,
          activeSubscribers,
          trialingSubscribers,
          cancelledSubscribers,
          totalRevenueUSD,
          totalRevenueINR,
          mostPurchasedPlan,
        },
        planBreakdown,
        availableCountries,
        availableStates,
        subscribers: filtered,
      },
    })
  } catch (error) {
    logger.error(`Error in getSubscribersAnalytics: ${error.message}`)
    next(error)
  }
}

export const updateSubscriberStatus = async (req, res, next) => {
  try {
    const { id } = req.params
    const { status } = req.body

    if (!['active', 'trialing', 'cancelled', 'expired'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subscriber status value.',
      })
    }

    let updated = null
    if (isDbConnected()) {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        updated = await SubscriptionRecord.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean()
      }
    }

    if (store.subscriptionRecords) {
      const idx = store.subscriptionRecords.findIndex((r) => String(r._id) === id)
      if (idx >= 0) {
        store.subscriptionRecords[idx].status = status
        if (!updated) updated = store.subscriptionRecords[idx]
      }
    }

    res.status(200).json({
      success: true,
      message: `Subscriber status updated to ${status}.`,
      data: updated,
    })
  } catch (error) {
    logger.error(`Error in updateSubscriberStatus: ${error.message}`)
    next(error)
  }
}

export const deleteSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params

    if (isDbConnected()) {
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        await SubscriptionRecord.findByIdAndDelete(id)
      }
    }

    if (store.subscriptionRecords) {
      store.subscriptionRecords = store.subscriptionRecords.filter((r) => String(r._id) !== id)
    }

    res.status(200).json({
      success: true,
      message: 'Subscriber record deleted successfully.',
    })
  } catch (error) {
    logger.error(`Error in deleteSubscriber: ${error.message}`)
    next(error)
  }
}

