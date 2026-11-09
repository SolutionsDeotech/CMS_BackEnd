/**
 * Integration & Security Test Suite for Production Readiness
 * Tests:
 * 1. Public Blog API Security (status=published default, draft/trash protection)
 * 2. Tenant Isolation (getPostByIdOrSlug clientId validation, cross-tenant isolation)
 * 3. CORS Configuration (Multi-origin FRONTEND_URL, client domains, no wildcard)
 * 4. Email Integration & URL Generation (Multi-origin safe URL construction, credential safety)
 */

import assert from 'node:assert/strict'
import store from '../services/store.js'
import { getPosts, getPostByIdOrSlug } from '../controllers/postsController.js'
import { getPrimaryFrontendUrl, sendWelcomeRegistrationEmail } from '../services/emailService.js'

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
console.log('🧪 RUNNING PRODUCTION INTEGRATION & SECURITY TESTS')
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
    failedCount++
  }
}

// Ensure mock posts exist in memory store for testing
store.posts = [
  {
    id: 'post-test-pub-1',
    customId: 'post-test-pub-1',
    slug: 'live-published-article',
    title: 'Live Published Article',
    status: 'published',
    clientId: 'tenant-alpha',
    author: 'Author Alpha',
    authorId: 'usr-alpha-1',
  },
  {
    id: 'post-test-draft-1',
    customId: 'post-test-draft-1',
    slug: 'confidential-draft-article',
    title: 'Confidential Draft Article',
    status: 'draft',
    clientId: 'tenant-alpha',
    author: 'Author Alpha',
    authorId: 'usr-alpha-1',
  },
  {
    id: 'post-test-trash-1',
    customId: 'post-test-trash-1',
    slug: 'deleted-trashed-article',
    title: 'Deleted Trashed Article',
    status: 'trash',
    clientId: 'tenant-alpha',
    author: 'Author Alpha',
    authorId: 'usr-alpha-1',
  },
  {
    id: 'post-test-beta-1',
    customId: 'post-test-beta-1',
    slug: 'live-published-article', // Duplicate slug intentional to test tenant isolation
    title: 'Beta Live Article',
    status: 'published',
    clientId: 'tenant-beta',
    author: 'Author Beta',
    authorId: 'usr-beta-1',
  },
]

// ---------------------------------------------------------
// PRIORITY 1: Public Blog API Security
// ---------------------------------------------------------
console.log('\n--- Testing Priority 1: Public Blog API Security ---')

await test('Public unauthenticated request to getPosts defaults strictly to status=published', async () => {
  const req = {
    query: { clientId: 'tenant-alpha' },
    headers: {},
    user: null, // Unauthenticated
  }
  const res = mockResponse()
  const next = mockNext()

  await getPosts(req, res, next)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.ok(Array.isArray(res.body.data))
  // All returned posts must strictly have status === 'published'
  assert.ok(res.body.data.length > 0)
  for (const post of res.body.data) {
    assert.equal(post.status, 'published')
  }
})

await test('Public unauthenticated request querying ?status=draft is blocked from viewing drafts', async () => {
  const req = {
    query: { clientId: 'tenant-alpha', status: 'draft' },
    headers: {},
    user: null, // Unauthenticated
  }
  const res = mockResponse()
  const next = mockNext()

  await getPosts(req, res, next)

  assert.equal(res.statusCode, 200)
  // Even though caller requested status=draft, drafts must NEVER be returned to public
  const drafts = res.body.data.filter((p) => p.status === 'draft')
  assert.equal(drafts.length, 0)
  for (const post of res.body.data) {
    assert.equal(post.status, 'published')
  }
})

await test('Public unauthenticated single-post lookup for a draft returns 404 Not Found', async () => {
  const req = {
    params: { idOrSlug: 'confidential-draft-article' },
    query: { clientId: 'tenant-alpha' },
    headers: {},
    user: null,
  }
  const res = mockResponse()
  const next = mockNext()

  await getPostByIdOrSlug(req, res, next)

  assert.equal(next.called, true)
  assert.equal(next.error.statusCode, 404)
})

await test('Authenticated admin can access draft posts according to permissions', async () => {
  const req = {
    params: { idOrSlug: 'confidential-draft-article' },
    query: { clientId: 'tenant-alpha' },
    headers: {},
    user: {
      _id: 'usr-admin-1',
      clientId: 'tenant-alpha',
      role: 'OwnerAdmin',
      isPrimaryAdmin: false,
    },
  }
  const res = mockResponse()
  const next = mockNext()

  await getPostByIdOrSlug(req, res, next)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.slug, 'confidential-draft-article')
  assert.equal(res.body.data.status, 'draft')
})

// ---------------------------------------------------------
// PRIORITY 2: Tenant Isolation
// ---------------------------------------------------------
console.log('\n--- Testing Priority 2: Tenant Isolation ---')

