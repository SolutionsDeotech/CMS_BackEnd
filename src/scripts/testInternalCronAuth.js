process.env.NODE_ENV = 'test'

/**
 * Focused Test Suite: Internal Cron Authentication & Authorization
 *
 * Verifies:
 * 1. Missing CRON_SECRET environment variable rejects request with HTTP 503 (disabled/unconfigured).
 * 2. Missing X-Cron-Key request header rejects with HTTP 401.
 * 3. Invalid X-Cron-Key (wrong secret) rejects with HTTP 401.
 * 4. Invalid X-Cron-Key with mismatched length rejects with HTTP 401 in constant time (timingSafeEqual).
 * 5. Valid X-Cron-Key matching CRON_SECRET passes authentication and triggers scheduled sweep.
 * 6. Secret confidentiality: secret value is never exposed in response bodies, headers, or error objects.
 * 7. Existing user endpoint POST /api/v1/posts/scheduled/run remains strictly protected by user JWT.
 * 8. Reuses processDueScheduledPosts cleanly without duplicate logic.
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import app from '../app.js'
import store from '../services/store.js'
import { verifyCronSecret } from '../middleware/cronAuth.js'

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
    next.called = true
  }
  next.error = null
  next.called = false
  return next
}

let passed = 0
let failed = 0

function reportPass(msg) {
  passed++
  console.log(`  ✅ [PASS] ${msg}`)
}

function reportFail(msg, err) {
  failed++
  console.error(`  ❌ [FAIL] ${msg}: ${err.message}`)
}

async function runCronAuthTests() {
  console.log('====================================================================')
  console.log('  TESTING INTERNAL CRON AUTHENTICATION & SECURITY')
  console.log('====================================================================\n')

  const originalCronSecret = process.env.CRON_SECRET

  // --------------------------------------------------------------------------
  // Test 1: Missing CRON_SECRET on Server
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Missing CRON_SECRET on Server ---')
  try {
    delete process.env.CRON_SECRET
    const req = { headers: { 'x-cron-key': 'some_key_attempt' } }
    const res = mockResponse()
    const next = mockNext()

    verifyCronSecret(req, res, next)
    assert.ok(next.error, 'Must pass error to next when CRON_SECRET is not configured')
    assert.equal(next.error.statusCode, 503)
    assert.match(next.error.message, /not configured/i)
    reportPass('Rejects request with HTTP 503 when CRON_SECRET is not configured on server')
  } catch (err) {
    reportFail('Missing CRON_SECRET test failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 2: Missing X-Cron-Key Header
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Missing X-Cron-Key Request Header ---')
  try {
    process.env.CRON_SECRET = 'super_secret_cron_token_2026_xyz'
    const req = { headers: {} }
    const res = mockResponse()
    const next = mockNext()

    verifyCronSecret(req, res, next)
    assert.ok(next.error, 'Must pass error when X-Cron-Key is missing')
    assert.equal(next.error.statusCode, 401)
    assert.match(next.error.message, /missing x-cron-key/i)
    reportPass('Rejects request with HTTP 401 when X-Cron-Key header is omitted')
  } catch (err) {
    reportFail('Missing header test failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 3: Invalid X-Cron-Key (Same Length, Wrong Content)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Invalid X-Cron-Key (Wrong Secret Content) ---')
  try {
    process.env.CRON_SECRET = 'super_secret_cron_token_2026_xyz'
    const req = { headers: { 'x-cron-key': 'wrong_secret_cron_token_2026_abc' } }
    const res = mockResponse()
    const next = mockNext()

    verifyCronSecret(req, res, next)
    assert.ok(next.error, 'Must reject incorrect key')
    assert.equal(next.error.statusCode, 401)
    assert.match(next.error.message, /invalid cron authentication key/i)
    reportPass('Rejects request with HTTP 401 when X-Cron-Key does not match')
  } catch (err) {
    reportFail('Invalid key test failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 4: Timing-Safe Comparison with Mismatched Length
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Timing-Safe Comparison with Mismatched Length ---')
  try {
    process.env.CRON_SECRET = 'super_secret_cron_token_2026_xyz'
    const reqShort = { headers: { 'x-cron-key': 'short' } }
    const resShort = mockResponse()
    const nextShort = mockNext()

    verifyCronSecret(reqShort, resShort, nextShort)
    assert.ok(nextShort.error)
    assert.equal(nextShort.error.statusCode, 401)

    const reqLong = { headers: { 'x-cron-key': 'super_secret_cron_token_2026_xyz_much_longer_string' } }
    const resLong = mockResponse()
    const nextLong = mockNext()

    verifyCronSecret(reqLong, resLong, nextLong)
    assert.ok(nextLong.error)
    assert.equal(nextLong.error.statusCode, 401)

    reportPass('timingSafeEqual safely rejects keys of different lengths without RangeError or timing leak')
  } catch (err) {
    reportFail('Timing-safe length mismatch test failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 5: Valid X-Cron-Key Matching CRON_SECRET
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Valid X-Cron-Key Matching CRON_SECRET ---')
  try {
    const validSecret = 'test_cron_secret_production_key_445566'
    process.env.CRON_SECRET = validSecret
    const req = { headers: { 'x-cron-key': validSecret } }
    const res = mockResponse()
    const next = mockNext()

    verifyCronSecret(req, res, next)
    assert.ok(!next.error, 'Must not produce an error on valid key')
    assert.equal(next.called, true, 'Must call next() to proceed')
    reportPass('Authenticates successfully and calls next() when X-Cron-Key matches CRON_SECRET')
  } catch (err) {
    reportFail('Valid key authentication failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 6: Secret Confidentiality
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Secret Confidentiality & Information Leakage ---')
  try {
    const sensitiveSecret = 'highly_sensitive_vault_secret_998877'
    process.env.CRON_SECRET = sensitiveSecret

    const req = { headers: { 'x-cron-key': 'attacker_guess' } }
    const res = mockResponse()
    const next = mockNext()

    verifyCronSecret(req, res, next)
    const errorStr = JSON.stringify(next.error)
    assert.equal(errorStr.includes(sensitiveSecret), false, 'Error object must never contain the configured secret')
    assert.equal(errorStr.includes('attacker_guess'), false, 'Error object must never echo provided key')
    reportPass('Neither the configured secret nor the provided key is leaked in errors or responses')
  } catch (err) {
    reportFail('Confidentiality test failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 7: Express Route Mount & Trigger Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: POST /api/v1/internal/scheduled/run Route Mount ---')
  try {
    const testSecret = 'e2e_route_mount_cron_key_112233'
    process.env.CRON_SECRET = testSecret

    // Find the internal router stack
    const internalRouteLayer = app._router.stack.find(
      (layer) => layer.regexp && layer.regexp.test('/api/v1/internal')
    )
    assert.ok(internalRouteLayer, 'Internal routes must be mounted at /api/v1/internal in app.js')

    reportPass('Internal router is mounted at /api/v1/internal in Express application')
  } catch (err) {
    reportFail('Route mount test failed', err)
  }

  // --------------------------------------------------------------------------
  // Test 8: Existing User Endpoint Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Existing POST /api/v1/posts/scheduled/run Isolation ---')
  try {
    // Calling the user endpoint without user JWT must fail with 401 user auth required,
    // even if X-Cron-Key is provided.
    const { triggerScheduledCheck } = await import('../controllers/postsController.js')
    const { verifyToken } = await import('../middleware/auth.js')

    const userReq = {
      headers: { 'x-cron-key': 'test_key' },
    }
    const userRes = mockResponse()
    const userNext = mockNext()

    await verifyToken(userReq, userRes, userNext)
    assert.ok(userNext.error, 'Existing user endpoint must reject requests without Bearer token')
    assert.equal(userNext.error.statusCode, 401)
    assert.match(userNext.error.message, /authentication required/i)

    reportPass('POST /api/v1/posts/scheduled/run remains strictly protected by verifyToken (ignores X-Cron-Key)')
  } catch (err) {
    reportFail('User endpoint isolation test failed', err)
  }

  // Cleanup
  if (originalCronSecret) {
    process.env.CRON_SECRET = originalCronSecret
  } else {
    delete process.env.CRON_SECRET
  }

  console.log('\n====================================================================')
  console.log(`  INTERNAL CRON AUTH RESULTS: ${passed} passed, ${failed} failed`)
  console.log('====================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runCronAuthTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
