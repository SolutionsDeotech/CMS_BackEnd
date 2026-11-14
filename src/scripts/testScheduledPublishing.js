process.env.NODE_ENV = 'test'

/**
 * Phase 2B: Scheduled Blog Publishing Implementation Test Suite
 *
 * Verifies all 12 scheduling, validation, concurrency, lease-fencing, and delivery scenarios:
 * 1. Date normalization: ISO-8601, frontend string format, date-only, timestamps, Date objects
 * 2. Date validation: future dates allowed, past dates rejected with HTTP 400 Bad Request
 * 3. Automatic publishing of due scheduled posts (status -> published, publishedAt set, lock cleared)
 * 4. Future scheduled posts retained (not claimed or published before due date)
 * 5. Multi-worker race condition prevention: atomic conditional claim ensures exactly 1 worker wins
 * 6. Stale worker lease expiration: crashed worker lease recovered, stale updates fenced
 * 7. Container sleep / restart overdue catch-up: overdue posts published immediately upon boot/wake
 * 8. Webhook outbox integration: post.published event staged with stable identity and post metadata
 * 9. Multi-tenant isolation: scheduled posts strictly preserve clientId, webhooks isolated
 * 10. API controller validation: createPost, updatePost, and updatePostStatus reject past scheduled dates
 * 11. Frontend date format compatibility: "YYYY-MM-DD at HH:mm UTC" accepted and stored in UTC
 * 12. Manual status transitions: publishingLock reset on status change, publishedAt set on manual publish
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import store from '../services/store.js'
import Post from '../models/Post.js'
import { isDbConnected } from '../config/db.js'
import {
  normalizeScheduledDate,
  validateScheduledDate,
  claimScheduledPost,
  publishClaimedScheduledPost,
  processDueScheduledPosts,
  DEFAULT_SCHEDULE_LEASE_DURATION_MS,
} from '../services/scheduledPostService.js'
import {
  createPost,
  updatePost,
  updatePostStatus,
  triggerScheduledCheck,
} from '../controllers/postsController.js'

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
    next.error = err
  }
  next.error = null
  return next
}

let passedTests = 0
let failedTests = 0

function reportPass(name) {
  passedTests++
  console.log(`  ✅ [PASS] ${name}`)
}

function reportFail(name, err) {
  failedTests++
  console.error(`  ❌ [FAIL] ${name}: ${err.message}`)
}

async function runScheduledPublishingTests() {
  console.log('====================================================================')
  console.log('  PHASE 2B: SCHEDULED BLOG PUBLISHING & WORKER RELIABILITY TESTS')
  console.log('====================================================================\n')

  // Setup test environment
  if (!store.posts) store.posts = []
  if (!store.webhookDeliveries) store.webhookDeliveries = []
  if (!store.clients) store.clients = []

  const testClientId = 'client_scheduled_test'
  store.clients.push({
    id: testClientId,
    customId: testClientId,
    websiteUrl: 'https://scheduled-test.com',
    status: 'active',
    integrationSettings: {
      webhookUrl: 'https://scheduled-test.com/api/webhook',
      webhookSecret: 'scheduled_secret_key_12345',
      allowedOrigins: ['https://scheduled-test.com'],
    },
  })

  // --------------------------------------------------------------------------
  // Scenario 1: Date Normalization
  // --------------------------------------------------------------------------
  console.log('--- Scenario 1: Scheduled Date Normalization ---')
  try {
    // ISO 8601
    const isoDate = normalizeScheduledDate('2026-11-20T14:30:00.000Z')
    assert.equal(isoDate instanceof Date, true)
    assert.equal(isoDate.toISOString(), '2026-11-20T14:30:00.000Z')

    // Single-digit hour ISO
    const singleDigitIso = normalizeScheduledDate('2026-11-20T9:30:00Z')
    assert.equal(singleDigitIso instanceof Date, true)
    assert.equal(singleDigitIso.getUTCHours(), 9)

    // Frontend string: "YYYY-MM-DD at HH:mm UTC"
    const feDate = normalizeScheduledDate('2026-12-25 at 18:45 UTC')
    assert.equal(feDate instanceof Date, true)
    assert.equal(feDate.toISOString(), '2026-12-25T18:45:00.000Z')

    // Frontend string without UTC suffix
    const feDateNoSuffix = normalizeScheduledDate('2026-12-25 at 8:05')
    assert.equal(feDateNoSuffix instanceof Date, true)
    assert.equal(feDateNoSuffix.getUTCHours(), 8)
    assert.equal(feDateNoSuffix.getUTCMinutes(), 5)

    // Date-only string
    const dateOnly = normalizeScheduledDate('2026-12-31')
    assert.equal(dateOnly instanceof Date, true)
    assert.equal(dateOnly.toISOString(), '2026-12-31T00:00:00.000Z')

    // Millisecond timestamp
    const ts = Date.now() + 100000
    const tsDate = normalizeScheduledDate(ts)
    assert.equal(tsDate instanceof Date, true)
    assert.equal(tsDate.getTime(), ts)

    // Invalid values
    assert.equal(normalizeScheduledDate(null), null)
    assert.equal(normalizeScheduledDate(''), null)
    assert.equal(normalizeScheduledDate('not-a-valid-date'), null)

    reportPass('Normalizes ISO-8601, single-digit hours, frontend UTC strings, and timestamps accurately')
  } catch (err) {
    reportFail('Scheduled date normalization failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 2: Date Validation & Future Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Scheduled Date Validation ---')
  try {
    const futureDate = new Date(Date.now() + 3600000) // 1 hour ahead
    const pastDate = new Date(Date.now() - 3600000) // 1 hour ago

    const validRes = validateScheduledDate(futureDate)
    assert.equal(validRes.valid, true)
    assert.equal(validRes.error, null)
    assert.equal(validRes.date.getTime(), futureDate.getTime())

    const pastRes = validateScheduledDate(pastDate)
    assert.equal(pastRes.valid, false)
    assert.match(pastRes.error, /must be in the future/i)

    const invalidRes = validateScheduledDate('not-a-real-date')
    assert.equal(invalidRes.valid, false)
    assert.match(invalidRes.error, /invalid scheduled date format/i)

    // Grace window: a date 10s in the past passes due to network latency grace period
    const gracePastDate = new Date(Date.now() - 10000)
    const graceRes = validateScheduledDate(gracePastDate, { gracePeriodMs: 30000 })
    assert.equal(graceRes.valid, true)

    reportPass('Validates future scheduled dates and rejects past or malformed values')
  } catch (err) {
    reportFail('Date validation failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 3: Due Scheduled Post Publishing
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Due Scheduled Post Publishing ---')
  try {
    const duePostId = 'post_due_001'
    const pastDueTime = new Date(Date.now() - 60000).toISOString()
    const testPost = {
      id: duePostId,
      customId: duePostId,
      title: 'Due Scheduled Article',
      slug: 'due-scheduled-article',
      content: 'This article was scheduled and is now due.',
      status: 'scheduled',
      scheduledDate: pastDueTime,
      clientId: testClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    store.posts.push(testPost)

    const claimRes = await claimScheduledPost(duePostId, 'worker-alpha')
    assert.equal(claimRes.claimed, true)
    assert.ok(claimRes.leaseToken)
    assert.equal(testPost.publishingLock.lockedBy, 'worker-alpha')

    const pubRes = await publishClaimedScheduledPost(testPost, claimRes.leaseToken, 'worker-alpha')
    assert.equal(pubRes.published, true)
    assert.equal(testPost.status, 'published')
    assert.ok(testPost.publishedAt)
    assert.equal(testPost.publishingLock.leaseToken, null)
    assert.equal(testPost.publishingLock.lockedBy, null)

    // Verify webhook outbox staging
    const stagedDelivery = store.webhookDeliveries.find(
      (d) => d.clientId === testClientId && d.event === 'post.published' && d.postId === duePostId
    )
    assert.ok(stagedDelivery, 'Webhook delivery log record must be staged')
    assert.equal(stagedDelivery.payload.status, 'published')
    assert.equal(stagedDelivery.payload.previousStatus, 'scheduled')

    reportPass('Due scheduled post is atomically claimed, published, and stages post.published outbox delivery')
  } catch (err) {
    reportFail('Due scheduled post publishing failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 4: Future Scheduled Post Retention
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Future Scheduled Post Retention ---')
  try {
    const futurePostId = 'post_future_002'
    const futureTime = new Date(Date.now() + 7200000).toISOString() // 2 hours in future
    const futurePost = {
      id: futurePostId,
      customId: futurePostId,
      title: 'Future Article',
      slug: 'future-article',
      content: 'Will be published in 2 hours.',
      status: 'scheduled',
      scheduledDate: futureTime,
      clientId: testClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    store.posts.push(futurePost)

    const claimRes = await claimScheduledPost(futurePostId, 'worker-beta')
    assert.equal(claimRes.claimed, false)
    assert.match(claimRes.reason, /not due/i)
    assert.equal(futurePost.status, 'scheduled')
    assert.equal(futurePost.publishingLock.leaseToken, null)

    reportPass('Future scheduled post is not claimed or modified before its due time')
  } catch (err) {
    reportFail('Future scheduled post retention failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 5: Multi-Worker Concurrency & Race Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Multi-Worker Concurrency & Race Prevention ---')
  try {
    const racePostId = 'post_race_003'
    const racePost = {
      id: racePostId,
      customId: racePostId,
      title: 'Race Condition Test Post',
      slug: 'race-condition-test-post',
      content: 'Contested post for atomic claim.',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() - 30000).toISOString(),
      clientId: testClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    store.posts.push(racePost)

    // 5 concurrent workers attempt to claim the same post
    const workers = ['worker-1', 'worker-2', 'worker-3', 'worker-4', 'worker-5']
    const claimAttempts = await Promise.all(
      workers.map((w) => claimScheduledPost(racePostId, w))
    )

    const successfulClaims = claimAttempts.filter((c) => c.claimed)
    const failedClaims = claimAttempts.filter((c) => !c.claimed)

    assert.equal(successfulClaims.length, 1, 'Exactly one worker must successfully claim the post')
    assert.equal(failedClaims.length, 4, 'All other competing workers must fail the claim')

    // Winner publishes
    const winner = successfulClaims[0]
    const pubRes = await publishClaimedScheduledPost(racePost, winner.leaseToken, winner.post.publishingLock.lockedBy)
    assert.equal(pubRes.published, true)

    reportPass('Atomic conditional claim prevents double execution across multiple concurrent workers')
  } catch (err) {
    reportFail('Multi-worker concurrency test failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 6: Stale Worker Lease Expiration & Fencing
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Stale Worker Lease Expiration & Fencing ---')
  try {
    const stalePostId = 'post_stale_004'
    const expiredLeaseTime = new Date(Date.now() - 10000).toISOString() // Lease expired 10s ago
    const stalePost = {
      id: stalePostId,
      customId: stalePostId,
      title: 'Stale Worker Test Post',
      slug: 'stale-worker-test-post',
      content: 'Previously claimed by a crashed worker.',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() - 120000).toISOString(),
      clientId: testClientId,
      publishingLock: {
        lockedAt: new Date(Date.now() - 70000).toISOString(),
        lockedBy: 'crashed-worker-99',
        leaseToken: 'expired-token-xyz',
        leaseExpiresAt: expiredLeaseTime,
      },
    }
    store.posts.push(stalePost)

    // New worker reclaims the post because lease expired
    const reclaimRes = await claimScheduledPost(stalePostId, 'recovery-worker-1')
    assert.equal(reclaimRes.claimed, true)
    assert.notEqual(reclaimRes.leaseToken, 'expired-token-xyz')
    assert.equal(stalePost.publishingLock.lockedBy, 'recovery-worker-1')

    // Stale worker wakes up late and attempts to publish with its old leaseToken
    const staleAttempt = await publishClaimedScheduledPost(stalePost, 'expired-token-xyz', 'crashed-worker-99')
    assert.equal(staleAttempt.published, false)
    assert.equal(staleAttempt.fenced, true)

    // Recovery worker publishes with valid leaseToken
    const recoveryPub = await publishClaimedScheduledPost(stalePost, reclaimRes.leaseToken, 'recovery-worker-1')
    assert.equal(recoveryPub.published, true)
    assert.equal(stalePost.status, 'published')

    reportPass('Expired worker lease is reclaimed and stale worker late publish is fenced')
  } catch (err) {
    reportFail('Stale worker lease recovery failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 7: Container Sleep / Restart Overdue Batch Catch-Up
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Container Sleep / Restart Overdue Batch Catch-Up ---')
  try {
    const batchPostA = {
      id: 'post_sleep_005a',
      customId: 'post_sleep_005a',
      title: 'Overdue Post A',
      slug: 'overdue-post-a',
      content: 'Matured during container sleep.',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() - 300000).toISOString(), // 5 min ago
      clientId: testClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    const batchPostB = {
      id: 'post_sleep_005b',
      customId: 'post_sleep_005b',
      title: 'Overdue Post B',
      slug: 'overdue-post-b',
      content: 'Matured during container sleep.',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() - 180000).toISOString(), // 3 min ago
      clientId: testClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    store.posts.push(batchPostA, batchPostB)

    // Run batch processor (as executed on container boot/wake)
    const batchResult = await processDueScheduledPosts(10, 'boot-worker')
    assert.ok(batchResult.publishedCount >= 2)
    assert.equal(batchPostA.status, 'published')
    assert.equal(batchPostB.status, 'published')

    reportPass('Overdue posts matured during container sleep are immediately published upon wake')
  } catch (err) {
    reportFail('Overdue batch catch-up failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 8: Webhook Outbox Event Identity & Scoped Metadata
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Webhook Outbox Event Identity & Scoped Metadata ---')
  try {
    const outboxPostId = 'post_outbox_006'
    const outboxPost = {
      id: outboxPostId,
      customId: outboxPostId,
      title: 'Metadata Check Post',
      slug: 'metadata-check-post',
      content: 'Outbox event metadata verification.',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() - 5000).toISOString(),
      clientId: testClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    store.posts.push(outboxPost)

    const claim = await claimScheduledPost(outboxPostId, 'worker-meta')
    const pub = await publishClaimedScheduledPost(outboxPost, claim.leaseToken, 'worker-meta')
    assert.equal(pub.published, true)

    const delivery = store.webhookDeliveries.find(
      (d) => d.postId === outboxPostId && d.event === 'post.published'
    )
    assert.ok(delivery)
    assert.equal(delivery.clientId, testClientId)
    assert.match(delivery.eventIdentity, new RegExp(`^${testClientId}:post.published:${outboxPostId}:\\d+$`))
    assert.equal(delivery.payload.title, 'Metadata Check Post')
    assert.equal(delivery.payload.status, 'published')
    assert.equal(delivery.payload.previousStatus, 'scheduled')
    assert.ok(delivery.payload.publishedAt)

    reportPass('Webhook outbox event staged with tenant-scoped eventIdentity, previousStatus, and publishedAt')
  } catch (err) {
    reportFail('Webhook outbox metadata verification failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 9: Tenant Isolation on Scheduled Publishing
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Tenant Isolation on Scheduled Publishing ---')
  try {
    const tenantBClientId = 'client_tenant_beta'
    store.clients.push({
      id: tenantBClientId,
      customId: tenantBClientId,
      websiteUrl: 'https://tenant-beta.com',
      status: 'active',
      integrationSettings: {
        webhookUrl: 'https://tenant-beta.com/webhook',
        webhookSecret: 'secret_beta_99999',
      },
    })

    const tenantBPost = {
      id: 'post_tenant_b_007',
      customId: 'post_tenant_b_007',
      title: 'Tenant B Scheduled Article',
      slug: 'tenant-b-scheduled-article',
      content: 'Isolated to tenant B.',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() - 10000).toISOString(),
      clientId: tenantBClientId,
      publishingLock: { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null },
    }
    store.posts.push(tenantBPost)

    const claim = await claimScheduledPost('post_tenant_b_007', 'worker-iso')
    await publishClaimedScheduledPost(tenantBPost, claim.leaseToken, 'worker-iso')

    const tenantBDelivery = store.webhookDeliveries.find((d) => d.postId === 'post_tenant_b_007')
    assert.ok(tenantBDelivery)
    assert.equal(tenantBDelivery.clientId, tenantBClientId)

    // Confirm Tenant A has no delivery records for Tenant B post
    const crossTenantPollution = store.webhookDeliveries.filter(
      (d) => d.clientId === testClientId && d.postId === 'post_tenant_b_007'
    )
    assert.equal(crossTenantPollution.length, 0)

    reportPass('Tenant isolation strictly preserved during scheduled publishing and webhook staging')
  } catch (err) {
    reportFail('Tenant isolation test failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 10: API Controller Validation (Past Date Rejection)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 10: API Controller Validation (Past Date Rejection) ---')
  try {
    const adminUser = {
      id: 'admin_user_01',
      name: 'Admin Tester',
      role: 'Admin',
      isPrimaryAdmin: true,
    }

    // 10A: createPost with scheduled in the past
    const createReq = {
      body: {
        title: 'Past Scheduled Post',
        content: 'Content',
        status: 'scheduled',
        scheduledDate: new Date(Date.now() - 3600000).toISOString(), // 1 hr ago
      },
      user: adminUser,
    }
    const createRes = mockResponse()
    const createNext = mockNext()
    await createPost(createReq, createRes, createNext)
    assert.ok(createNext.error, 'createPost must reject past scheduledDate')
    assert.equal(createNext.error.statusCode, 400)
    assert.match(createNext.error.message, /must be in the future/i)

    // 10B: updatePost with scheduled in the past
    const targetPost = {
      id: 'post_api_test_008',
      customId: 'post_api_test_008',
      title: 'Existing Draft',
      slug: 'existing-draft',
      status: 'draft',
      clientId: testClientId,
    }
    store.posts.push(targetPost)

    const updateReq = {
      params: { id: 'post_api_test_008' },
      body: {
        status: 'scheduled',
        scheduledDate: '2020-01-01T00:00:00.000Z', // Far past
      },
      user: adminUser,
    }
    const updateRes = mockResponse()
    const updateNext = mockNext()
    await updatePost(updateReq, updateRes, updateNext)
    assert.ok(updateNext.error, 'updatePost must reject past scheduledDate')
    assert.equal(updateNext.error.statusCode, 400)

    // 10C: updatePostStatus with scheduled in the past
    const statusReq = {
      params: { id: 'post_api_test_008' },
      body: {
        status: 'scheduled',
        scheduledDate: new Date(Date.now() - 7200000).toISOString(),
      },
      user: adminUser,
    }
    const statusRes = mockResponse()
    const statusNext = mockNext()
    await updatePostStatus(statusReq, statusRes, statusNext)
    assert.ok(statusNext.error, 'updatePostStatus must reject past scheduledDate')
    assert.equal(statusNext.error.statusCode, 400)

    reportPass('createPost, updatePost, and updatePostStatus reject past scheduling requests with HTTP 400')
  } catch (err) {
    reportFail('API controller validation test failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 11: Frontend Date Format Compatibility
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Frontend Date Format Compatibility ---')
  try {
    const adminUser = {
      id: 'admin_user_01',
      name: 'Admin Tester',
      role: 'Admin',
      isPrimaryAdmin: true,
    }

    // Frontend modal submits: scheduledDate: `${scheduleDate} at ${scheduleTime} UTC`
    const futureDateStr = '2028-06-15 at 16:30 UTC'
    const createReq = {
      body: {
        title: 'Frontend Scheduled Post',
        content: 'From frontend modal format.',
        status: 'scheduled',
        scheduledDate: futureDateStr,
        clientId: testClientId,
      },
      user: adminUser,
    }
    const createRes = mockResponse()
    const createNext = mockNext()
    await createPost(createReq, createRes, createNext)
    assert.equal(createNext.error, null)
    assert.equal(createRes.statusCode, 201)
    assert.ok(createRes.body.data.scheduledDate)

    const parsedDate = new Date(createRes.body.data.scheduledDate)
    assert.equal(parsedDate.getUTCFullYear(), 2028)
    assert.equal(parsedDate.getUTCMonth(), 5) // June is month index 5
    assert.equal(parsedDate.getUTCDate(), 15)
    assert.equal(parsedDate.getUTCHours(), 16)
    assert.equal(parsedDate.getUTCMinutes(), 30)

    reportPass('Accepts frontend "${scheduleDate} at ${scheduleTime} UTC" format and normalizes to UTC Date')
  } catch (err) {
    reportFail('Frontend date format compatibility test failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 12: Manual Status Transitions & Lock Cleanup
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Manual Status Transitions & Lock Cleanup ---')
  try {
    const adminUser = {
      id: 'admin_user_01',
      name: 'Admin Tester',
      role: 'Admin',
      isPrimaryAdmin: true,
    }

    const manualPostId = 'post_manual_009'
    const manualPost = {
      id: manualPostId,
      customId: manualPostId,
      title: 'Manual Transition Article',
      slug: 'manual-transition-article',
      status: 'scheduled',
      scheduledDate: new Date(Date.now() + 3600000).toISOString(),
      clientId: testClientId,
      publishingLock: {
        lockedAt: new Date().toISOString(),
        lockedBy: 'some-worker',
        leaseToken: 'token-abc',
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
      },
    }
    store.posts.push(manualPost)

    // Admin manually publishes the post now
    const pubReq = {
      params: { id: manualPostId },
      body: { status: 'published' },
      user: adminUser,
    }
    const pubRes = mockResponse()
    const pubNext = mockNext()
    await updatePostStatus(pubReq, pubRes, pubNext)

    assert.equal(pubNext.error, null)
    assert.equal(manualPost.status, 'published')
    assert.ok(manualPost.publishedAt)
    assert.equal(manualPost.publishingLock.leaseToken, null)
    assert.equal(manualPost.publishingLock.lockedBy, null)

    // Admin reverts back to draft
    const draftReq = {
      params: { id: manualPostId },
      body: { status: 'draft' },
      user: adminUser,
    }
    const draftRes = mockResponse()
    const draftNext = mockNext()
    await updatePostStatus(draftReq, draftRes, draftNext)

    assert.equal(draftNext.error, null)
    assert.equal(manualPost.status, 'draft')
    assert.equal(manualPost.publishingLock.leaseToken, null)

    reportPass('Manual status changes set publishedAt on publish and clear publishingLock cleanly')
  } catch (err) {
    reportFail('Manual status transition test failed', err)
  }

  // --------------------------------------------------------------------------
  // Scenario 13: Manual Trigger Endpoint (/posts/scheduled/run)
  // --------------------------------------------------------------------------
  console.log('\n--- Scenario 13: Manual Trigger Endpoint ---')
  try {
    const triggerReq = {
      user: { id: 'admin_user_01', isPrimaryAdmin: true, permissions: ['posts.publish'] },
    }
    const triggerRes = mockResponse()
    const triggerNext = mockNext()

    await triggerScheduledCheck(triggerReq, triggerRes, triggerNext)
    assert.equal(triggerNext.error, null)
    assert.equal(triggerRes.statusCode, 200)
    assert.ok(triggerRes.body.data)
    assert.equal(typeof triggerRes.body.data.processedCount, 'number')
    assert.equal(typeof triggerRes.body.data.publishedCount, 'number')

    reportPass('Manual check endpoint triggers processDueScheduledPosts and returns counts')
  } catch (err) {
    reportFail('Manual trigger endpoint test failed', err)
  }

  // Summary
  console.log('\n====================================================================')
  console.log(`  PHASE 2B TEST RESULTS: ${passedTests} passed, ${failedTests} failed`)
  console.log('====================================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runScheduledPublishingTests().catch((err) => {
  console.error('Fatal error running scheduled publishing tests:', err)
  process.exit(1)
})