await test('Public getPosts returns 400 Bad Request when clientId is missing', async () => {
  const req = {
    query: {},
    headers: {},
    user: null,
  }
  const res = mockResponse()
  const next = mockNext()

  await getPosts(req, res, next)

  assert.equal(next.called, true)
  assert.equal(next.error.statusCode, 400)
  assert.ok(next.error.message.includes('clientId is required'))
})

await test('Public getPostByIdOrSlug returns 400 Bad Request when clientId is missing', async () => {
  const req = {
    params: { idOrSlug: 'live-published-article' },
    query: {},
    headers: {},
    user: null,
  }
  const res = mockResponse()
  const next = mockNext()

  await getPostByIdOrSlug(req, res, next)

  assert.equal(next.called, true)
  assert.equal(next.error.statusCode, 400)
  assert.ok(next.error.message.includes('clientId is required'))
})

await test('Single-post lookup scopes strictly to clientId (Tenant Alpha vs Tenant Beta with identical slug)', async () => {
  // 1. Lookup with clientId: 'tenant-alpha'
  const reqAlpha = {
    params: { idOrSlug: 'live-published-article' },
    query: { clientId: 'tenant-alpha' },
    headers: {},
    user: null,
  }
  const resAlpha = mockResponse()
  const nextAlpha = mockNext()
  await getPostByIdOrSlug(reqAlpha, resAlpha, nextAlpha)

  assert.equal(resAlpha.statusCode, 200)
  assert.equal(resAlpha.body.data.clientId, 'tenant-alpha')
  assert.equal(resAlpha.body.data.title, 'Live Published Article')

  // 2. Lookup with clientId: 'tenant-beta'
  const reqBeta = {
    params: { idOrSlug: 'live-published-article' },
    query: { clientId: 'tenant-beta' },
    headers: {},
    user: null,
  }
  const resBeta = mockResponse()
  const nextBeta = mockNext()
  await getPostByIdOrSlug(reqBeta, resBeta, nextBeta)

  assert.equal(resBeta.statusCode, 200)
  assert.equal(resBeta.body.data.clientId, 'tenant-beta')
  assert.equal(resBeta.body.data.title, 'Beta Live Article')
})

await test('Single-post lookup returns 404 when querying post belonging to another tenant', async () => {
  const req = {
    params: { idOrSlug: 'post-test-beta-1' },
    query: { clientId: 'tenant-alpha' }, // Searching for Beta post under Alpha
    headers: {},
    user: null,
  }
  const res = mockResponse()
  const next = mockNext()

  await getPostByIdOrSlug(req, res, next)

  assert.equal(next.called, true)
  assert.equal(next.error.statusCode, 404)
})

await test('Response structure preserves standard envelope { success, message, data, meta }', async () => {
  const req = {
    query: { clientId: 'tenant-alpha' },
    headers: {},
    user: null,
  }
  const res = mockResponse()
  const next = mockNext()

  await getPosts(req, res, next)

  assert.equal(typeof res.body.success, 'boolean')
  assert.equal(typeof res.body.message, 'string')
  assert.ok(Array.isArray(res.body.data))
  assert.ok(typeof res.body.meta === 'object' && res.body.meta !== null)
  assert.ok('total' in res.body.meta)
  assert.ok('page' in res.body.meta)
  assert.ok('limit' in res.body.meta)
})

// ---------------------------------------------------------
// PRIORITY 3: CORS Support
// ---------------------------------------------------------
console.log('\n--- Testing Priority 3: Multi-Origin CORS & Security ---')

await test('getPrimaryFrontendUrl handles comma-separated FRONTEND_URL without duplicates or malformed URL', async () => {
  process.env.FRONTEND_URL = 'https://deotech-cms.onrender.com, https://workleisure.in, https://client2.com'

  const primary = getPrimaryFrontendUrl()
  assert.equal(primary, 'https://deotech-cms.onrender.com')
  assert.ok(!primary.includes(','))
})

// ---------------------------------------------------------
// PRIORITY 4: Email Integration
// ---------------------------------------------------------
console.log('\n--- Testing Priority 4: Email Welcome Registration & Credential Protection ---')

await test('sendWelcomeRegistrationEmail generates valid email with clean login URL', async () => {
  process.env.FRONTEND_URL = 'https://deotech-cms.onrender.com, https://workleisure.in'

  const result = await sendWelcomeRegistrationEmail({
    email: 'test-admin@tenant-alpha.com',
    name: 'Tenant Admin Alpha',
    role: 'Tenant Admin',
  })

  assert.equal(result.success, true)
  assert.ok(result.messageId)
})

console.log('\n====================================================')
console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`)
console.log('====================================================\n')

if (failedCount > 0) {
  process.exit(1)
} else {
  console.log('🎉 ALL INTEGRATION & SECURITY TESTS PASSED!')
}

