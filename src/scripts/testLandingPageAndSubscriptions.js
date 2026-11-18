import assert from 'node:assert/strict'
import store from '../services/store.js'
import {
  getLandingPageConfig,
  updateLandingPageConfig,
  resetLandingPageConfig,
} from '../controllers/landingPageController.js'
import {
  getPublicSubscriptionPlans,
  getAllSubscriptionPlansAdmin,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  createSubscriber,
  getSubscribersAnalytics,
  updateSubscriberStatus,
  deleteSubscriber,
} from '../controllers/subscriptionController.js'

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    },
  }
  return res
}

function mockNext() {
  const next = (err) => {
    next.error = err
    next.called = true
  }
  next.error = null
  next.called = false
  return next
}

let passed = 0

function reportPass(msg) {
  passed++
  console.log(`  ✅ [PASS] ${msg}`)
}

async function runTests() {
  console.log('\n====================================================')
  console.log('🧪 TESTING LANDING PAGE & SUBSCRIPTION CONTROLLERS')
  console.log('====================================================\n')

  store.reset()

  // Test 1: Get Landing Page Config
  console.log('--- Test 1: Public GET Landing Page Config ---')
  const req1 = {}
  const res1 = mockResponse()
  const next1 = mockNext()
  await getLandingPageConfig(req1, res1, next1)
  assert.equal(res1.statusCode, 200)
  assert.equal(res1.body.success, true)
  assert.ok(res1.body.data.hero.title, 'Hero title must exist')
  reportPass('Landing page configuration returned successfully')

  // Test 2: Admin Updates Landing Page Config
  console.log('--- Test 2: Admin Updating Landing Page Config ---')
  const req2 = {
    user: { name: 'SuperAdmin User', email: 'admin@deotech.com', isPrimaryAdmin: true },
    body: {
      hero: {
        title: 'Custom Hero Title Configured by SuperAdmin',
        subtitle: 'Dynamic subtitle updated via SuperAdmin console',
      },
    },
  }
  const res2 = mockResponse()
  const next2 = mockNext()
  await updateLandingPageConfig(req2, res2, next2)
  assert.equal(res2.statusCode, 200)
  assert.equal(res2.body.success, true)
  assert.equal(res2.body.data.hero.title, 'Custom Hero Title Configured by SuperAdmin')
  assert.equal(store.landingPageConfig.hero.title, 'Custom Hero Title Configured by SuperAdmin')
  reportPass('Admin successfully updates landing page hero data in memory & DB')

  // Test 3: Public GET Subscription Plans (USD and INR)
  console.log('--- Test 3: Public GET Subscription Plans ---')
  const req3 = {}
  const res3 = mockResponse()
  const next3 = mockNext()
  await getPublicSubscriptionPlans(req3, res3, next3)
  assert.equal(res3.statusCode, 200)
  assert.equal(res3.body.success, true)
  assert.ok(Array.isArray(res3.body.data))
  const starter = res3.body.data.find((p) => p.planId === 'starter')
  assert.ok(starter, 'Starter plan must exist')
  assert.ok(starter.monthlyPriceUSD > 0, 'USD rate must be > 0')
  assert.ok(starter.monthlyPriceINR > 0, 'INR rate must be > 0')
  reportPass('Public subscription plans retrieved with both USD ($) and INR (₹) rates')

  // Test 4: Admin Creates New Subscription Plan
  console.log('--- Test 4: Admin Creates New Subscription Plan ---')
  const req4 = {
    user: { isPrimaryAdmin: true },
    body: {
      planId: 'agency-pro',
      name: 'Agency Elite',
      monthlyPriceUSD: 299,
      annualPriceUSD: 239,
      monthlyPriceINR: 24999,
      annualPriceINR: 19999,
      badge: 'VIP Agency',
      isPopular: false,
      isActive: true,
      features: ['White-Label Dedicated Cloud', '24/7 Phone SLA'],
    },
  }
  const res4 = mockResponse()
  const next4 = mockNext()
  await createSubscriptionPlan(req4, res4, next4)
  assert.equal(res4.statusCode, 201)
  assert.equal(res4.body.data.planId, 'agency-pro')
  assert.equal(res4.body.data.monthlyPriceINR, 24999)
  reportPass('Admin successfully creates a new subscription plan')

  // Test 5: Admin Edits Existing Subscription Plan
  console.log('--- Test 5: Admin Updates Subscription Plan ---')
  const req5 = {
    params: { id: 'agency-pro' },
    body: {
      monthlyPriceUSD: 349,
      monthlyPriceINR: 28999,
      badge: 'Exclusive Agency',
    },
  }
  const res5 = mockResponse()
  const next5 = mockNext()
  await updateSubscriptionPlan(req5, res5, next5)
  assert.equal(res5.statusCode, 200)
  assert.equal(res5.body.data.monthlyPriceUSD, 349)
  assert.equal(res5.body.data.badge, 'Exclusive Agency')
  reportPass('Admin successfully edits and updates subscription plan details')

  // Test 6: Public Subscription Creation (Checkout)
  console.log('--- Test 6: Public Subscription Checkout ---')
  const req6 = {
    body: {
      subscriberName: 'Test Dev User',
      subscriberEmail: 'test.subscriber@deotech.com',
      companyName: 'Dev Testing Studio',
      planId: 'agency-pro',
      billingCycle: 'annual',
      currency: 'INR',
      country: 'India',
      state: 'Maharashtra',
      city: 'Pune',
    },
  }
  const res6 = mockResponse()
  const next6 = mockNext()
  await createSubscriber(req6, res6, next6)
  assert.equal(res6.statusCode, 201)
  assert.equal(res6.body.data.subscriberEmail, 'test.subscriber@deotech.com')
  assert.equal(res6.body.data.currency, 'INR')
  assert.ok(res6.body.data.amount > 0, 'Amount must be calculated from plan')
  reportPass('Public subscriber successfully checkout / records subscription')

  // Test 7: Super Admin Revenue & Subscriber Analytics
  console.log('--- Test 7: Super Admin Revenue & Subscriber Analytics ---')
  const req7 = {
    query: { dateRange: 'all', country: 'all', state: 'all' },
  }
  const res7 = mockResponse()
  const next7 = mockNext()
  await getSubscribersAnalytics(req7, res7, next7)
  assert.equal(res7.statusCode, 200)
  assert.equal(res7.body.success, true)
  assert.ok(res7.body.data.summary.totalSubscribers > 0, 'Must have subscribers')
  assert.ok(res7.body.data.summary.totalRevenueINR > 0, 'Must have INR revenue calculated')
  assert.ok(res7.body.data.summary.totalRevenueUSD > 0, 'Must have USD revenue calculated')
  assert.ok(res7.body.data.summary.mostPurchasedPlan.planName, 'Most purchased plan identified')
  assert.ok(Array.isArray(res7.body.data.planBreakdown), 'Plan breakdown returned')
  assert.ok(Array.isArray(res7.body.data.availableCountries), 'Countries list returned')
  reportPass('Revenue & subscriber analytics calculates totals, ARPU, and popular plan')

  // Test 8: Country & State Filter in Analytics
  console.log('--- Test 8: Country & State Filters in Analytics ---')
  const req8 = {
    query: { country: 'India', state: 'Maharashtra' },
  }
  const res8 = mockResponse()
  const next8 = mockNext()
  await getSubscribersAnalytics(req8, res8, next8)
  assert.equal(res8.statusCode, 200)
  assert.ok(res8.body.data.subscribers.length > 0, 'Should find Maharashtra subscribers')
  assert.ok(
    res8.body.data.subscribers.every((s) => s.state === 'Maharashtra'),
    'Every record must match Maharashtra state'
  )
  reportPass('State and Country filters accurately filter subscription records')

  // Test 9: Update Subscriber Status & Delete Plan
  console.log('--- Test 9: Update Status & Delete Plan ---')
  const subscriberId = res6.body.data._id
  const req9 = {
    params: { id: String(subscriberId) },
    body: { status: 'cancelled' },
  }
  const res9 = mockResponse()
  const next9 = mockNext()
  await updateSubscriberStatus(req9, res9, next9)
  assert.equal(res9.statusCode, 200)
  assert.equal(res9.body.data.status, 'cancelled')

  const req10 = { params: { id: 'agency-pro' } }
  const res10 = mockResponse()
  const next10 = mockNext()
  await deleteSubscriptionPlan(req10, res10, next10)
  assert.equal(res10.statusCode, 200)
  reportPass('Subscriber status updated and plan deleted successfully')

  console.log('\n====================================================')
  console.log(`🎉 ALL ${passed} LANDING PAGE & SUBSCRIPTION TESTS PASSED!`)
  console.log('====================================================\n')
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})
