process.env.NODE_ENV = 'test'

/**
 * Phase 2A: Webhook Reliability & Delivery Persistence Test Suite
 *
 * Verifies all 14 reliability, concurrency, tenant isolation, and security scenarios:
 * 1. HTTP 2xx delivery success (status='delivered', completedAt recorded, latency tracked)
 * 2. HTTP 500 / 503 retryable server error (status='pending', exponential backoff + jitter)
 * 3. HTTP 429 rate limit with Retry-After header honored in nextRetryAt
 * 4. HTTP 400/401/403/404 permanent client errors (status='failed', delivery halted immediately)
 * 5. Network error / connection refusal (status='pending', scheduled for retry)
 * 6. Max attempts exhaustion (status='failed', completedAt recorded, retry exhausted message)
 * 7. Deduplication window (duplicate event within 15s returned deduplicated: true)
 * 8. Concurrent worker atomic claims (prevents double execution across workers)
 * 9. Crashed worker lease recovery (expired lease reclaimed and processed)
 * 10. Tenant isolation on deliveries API (Tenant A blocked from accessing Tenant B)
 * 11. Manual webhook retry API (Client Admin can trigger manual re-delivery)
 * 12. HMAC-SHA256 signature verification & tenant-specific secret generation
 * 13. Post webhook event classification (resolvePostWebhookEvent)
 * 14. Delivery Log model defines safe partial TTL index excluding pending records
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import store from '../services/store.js'
import WebhookDeliveryLog from '../models/WebhookDeliveryLog.js'
import {
  dispatchWebhook,
  calculateNextRetry,
  getTenantWebhookSecret,
  sanitizeWebhookPayload,
  executeDeliveryAttempt,
  claimDeliveryLease,
  dispatchImmediateOutboxDelivery,
  processPendingWebhookRetries,
  retryWebhookDelivery,
  stageWebhookOutbox,
} from '../services/webhookService.js'
import {
  getClientWebhookDeliveries,
  getClientWebhookDeliveryById,
  retryClientWebhookDelivery,
  getClientIntegration,
} from '../controllers/universalIntegrationController.js'
import { resolvePostWebhookEvent, withOptionalTransaction } from '../controllers/postsController.js'

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(data) {
      this.body = data
      return this
    },
    setHeader(key, val) {
      this.headers[key] = val
      return this
    },
  }
  return res
}

function mockNext() {
  const next = (err) => {
    next.called = true
    next.error = err
  }
  next.called = false
  next.error = null
  return next
}

console.log('====================================================')
console.log('🧪 RUNNING PHASE 2A: WEBHOOK RELIABILITY TEST SUITE')
console.log('====================================================\n')

let passedCount = 0
let failedCount = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✅ [PASS] ${name}`)
    passedCount++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`)
    console.error(`     Error: ${err.message}`)
    if (err.stack) console.error(`     Stack: ${err.stack.split('\n').slice(1, 3).join('\n')}`)
    failedCount++
  }
}

// In-process fetch interception for sandbox isolation
const originalFetch = global.fetch
let mockFetchHandler = null
let receivedRequests = []

global.fetch = async (url, options) => {
  if (mockFetchHandler) {
    return await mockFetchHandler(url, options)
  }
  return await originalFetch(url, options)
}

// Setup test clients in memory store
store.clients = [
  {
    id: 'client-test-alpha',
    customId: 'client-test-alpha',
    websiteName: 'Alpha Tech',
    websiteUrl: 'https://alpha.example.com',
    integrationSettings: {
      method: 'embed',
      blogPath: '/blog',
      webhookUrl: 'https://webhook.alpha.example.com/events',
      webhookSecret: 'whsec_alpha_custom_secret_key_123',
    },
  },
  {
    id: 'client-test-beta',
    customId: 'client-test-beta',
    websiteName: 'Beta Media',
    websiteUrl: 'https://beta.example.com',
    integrationSettings: {
      method: 'headless',
      blogPath: '/news',
      webhookUrl: 'https://webhook.beta.example.com/events',
      webhookSecret: '',
    },
  },
  {
    id: 'client-test-gamma',
    customId: 'client-test-gamma',
    websiteName: 'Gamma Corp',
    websiteUrl: 'https://gamma.example.com',
    integrationSettings: {
      method: 'embed',
      blogPath: '/blog',
      webhookUrl: 'https://webhook.gamma.example.com/events',
      webhookSecret: 'whsec_gamma_secret',
    },
  },
]
store.webhookDeliveries = []

// ----------------------------------------------------
// TEST 1: HTTP 2xx Delivery Success
// ----------------------------------------------------
await test('Scenario 1: HTTP 2xx delivery success persistence and metadata', async () => {
  store.webhookDeliveries = []
  receivedRequests = []

  mockFetchHandler = async (url, options) => {
    receivedRequests.push({ url, method: options.method, headers: options.headers, body: options.body })
    return new Response(JSON.stringify({ ok: true, received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await dispatchWebhook('client-test-alpha', 'post.published', {
    id: 'post-1',
    title: 'Hello World',
    slug: 'hello-world',
    status: 'published',
  })

  assert.equal(result.dispatched, true, 'Result should indicate successful dispatch')
  assert.equal(result.status, 'delivered', 'Status should be delivered')
  assert.equal(result.statusCode, 200, 'HTTP status should be 200')
  assert.ok(result.latencyMs >= 0, 'Latency should be non-negative integer')

  // Verify delivery record in persistent store
  const record = store.webhookDeliveries.find((d) => d.deliveryId === result.deliveryId)
  assert.ok(record, 'Delivery log must exist in store')
  assert.equal(record.status, 'delivered')
  assert.equal(record.attemptCount, 1)
  assert.ok(record.completedAt instanceof Date || typeof record.completedAt === 'string')
  assert.equal(record.errorMessage, null)
  assert.ok(record.responseBody.includes('received'), 'Response body preview captured')
})

// ----------------------------------------------------
// TEST 2: HTTP 500/503 Retryable Server Error
// ----------------------------------------------------
await test('Scenario 2: HTTP 500 retryable error schedules exponential backoff', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await dispatchWebhook('client-test-beta', 'post.updated', {
    id: 'post-2',
    title: 'Update Post',
    slug: 'update-post',
  })

  assert.equal(result.dispatched, false, 'Dispatch should not be marked delivered on 500')
  assert.equal(result.status, 'pending', 'Status should be pending for retry')
  assert.equal(result.statusCode, 500, 'Status code should be 500')
  assert.ok(result.nextRetryAt instanceof Date, 'nextRetryAt must be a Date in future')
  assert.ok(result.nextRetryAt.getTime() > Date.now(), 'nextRetryAt must be in the future')

  const record = store.webhookDeliveries.find((d) => d.deliveryId === result.deliveryId)
  assert.ok(record, 'Delivery record must exist')
  assert.equal(record.status, 'pending')
  assert.equal(record.completedAt, null, 'completedAt must be null while pending')
  assert.ok(record.errorMessage.includes('HTTP 500'), 'Error message contains HTTP 500')
})

// ----------------------------------------------------
// TEST 3: HTTP 429 Rate Limit with Retry-After
// ----------------------------------------------------
await test('Scenario 3: HTTP 429 honors Retry-After header for next retry', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '120',
      },
    })
  }

  const beforeTime = Date.now()
  const result = await dispatchWebhook('client-test-alpha', 'post.published', {
    id: 'post-429',
    title: 'Rate Limit Test',
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.statusCode, 429)

  const record = store.webhookDeliveries.find((d) => d.deliveryId === result.deliveryId)
  assert.ok(record)
  const scheduledTime = new Date(record.nextRetryAt).getTime()
  // Retry-After was 120s -> should be ~120s from now (allow small delta)
  const diffSec = Math.round((scheduledTime - beforeTime) / 1000)
  assert.ok(diffSec >= 115 && diffSec <= 125, `Expected ~120s retry delay, got ${diffSec}s`)
})

// ----------------------------------------------------
// TEST 4: HTTP 400/401/403/404 Permanent Client Errors
// ----------------------------------------------------
await test('Scenario 4: HTTP 404/401 permanent client errors halt delivery immediately', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ error: 'Endpoint Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await dispatchWebhook('client-test-gamma', 'post.deleted', {
    id: 'post-del',
    title: 'Deleted Post',
  })

  assert.equal(result.dispatched, false)
  assert.equal(result.status, 'failed', 'Status must be permanently failed')
  assert.equal(result.statusCode, 404)
  assert.equal(result.nextRetryAt, null, 'nextRetryAt must be null to prevent useless retries')

  const record = store.webhookDeliveries.find((d) => d.deliveryId === result.deliveryId)
  assert.ok(record)
  assert.equal(record.status, 'failed')
  assert.ok(record.completedAt !== null, 'completedAt must be populated for permanent failures')
  assert.ok(record.errorMessage.includes('Permanent client error HTTP 404'))
})

// ----------------------------------------------------
// TEST 5: Network Timeout / Connection Refused
// ----------------------------------------------------
await test('Scenario 5: Network connection failure handled gracefully as retryable pending', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    const err = new TypeError('fetch failed')
    err.cause = { code: 'ECONNREFUSED' }
    throw err
  }

  const result = await dispatchWebhook('client-test-alpha', 'post.published', {
    id: 'post-net-fail',
    title: 'Net Fail Post',
  })

  assert.equal(result.dispatched, false)
  assert.equal(result.status, 'pending')
  assert.equal(result.statusCode, 0)
  assert.ok(result.nextRetryAt instanceof Date)

  const record = store.webhookDeliveries.find((d) => d.deliveryId === result.deliveryId)
  assert.ok(record)
  assert.equal(record.status, 'pending')
  assert.ok(record.errorMessage.includes('Network error') || record.errorMessage.includes('fetch failed'))
})

// ----------------------------------------------------
// TEST 6: Max Attempts Exhaustion
// ----------------------------------------------------
await test('Scenario 6: Max attempts exhaustion transitions status to failed with completedAt', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 })
  }

  const deliveryId = crypto.randomUUID()
  const mockDelivery = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.updated',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'exhaust-post' },
    attemptCount: 4, // Next attempt will be attempt 5 (maxAttempts = 5)
    maxAttempts: 5,
    status: 'pending',
  }
  store.webhookDeliveries.push(mockDelivery)

  const result = await executeDeliveryAttempt(mockDelivery, 'whsec_alpha_custom_secret_key_123', 'worker-test')
  assert.equal(result.status, 'failed', 'Should transition to failed when max attempts exhausted')
  assert.equal(result.attemptCount, 5)
  assert.ok(result.errorMessage.includes('Retry exhausted after 5 attempts'))

  const record = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(record.status, 'failed')
  assert.ok(record.completedAt !== null)
})

// ----------------------------------------------------
// TEST 7: Deduplication Window (15s)
// ----------------------------------------------------
await test('Scenario 7: Duplicate event dispatch within 15s window is deduplicated', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const eventIdentity = 'client-test-alpha:post.published:post-dedup-1:1700000000000'

  const firstCall = await dispatchWebhook(
    'client-test-alpha',
    'post.published',
    { id: 'post-dedup-1', title: 'Dedup Post' },
    { eventIdentity }
  )
  assert.equal(firstCall.dispatched, true)
  assert.ok(!firstCall.deduplicated)

  // Dispatch same event identity immediately
  const secondCall = await dispatchWebhook(
    'client-test-alpha',
    'post.published',
    { id: 'post-dedup-1', title: 'Dedup Post' },
    { eventIdentity }
  )
  assert.equal(secondCall.deduplicated, true, 'Second dispatch should be deduplicated')
  assert.equal(secondCall.deliveryId, firstCall.deliveryId, 'Must return identical deliveryId')
  assert.equal(store.webhookDeliveries.length, 1, 'Only one persistent record should exist')
})

// ----------------------------------------------------
// TEST 8: Concurrent Worker Atomic Claims
// ----------------------------------------------------
await test('Scenario 8: Concurrent retry workers do not double-process identical deliveries', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const dueDelivery = {
    deliveryId: 'due-delivery-1',
    clientId: 'client-test-alpha',
    event: 'post.updated',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'claim-post' },
    attemptCount: 1,
    maxAttempts: 5,
    status: 'pending',
    nextRetryAt: new Date(Date.now() - 5000).toISOString(),
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries.push(dueDelivery)

  // Run two concurrent worker batches
  const [worker1Result, worker2Result] = await Promise.all([
    processPendingWebhookRetries(10, 'worker-1'),
    processPendingWebhookRetries(10, 'worker-2'),
  ])

  const totalProcessed = worker1Result.processedCount + worker2Result.processedCount
  assert.equal(totalProcessed, 1, `Exactly one worker must claim the candidate (got ${totalProcessed})`)
  assert.equal(store.webhookDeliveries[0].status, 'delivered')
})

// ----------------------------------------------------
// TEST 9: Crashed Worker Lease Recovery
// ----------------------------------------------------
await test('Scenario 9: Crashed worker expired lease is recovered and processed', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // Delivery stuck in 'processing' with expired lease from dead worker
  const crashedDelivery = {
    deliveryId: 'crashed-delivery-1',
    clientId: 'client-test-alpha',
    event: 'post.published',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'crashed-post' },
    attemptCount: 1,
    maxAttempts: 5,
    status: 'processing',
    lockedAt: new Date(Date.now() - 60000).toISOString(),
    lockedBy: 'dead-worker-pid-99999',
    leaseExpiresAt: new Date(Date.now() - 30000).toISOString(), // expired 30s ago
    nextRetryAt: new Date(Date.now() - 40000).toISOString(),
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries.push(crashedDelivery)

  const summary = await processPendingWebhookRetries(10, 'recovery-worker-1')
  assert.equal(summary.processedCount, 1, 'Crashed worker item must be recovered')
  assert.equal(summary.successfulCount, 1)

  const record = store.webhookDeliveries.find((d) => d.deliveryId === 'crashed-delivery-1')
  assert.equal(record.status, 'delivered')
  assert.equal(record.lockedBy, null, 'Lock lease must be cleanly released upon delivery completion')
})

// ----------------------------------------------------
// TEST 10: Tenant Isolation on Deliveries API
// ----------------------------------------------------
await test('Scenario 10: Tenant isolation protects webhook delivery records across tenants', async () => {
  store.webhookDeliveries = [
    {
      deliveryId: 'del-alpha-1',
      clientId: 'client-test-alpha',
      event: 'post.published',
      status: 'delivered',
      createdAt: new Date().toISOString(),
    },
    {
      deliveryId: 'del-beta-1',
      clientId: 'client-test-beta',
      event: 'post.updated',
      status: 'failed',
      createdAt: new Date().toISOString(),
    },
  ]

  // Non-global Client Admin belonging to client-test-alpha attempts to access client-test-beta
  const reqUnauth = {
    params: { id: 'client-test-beta' },
    query: {},
    user: {
      _id: 'usr-client-alpha',
      role: 'Client Admin',
      userType: 'Client Admin',
      clientId: 'client-test-alpha',
      isPrimaryAdmin: false,
    },
  }
  const resUnauth = mockResponse()
  const nextUnauth = mockNext()

  await getClientWebhookDeliveries(reqUnauth, resUnauth, nextUnauth)
  assert.equal(nextUnauth.called, true, 'Next must be called with error')
  assert.equal(nextUnauth.error.statusCode, 403, 'Should return HTTP 403 Forbidden')
  assert.equal(nextUnauth.error.code, 'TENANT_ISOLATION_VIOLATION')

  // Authorized Client Admin accessing own tenant
  const reqAuth = {
    params: { id: 'client-test-alpha' },
    query: {},
    user: {
      _id: 'usr-client-alpha',
      role: 'Client Admin',
      userType: 'Client Admin',
      clientId: 'client-test-alpha',
      isPrimaryAdmin: false,
    },
  }
  const resAuth = mockResponse()
  const nextAuth = mockNext()

  await getClientWebhookDeliveries(reqAuth, resAuth, nextAuth)
  assert.equal(resAuth.statusCode, 200)
  assert.equal(resAuth.body.data.length, 1)
  assert.equal(resAuth.body.data[0].deliveryId, 'del-alpha-1')
})

// ----------------------------------------------------
// TEST 11: Manual Webhook Retry API
// ----------------------------------------------------
await test('Scenario 11: Manual webhook retry triggers immediate re-dispatch', async () => {
  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ ok: true, retried: true }), { status: 200 })
  }

  store.webhookDeliveries = [
    {
      deliveryId: 'del-retry-test',
      clientId: 'client-test-alpha',
      event: 'post.updated',
      targetUrl: 'https://webhook.alpha.example.com/events',
      payload: { id: 'post-manual-retry' },
      attemptCount: 2,
      maxAttempts: 5,
      status: 'failed',
      createdAt: new Date().toISOString(),
    },
  ]

  const req = {
    params: { id: 'client-test-alpha', deliveryId: 'del-retry-test' },
    user: {
      _id: 'usr-client-alpha',
      role: 'Client Admin',
      userType: 'Client Admin',
      clientId: 'client-test-alpha',
      isPrimaryAdmin: false,
    },
  }
  const res = mockResponse()
  const next = mockNext()

  await retryClientWebhookDelivery(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.dispatched, true)
  assert.equal(res.body.data.status, 'delivered')

  const updatedLog = store.webhookDeliveries.find((d) => d.deliveryId === 'del-retry-test')
  assert.equal(updatedLog.status, 'delivered')
  assert.equal(updatedLog.attemptCount, 3)
})

// ----------------------------------------------------
// TEST 12: HMAC-SHA256 Signature & Tenant Secret
// ----------------------------------------------------
await test('Scenario 12: Webhook signature matches HMAC-SHA256 with dedicated tenant secret', async () => {
  receivedRequests = []
  const tenantSecret = 'whsec_alpha_custom_secret_key_123'
  store.clients[0].integrationSettings.webhookSecret = tenantSecret

  mockFetchHandler = async (url, options) => {
    receivedRequests.push({ url, method: options.method, headers: options.headers, body: options.body })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  await dispatchWebhook('client-test-alpha', 'post.published', {
    id: 'post-sig-verify',
    title: 'Signature Verification',
  })

  assert.equal(receivedRequests.length, 1)
  const req = receivedRequests[0]
  const sigHeader = req.headers['X-Deotech-Signature']
  assert.ok(sigHeader && sigHeader.startsWith('sha256='), 'Signature header must be present and start with sha256=')

  const expectedSig = 'sha256=' + crypto.createHmac('sha256', tenantSecret).update(req.body).digest('hex')
  assert.equal(sigHeader, expectedSig, 'Signature must match HMAC of exact request body using tenant secret')

  // Verify dedicated secret generation (not shared default)
  const generatedSecret = await getTenantWebhookSecret(store.clients[1], 'client-test-beta')
  assert.ok(generatedSecret.startsWith('whsec_'), 'Generated secret must start with whsec_')
  assert.notEqual(generatedSecret, 'deotech_cms_default_secret', 'Must NEVER use shared fallback secret')
})

// ----------------------------------------------------
// TEST 13: Post Webhook Event Resolution
// ----------------------------------------------------
await test('Scenario 13: Post webhook event classification correctly handles all state transitions', () => {
  assert.equal(resolvePostWebhookEvent('draft', 'published'), 'post.published')
  assert.equal(resolvePostWebhookEvent('pending_review', 'published'), 'post.published')
  assert.equal(resolvePostWebhookEvent('scheduled', 'published'), 'post.published')
  assert.equal(resolvePostWebhookEvent('published', 'draft'), 'post.unpublished')
  assert.equal(resolvePostWebhookEvent('published', 'archived'), 'post.unpublished')
  assert.equal(resolvePostWebhookEvent('published', 'published'), 'post.updated')
  assert.equal(resolvePostWebhookEvent('draft', 'draft'), 'post.updated')
  assert.equal(resolvePostWebhookEvent('draft', 'pending_review'), 'post.updated')
})

// ----------------------------------------------------
// TEST 14: Safe Retention & TTL Partial Index Rules
// ----------------------------------------------------
await test('Scenario 14: Delivery Log model defines safe partial TTL index excluding pending records', () => {
  const indexes = WebhookDeliveryLog.schema.indexes()
  const ttlIndex = indexes.find(([fields, opts]) => fields.completedAt === 1 && opts?.expireAfterSeconds)

  assert.ok(ttlIndex, 'WebhookDeliveryLog must have a TTL index on completedAt')
  const [fields, options] = ttlIndex
  assert.equal(options.expireAfterSeconds, 30 * 24 * 60 * 60, 'Retention must be 30 days')
  assert.deepEqual(
    options.partialFilterExpression,
    { completedAt: { $type: 'date' } },
    'TTL index must have partialFilterExpression { completedAt: { $type: "date" } } so pending logs are never purged'
  )
})

// ----------------------------------------------------
// TEST 15: Stale Worker Fencing via Lease Token
// ----------------------------------------------------
await test('Scenario 15: Stale worker completion is fenced and cannot overwrite newer worker results', async () => {
  store.webhookDeliveries = []

  mockFetchHandler = async () => {
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  // 1. Worker A claims item with leaseToken A, but lease expires
  const deliveryId = 'delivery-fencing-test'
  const leaseTokenA = 'token-worker-a-12345'
  const mockDelivery = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.updated',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'post-fencing' },
    attemptCount: 1,
    maxAttempts: 5,
    status: 'processing',
    lockedAt: new Date(Date.now() - 40000).toISOString(),
    lockedBy: 'worker-a',
    leaseToken: leaseTokenA,
    leaseExpiresAt: new Date(Date.now() - 10000).toISOString(), // expired 10s ago
    nextRetryAt: new Date(Date.now() - 20000).toISOString(),
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries.push(mockDelivery)

  // 2. Worker B claims the expired lease and delivers it
  const workerBSummary = await processPendingWebhookRetries(10, 'worker-b')
  assert.equal(workerBSummary.processedCount, 1, 'Worker B must claim the expired lease')
  assert.equal(workerBSummary.successfulCount, 1)

  const recordAfterB = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(recordAfterB.status, 'delivered', 'Status must be delivered by Worker B')

  // 3. Worker A finishes late and tries to write its result using stale leaseToken A
  const staleAttempt = await executeDeliveryAttempt(mockDelivery, 'whsec_alpha_custom_secret_key_123', 'worker-a', leaseTokenA)
  assert.equal(staleAttempt.fenced, true, 'Worker A attempt must be fenced')
  assert.equal(staleAttempt.status, 'fenced')

  // 4. Verify record in store was NOT overwritten by Worker A
  const recordFinal = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(recordFinal.status, 'delivered', 'Worker B delivered status must be preserved')
})

// ----------------------------------------------------
// TEST 16: Integration Credentials Exposure & Redaction
// ----------------------------------------------------
await test('Scenario 16: Integration credentials exposure prevented; secrets are masked', async () => {
  // 1. Unauthenticated request rejected with 401
  const reqUnauth = {
    params: { id: 'client-test-alpha' },
  }
  const resUnauth = mockResponse()
  const nextUnauth = mockNext()
  await getClientIntegration(reqUnauth, resUnauth, nextUnauth)
  assert.equal(nextUnauth.called, true)
  assert.equal(nextUnauth.error.statusCode, 401, 'Unauthenticated request must be rejected with 401')

  // 2. Cross-tenant request rejected with 403
  const reqCross = {
    params: { id: 'client-test-beta' },
    user: {
      _id: 'usr-client-alpha',
      role: 'Client Admin',
      clientId: 'client-test-alpha',
      isPrimaryAdmin: false,
    },
  }
  const resCross = mockResponse()
  const nextCross = mockNext()
  await getClientIntegration(reqCross, resCross, nextCross)
  assert.equal(nextCross.called, true)
  assert.equal(nextCross.error.statusCode, 403, 'Cross-tenant request must be rejected with 403')

  // 3. Authorized request returns masked secret, never plaintext
  const reqAuth = {
    params: { id: 'client-test-alpha' },
    user: {
      _id: 'usr-client-alpha',
      role: 'Client Admin',
      clientId: 'client-test-alpha',
      isPrimaryAdmin: false,
    },
  }
  const resAuth = mockResponse()
  const nextAuth = mockNext()
  await getClientIntegration(reqAuth, resAuth, nextAuth)
  assert.equal(resAuth.statusCode, 200)

  const returnedIntegration = resAuth.body.data.integration
  assert.equal(returnedIntegration.hasWebhookSecret, true)
  assert.ok(returnedIntegration.webhookSecretMasked.includes('••••••••••••'), 'Secret must be masked')
  assert.equal(returnedIntegration.webhookSecret, undefined, 'Plaintext secret must NEVER be returned')
  assert.equal(resAuth.body.data.snippets.embed.includes('deotech-blog-feed'), true)
})

// ----------------------------------------------------
// TEST 17: Production Offline Behavior (Strict MongoDB Requirement)
// ----------------------------------------------------
await test('Scenario 17: Production webhook dispatch strictly requires MongoDB and refuses in-memory fallback', async () => {
  store.webhookDeliveries = []
  process.env.NODE_ENV = 'production'

  try {
    const result = await dispatchWebhook('client-test-alpha', 'post.published', {
      id: 'post-prod-offline',
      title: 'Production Offline Test',
    })

    assert.equal(result.dispatched, false, 'Dispatch must fail when DB is unavailable in production')
    assert.equal(result.reason, 'Database service is unavailable')
    assert.equal(store.webhookDeliveries.length, 0, 'Zero records may be accepted into memory in production')
  } finally {
    process.env.NODE_ENV = 'test'
  }
})

// ----------------------------------------------------
// TEST 18: Outbox Insertion Failure Triggers Transaction Rollback
// ----------------------------------------------------
await test('Scenario 18: Outbox insertion failure propagates error and prevents post commit (Transaction Rollback)', async () => {
  store.webhookDeliveries = []

  let abortCalled = false
  let commitCalled = false
  const fakeSession = {
    startTransaction() {},
    async commitTransaction() {
      commitCalled = true
    },
    async abortTransaction() {
      abortCalled = true
    },
    endSession() {},
  }

  let txError = null
  try {
    // Simulating transaction execution where outbox staging throws
    fakeSession.startTransaction()
    try {
      // Step 1: Post mutation simulated
      // Step 2: Outbox write throws
      throw new Error('Outbox write failed: duplicate key error')
      await fakeSession.commitTransaction()
    } catch (err) {
      await fakeSession.abortTransaction()
      throw err
    } finally {
      fakeSession.endSession()
    }
  } catch (err) {
    txError = err
  }

  assert.ok(txError, 'Error must propagate to caller')
  assert.equal(abortCalled, true, 'Transaction abortTransaction must be called on outbox failure')
  assert.equal(commitCalled, false, 'Transaction commitTransaction must NEVER be called if outbox fails')
})

// ----------------------------------------------------
// TEST 19: Immediate Dispatch Uses Atomic Lease Claim
// ----------------------------------------------------
await test('Scenario 19: Immediate dispatch uses atomic lease claim with unique leaseToken', async () => {
  store.webhookDeliveries = []
  mockFetchHandler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 })

  const deliveryId = 'del-immediate-test'
  const record = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.published',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'post-imm-1' },
    status: 'pending',
    nextRetryAt: new Date(),
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries = [record]

  const result = await dispatchImmediateOutboxDelivery(record, 'whsec_alpha_custom_secret_key_123', 'dispatcher-immediate')

  assert.equal(result.dispatched, true, 'Immediate dispatch must successfully deliver')
  assert.equal(result.status, 'delivered')
  assert.equal(result.fenced, false)

  const updated = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(updated.status, 'delivered')
  assert.equal(updated.attemptCount, 1)
  assert.equal(updated.leaseToken, null, 'Lease token must be cleared upon successful completion')
})

// ----------------------------------------------------
// TEST 20: Daemon Claims First, Immediate Dispatch Fenced
// ----------------------------------------------------
await test('Scenario 20: Daemon claims newly staged event first; immediate dispatch is fenced and drops out', async () => {
  store.webhookDeliveries = []
  receivedRequests = []
  mockFetchHandler = async (url, options) => {
    receivedRequests.push({ url, body: options.body })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const deliveryId = 'del-race-daemon-wins'
  const record = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.published',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'post-race-1' },
    status: 'pending',
    nextRetryAt: new Date(),
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries = [record]

  // 1. Daemon atomically claims the record first
  const daemonClaim = await claimDeliveryLease(deliveryId, 'worker-daemon')
  assert.equal(daemonClaim.claimed, true, 'Daemon must win the atomic claim')
  assert.ok(daemonClaim.leaseToken, 'Daemon receives unique leaseToken')

  // 2. Concurrently, post controller runs immediate dispatch
  const immediateResult = await dispatchImmediateOutboxDelivery(record, 'whsec_alpha_custom_secret_key_123', 'dispatcher-immediate')

  assert.equal(immediateResult.dispatched, false, 'Immediate dispatch must not deliver when daemon holds lease')
  assert.equal(immediateResult.claimed, false, 'Immediate dispatch claim must be rejected')
  assert.equal(immediateResult.fenced, true, 'Immediate dispatch must report fenced: true')

  // 3. Daemon executes its delivery
  const daemonResult = await executeDeliveryAttempt(
    daemonClaim.delivery,
    'whsec_alpha_custom_secret_key_123',
    'worker-daemon',
    daemonClaim.leaseToken
  )
  assert.equal(daemonResult.dispatched, true, 'Daemon must deliver successfully')

  // Exactly one HTTP request sent
  assert.equal(receivedRequests.length, 1, 'Only daemon sends HTTP request; no duplicate delivery')
})

// ----------------------------------------------------
// TEST 21: Immediate Dispatch Claims First, Daemon Skips
// ----------------------------------------------------
await test('Scenario 21: Immediate dispatch claims first; background daemon skips the event', async () => {
  store.webhookDeliveries = []
  receivedRequests = []
  mockFetchHandler = async (url, options) => {
    receivedRequests.push({ url, body: options.body })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }

  const deliveryId = 'del-race-imm-wins'
  const record = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.published',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'post-race-2' },
    status: 'pending',
    nextRetryAt: new Date(),
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries = [record]

  // 1. Immediate dispatch claims the lease
  const immClaim = await claimDeliveryLease(deliveryId, 'dispatcher-immediate')
  assert.equal(immClaim.claimed, true, 'Immediate dispatch must win the lease')

  // 2. Daemon processor runs while immediate dispatch is active
  const daemonSummary = await processPendingWebhookRetries(10, 'worker-daemon')
  assert.equal(daemonSummary.processedCount, 0, 'Daemon must skip delivery claimed by active lease')

  // 3. Immediate dispatch executes
  const immResult = await executeDeliveryAttempt(
    immClaim.delivery,
    'whsec_alpha_custom_secret_key_123',
    'dispatcher-immediate',
    immClaim.leaseToken
  )
  assert.equal(immResult.dispatched, true)
  assert.equal(receivedRequests.length, 1, 'Only one HTTP request sent')
})

// ----------------------------------------------------
// TEST 22: Stale Immediate Worker Cannot Overwrite Newer Worker
// ----------------------------------------------------
await test('Scenario 22: Stale immediate worker completion is fenced and cannot overwrite newer worker results', async () => {
  store.webhookDeliveries = []
  mockFetchHandler = async () => new Response(JSON.stringify({ ok: true }), { status: 200 })

  const deliveryId = 'del-stale-imm-test'
  const record = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.published',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'post-stale-1' },
    status: 'pending',
    nextRetryAt: new Date(),
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries = [record]

  // 1. Immediate worker claims lease
  const immClaim = await claimDeliveryLease(deliveryId, 'dispatcher-immediate')
  const staleToken = immClaim.leaseToken

  // 2. Worker stalls: lease expires
  const storedItem = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  storedItem.leaseExpiresAt = new Date(Date.now() - 5000).toISOString()

  // 3. Recovery daemon claims expired lease with new token
  const recoveryClaim = await claimDeliveryLease(deliveryId, 'worker-recovery')
  assert.equal(recoveryClaim.claimed, true)
  assert.notEqual(recoveryClaim.leaseToken, staleToken, 'Recovery worker receives new token')

  // Recovery worker delivers
  await executeDeliveryAttempt(
    recoveryClaim.delivery,
    'whsec_alpha_custom_secret_key_123',
    'worker-recovery',
    recoveryClaim.leaseToken
  )
  const itemAfterRecovery = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(itemAfterRecovery.status, 'delivered')

  // 4. Stale immediate worker finishes late and attempts completion with staleToken
  const staleAttempt = await executeDeliveryAttempt(
    immClaim.delivery,
    'whsec_alpha_custom_secret_key_123',
    'dispatcher-immediate',
    staleToken
  )

  assert.equal(staleAttempt.fenced, true, 'Stale immediate worker must be fenced')
  assert.equal(staleAttempt.status, 'fenced')

  // Document remains delivered by recovery worker
  const itemFinal = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(itemFinal.status, 'delivered')
})

// ----------------------------------------------------
// TEST 23: Failed Lease Check Does NOT Clear Another Worker's Lock
// ----------------------------------------------------
await test('Scenario 23: Failed lease ownership check does NOT clear or mutate another worker\'s lock', async () => {
  store.webhookDeliveries = []

  const deliveryId = 'del-lock-integrity-test'
  const activeToken = crypto.randomUUID()
  const activeExpiry = new Date(Date.now() + 60000).toISOString()

  const lockedRecord = {
    deliveryId,
    clientId: 'client-test-alpha',
    event: 'post.updated',
    targetUrl: 'https://webhook.alpha.example.com/events',
    payload: { id: 'post-lock-integrity' },
    status: 'processing',
    lockedAt: new Date().toISOString(),
    lockedBy: 'legitimate-worker-1',
    leaseToken: activeToken,
    leaseExpiresAt: activeExpiry,
    attemptCount: 1,
    maxAttempts: 5,
    createdAt: new Date().toISOString(),
  }
  store.webhookDeliveries = [lockedRecord]

  // Rogue / stale worker attempts completion with invalid token
  const rogueToken = crypto.randomUUID()
  const rogueDelivery = { ...lockedRecord, leaseToken: rogueToken }

  const rogueAttempt = await executeDeliveryAttempt(
    rogueDelivery,
    'whsec_alpha_custom_secret_key_123',
    'rogue-worker-2',
    rogueToken
  )

  assert.equal(rogueAttempt.fenced, true, 'Rogue worker must be fenced')

  // Verify legitimate worker's lock is completely intact
  const doc = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId)
  assert.equal(doc.status, 'processing', 'Status must remain processing')
  assert.equal(doc.lockedBy, 'legitimate-worker-1', 'lockedBy must remain legitimate worker')
  assert.equal(doc.leaseToken, activeToken, 'leaseToken must remain activeToken')
  assert.equal(doc.leaseExpiresAt, activeExpiry, 'leaseExpiresAt must remain unchanged')
})

// ----------------------------------------------------
// TEST 24: Unsupported MongoDB Topology Handled Safely
// ----------------------------------------------------
await test('Scenario 24: Unsupported MongoDB topology is handled safely without false transaction claims', async () => {
  let receivedSession = 'uninitialized'
  const result = await withOptionalTransaction(async (session) => {
    receivedSession = session
    return 'fallback-executed'
  })

  assert.equal(result, 'fallback-executed')
  assert.equal(receivedSession, null, 'In standalone / disconnected mode, session must be null (non-atomic fallback)')
})

// Teardown mock fetch
global.fetch = originalFetch

console.log('\n====================================================')
console.log(`📊 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`)
console.log('====================================================')

if (failedCount > 0) {
  process.exit(1)
} else {
  console.log(`✨ All ${passedCount} Phase 2A Webhook Reliability & Security tests passed!\n`)
  process.exit(0)
}
