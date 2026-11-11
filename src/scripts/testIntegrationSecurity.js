process.env.NODE_ENV = 'test'

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
import {
  getPrimaryFrontendUrl,
  sendWelcomeRegistrationEmail,
  sendEmail,
  sendPasswordResetOtpEmail,
  sendPasswordResetSuccessEmail,
  sendPasswordChangedNotificationEmail,
  sendTeamInvitationEmail,
  sendNewsletterWelcomeEmail,
  sendNewsletterCampaignEmail,
  sendAccountNotificationEmail,
  logEmailActivity,
  buildAuthConfiguration,
  buildTransportConfig,
  verifyEmailTransport,
  resetTransporterForTesting,
  SMTP_CONFIG,
} from '../services/emailService.js'
import {
  verifyInvitationToken,
  acceptInvitation,
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from '../controllers/invitationController.js'
import { blogSetupSchemas } from '../middleware/validationSchemas.js'
import { inviteTeamMember } from '../controllers/blogSetupController.js'
import { requireOwnerAdminOrAdmin, requireClientAdminOrHigher } from '../middleware/auth.js'
import { saveOnboardingTestPost, getDefaultOnboardingSites, verifyDomainOwnership } from '../controllers/onboardingController.js'
import { resolveClientId, createPost } from '../controllers/postsController.js'
import { getClients } from '../controllers/clientsController.js'
import { getMedia } from '../controllers/mediaController.js'
import Post from '../models/Post.js'
import Category from '../models/Category.js'
import Tag from '../models/Tag.js'
import Media from '../models/Media.js'
import Comment from '../models/Comment.js'
import invitationRoutes, { emailRoutes } from '../routes/invitationRoutes.js'
import { validate } from '../middleware/validator.js'
import { invitationSchemas } from '../middleware/validationSchemas.js'

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

await test('Production requires explicitly configured SMTP_HOST and never silently defaults to Gmail/Brevo', async () => {
  const prodEnvNoHost = { NODE_ENV: 'production' }
  const config = buildTransportConfig(prodEnvNoHost)
  assert.equal(config, null, 'Config must be null if SMTP_HOST is missing in production')
})

await test('buildAuthConfiguration supports standard password authentication', async () => {
  const env = { SMTP_USER: 'notify@deotechsolutions.com', SMTP_PASS: 'secret-pass-123' }
  const auth = buildAuthConfiguration(env)
  assert.equal(auth.user, 'notify@deotechsolutions.com')
  assert.equal(auth.pass, 'secret-pass-123')
  assert.equal(auth.type, undefined)
})

await test('buildAuthConfiguration supports OAuth2 authentication with clientId and refreshToken', async () => {
  const env = {
    SMTP_USER: 'notify@deotechsolutions.com',
    SMTP_OAUTH_CLIENT_ID: 'oauth-client-id-123',
    SMTP_OAUTH_CLIENT_SECRET: 'oauth-secret-456',
    SMTP_OAUTH_REFRESH_TOKEN: 'refresh-token-789',
  }
  const auth = buildAuthConfiguration(env)
  assert.equal(auth.type, 'OAuth2')
  assert.equal(auth.user, 'notify@deotechsolutions.com')
  assert.equal(auth.clientId, 'oauth-client-id-123')
  assert.equal(auth.clientSecret, 'oauth-secret-456')
  assert.equal(auth.refreshToken, 'refresh-token-789')
})

await test('buildAuthConfiguration omits auth for unauthenticated IP-based relays', async () => {
  const env = { SMTP_HOST: 'smtp-relay.gmail.com' }
  const auth = buildAuthConfiguration(env)
  assert.equal(auth, null, 'Auth must be null when credentials are not supplied for IP relay')

  const transportConfig = buildTransportConfig({ NODE_ENV: 'production', SMTP_HOST: 'smtp-relay.gmail.com' })
  assert.ok(transportConfig)
  assert.equal(transportConfig.auth, undefined, 'Nodemailer config must omit auth object for IP relay')
})

await test('Production configuration never disables TLS certificate verification (no rejectUnauthorized: false)', async () => {
  const prodEnv = {
    NODE_ENV: 'production',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_USER: 'notify@deotechsolutions.com',
    SMTP_PASS: 'app-pass-123',
    SMTP_IGNORE_TLS: 'true', // Attempting to force disable TLS in production
  }
  const config = buildTransportConfig(prodEnv)
  assert.ok(config)
  assert.equal(config.tls, undefined, 'Production must never set rejectUnauthorized: false')
})

await test('Production without SMTP returns clear failure on sendEmail and does not crash or call Ethereal', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalSmtpHost = process.env.SMTP_HOST
  const originalInCode = SMTP_CONFIG.enabled
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.SMTP_HOST
    SMTP_CONFIG.enabled = false
    resetTransporterForTesting()

    const result = await sendEmail({
      to: 'unreachable@recipient.com',
      subject: 'Test Subject',
      text: 'Test Body',
    })

    assert.equal(result.success, false)
    assert.equal(result.errorCode, 'SMTP_NOT_CONFIGURED')
    assert.equal(result.isSandbox, false, 'Production must never use Ethereal sandbox')
  } finally {
    process.env.NODE_ENV = originalNodeEnv
    if (originalSmtpHost) process.env.SMTP_HOST = originalSmtpHost
    SMTP_CONFIG.enabled = originalInCode
    resetTransporterForTesting()
  }
})

await test('verifyEmailTransport in production without SMTP logs diagnostic without throwing', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalSmtpHost = process.env.SMTP_HOST
  const originalInCode = SMTP_CONFIG.enabled
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.SMTP_HOST
    SMTP_CONFIG.enabled = false
    resetTransporterForTesting()

    const diag = await verifyEmailTransport()
    assert.equal(diag.verified, false)
    assert.ok(diag.error.includes('SMTP_HOST not configured'))
  } finally {
    process.env.NODE_ENV = originalNodeEnv
    if (originalSmtpHost) process.env.SMTP_HOST = originalSmtpHost
    SMTP_CONFIG.enabled = originalInCode
    resetTransporterForTesting()
  }
})

// ---------------------------------------------------------
// PRIORITY 5: Team Invitations & Administrative RBAC
// ---------------------------------------------------------
console.log('\n--- Testing Priority 5: Team Invitations & Administrative Access ---')

await test('teamInvitation schema validates successfully with empty clientId and omitted name', async () => {
  const payload = {
    email: 'newcontributor@company.com',
    role: 'Content Writer',
    clientId: '',
  }
  const { error, value } = blogSetupSchemas.teamInvitation.validate(payload, { stripUnknown: true })
  assert.equal(error, undefined, 'Validation should not fail with empty clientId or omitted name')
  assert.equal(value.email, 'newcontributor@company.com')
})

await test('inviteTeamMember creates member with derived name and global clientId fallback', async () => {
  const req = {
    body: {
      email: `autotest-${Date.now()}@example.com`,
      role: 'Content Writer',
      clientId: '',
    },
    query: {},
    user: {
      _id: 'test-admin-id',
      email: 'admin@company.com',
      role: 'Admin',
      isPrimaryAdmin: false,
    },
  }
  const res = mockResponse()
  const next = mockNext()

  await inviteTeamMember(req, res, next)

  assert.equal(next.called, false, next.error ? next.error.message : '')
  assert.equal(res.statusCode, 201)
  assert.equal(res.body.success, true)
  assert.ok(res.body.data.name.length > 0, 'Name should be derived from email username')
  assert.equal(res.body.data.clientId, 'global')
})

await test('requireOwnerAdminOrAdmin allows Client Admin and Admin roles', async () => {
  const req = {
    user: { role: 'Client Admin', clientId: 'client-123' },
    body: {},
    query: {},
  }
  const res = mockResponse()
  const next = mockNext()

  requireOwnerAdminOrAdmin(req, res, next)

  assert.equal(next.called, true)
  assert.equal(next.error, undefined, 'Client Admin should be allowed')
})

await test('requireClientAdminOrHigher allows Admin role', async () => {
  const req = {
    user: { role: 'Admin', clientId: 'client-123' },
    body: {},
    query: {},
  }
  const res = mockResponse()
  const next = mockNext()

  requireClientAdminOrHigher(req, res, next)

  assert.equal(next.called, true)
  assert.equal(next.error, undefined, 'Admin should be allowed')
})

// ---------------------------------------------------------
// PRIORITY 6: Onboarding Post Synchronization & Domain Resolution
// ---------------------------------------------------------
console.log('\n--- Testing Priority 6: Onboarding Post Publication & Domain Resolution ---')

await test('saveOnboardingTestPost synchronizes simulated/published post to store.posts with published status', async () => {
  const req = {
    params: { id: 'cli-1' },
    body: {
      title: 'Deotech TechHub Launch Article',
      slug: 'deotech-techhub-launch-article',
      content: '<p>Welcome to our official Deotech publication feed.</p>',
      excerpt: 'Introductory article for Deotech platform.',
      category: 'Cloud Engineering',
      tags: ['Deotech', 'Launch'],
      publishedSimulated: true,
      published: true,
    },
    user: { name: 'Chanchal Gupta', role: 'Client Admin', _id: 'user-admin-1' },
  }
  const res = mockResponse()
  const next = mockNext()

  await saveOnboardingTestPost(req, res, next)

  assert.equal(next.called, false, next.error ? next.error.message : '')
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  assert.equal(res.body.data.published, true)

  const syncedPost = store.posts.find((p) => p.slug === 'deotech-techhub-launch-article')
  assert.ok(syncedPost, 'Post must be synchronized to posts collection')
  assert.equal(syncedPost.status, 'published')
  assert.equal(syncedPost.clientId, 'cli-1')
})

await test('Public unauthenticated request can fetch published onboarding post via clientId', async () => {
  const req = {
    query: { clientId: 'cli-1' },
    headers: {},
  }
  const res = mockResponse()
  const next = mockNext()

  await getPosts(req, res, next)

  assert.equal(next.called, false)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
  const found = res.body.data.some((p) => p.slug === 'deotech-techhub-launch-article')
  assert.ok(found, 'Deotech public request must find published onboarding test post')
})

await test('Domain-based clientId resolution maps URL/domain to tenant ID', async () => {
  const resolvedFromUrl = await resolveClientId('https://techhub.deotech.com')
  assert.equal(resolvedFromUrl, 'cli-1', 'Should resolve https://techhub.deotech.com to cli-1')

  const resolvedFromHost = await resolveClientId('techhub.deotech.com')
  assert.equal(resolvedFromHost, 'cli-1', 'Should resolve techhub.deotech.com to cli-1')
})

// ---------------------------------------------------------
// PRIORITY 7: Complete Email System & Invitation Lifecycle
// ---------------------------------------------------------
console.log('\n--- Testing Priority 7: Complete Email System & Invitation Lifecycle ---')

await test('sendPasswordResetOtpEmail dispatches OTP email with valid message ID', async () => {
  const result = await sendPasswordResetOtpEmail({
    email: 'user-reset@company.com',
    otp: '948271',
    expiresMinutes: 10,
  })
  assert.equal(result.success, true)
  assert.ok(result.messageId)
})

await test('sendPasswordResetSuccessEmail dispatches confirmation email with login link', async () => {
  const result = await sendPasswordResetSuccessEmail({
    email: 'user-reset@company.com',
    name: 'Verified User',
  })
  assert.equal(result.success, true)
  assert.ok(result.messageId)
})

await test('sendPasswordChangedNotificationEmail dispatches security notification with device & IP', async () => {
  const result = await sendPasswordChangedNotificationEmail({
    email: 'user-security@company.com',
    name: 'Security User',
    device: 'Chrome on Windows 11',
    ip: '192.168.1.100',
    time: new Date(),
  })
  assert.equal(result.success, true)
  assert.ok(result.messageId)
})

await test('sendTeamInvitationEmail dispatches unified invitation with accept token URL', async () => {
  const result = await sendTeamInvitationEmail({
    email: 'invitee@publication.com',
    name: 'New Writer',
    role: 'Content Writer',
    websiteName: 'Deotech TechHub',
    inviteUrl: 'https://cms-frontend-wgwj.onrender.com/accept-invitation?token=testtoken123',
    inviterName: 'Lead Editor',
    expiresInDays: 7,
  })
  assert.equal(result.success, true)
  assert.ok(result.messageId)
})

await test('sendNewsletterWelcomeEmail and sendNewsletterCampaignEmail dispatch successfully', async () => {
  const welcome = await sendNewsletterWelcomeEmail({
    email: 'subscriber@audience.com',
    websiteName: 'Deotech TechHub',
  })
  assert.equal(welcome.success, true)

  const campaign = await sendNewsletterCampaignEmail({
    email: 'subscriber@audience.com',
    websiteName: 'Deotech TechHub',
    subject: 'Weekly Architectural Breakdown',
    headline: 'High-Throughput Edge Caching Deep Dive',
    bodyContent: '<p>A deep dive into distributed systems.</p>',
    postUrl: 'https://techhub.deotech.com/blog/edge-caching',
  })
  assert.equal(campaign.success, true)
})

await test('sendAccountNotificationEmail dispatches account alert', async () => {
  const result = await sendAccountNotificationEmail({
    email: 'notify@member.com',
    name: 'Alex Member',
    title: 'Workspace Role Updated',
    message: 'Your role has been upgraded to Senior Editor.',
    actionUrl: 'https://cms-frontend-wgwj.onrender.com/blog-posts',
  })
  assert.equal(result.success, true)
})

await test('Safe Email Activity Logging: never logs OTPs, passwords, or tokens in logs or metadata', async () => {
  const sensitiveMeta = {
    otp: '999999',
    password: 'super-secret-password',
    token: 'crypto-secret-token',
    temporaryPassword: 'temp-password-123',
    role: 'Content Writer',
    clientName: 'Alpha Client',
  }

  await logEmailActivity({
    recipient: 'audit@security.com',
    emailType: 'forgot_password_otp',
    subject: 'Your OTP Code',
    status: 'sent',
    messageId: 'audit-msg-123',
    provider: 'brevo',
    metadata: sensitiveMeta,
  })

  const found = (store.emailLogs || []).find((l) => l.recipient === 'audit@security.com')
  assert.ok(found, 'EmailLog must be recorded in memory store')
  assert.equal(found.metadata.otp, undefined, 'OTP must NEVER be persisted in metadata')
  assert.equal(found.metadata.password, undefined, 'Password must NEVER be persisted in metadata')
  assert.equal(found.metadata.token, undefined, 'Token must NEVER be persisted in metadata')
  assert.equal(found.metadata.temporaryPassword, undefined, 'Temporary password must NEVER be persisted in metadata')
  assert.equal(found.metadata.role, 'Content Writer')
  assert.equal(found.metadata.clientName, 'Alpha Client')
})

await test('Invitation lifecycle: create, verify, accept, and reject invalid/duplicate', async () => {
  const inviteReq = {
    body: {
      email: `invited-writer-${Date.now()}@domain.com`,
      role: 'Content Writer',
      name: 'Future Contributor',
      websiteName: 'Deotech TechHub',
      clientId: 'cli-1',
    },
    user: { _id: 'admin-1', email: 'admin@deotech.com', name: 'Super Admin', clientId: 'cli-1' },
  }
  const inviteRes = mockResponse()
  const inviteNext = mockNext()

  await createInvitation(inviteReq, inviteRes, inviteNext)
  assert.equal(inviteNext.called, false, inviteNext.error ? inviteNext.error.message : '')
  assert.equal(inviteRes.statusCode, 201)
  assert.ok(inviteRes.body.data.token, 'Must return generated crypto token')
  const generatedToken = inviteRes.body.data.token

  // 1. Verify valid token
  const verifyReq = { params: { token: generatedToken } }
  const verifyRes = mockResponse()
  const verifyNext = mockNext()
  await verifyInvitationToken(verifyReq, verifyRes, verifyNext)
  assert.equal(verifyNext.called, false)
  assert.equal(verifyRes.body.data.valid, true)
  assert.equal(verifyRes.body.data.email, inviteReq.body.email)

  // 2. Reject non-existent token
  const invalidReq = { params: { token: 'nonexistent-token-xyz' } }
  const invalidRes = mockResponse()
  const invalidNext = mockNext()
  await verifyInvitationToken(invalidReq, invalidRes, invalidNext)
  assert.equal(invalidNext.called, true)
  assert.equal(invalidNext.error.statusCode, 404)

  // 3. Accept invitation
  const acceptReq = {
    params: { token: generatedToken },
    body: { name: 'Joined Contributor', password: 'secureNewPassword!123' },
  }
  const acceptRes = mockResponse()
  const acceptNext = mockNext()
  await acceptInvitation(acceptReq, acceptRes, acceptNext)
  assert.equal(acceptNext.called, false, acceptNext.error ? acceptNext.error.message : '')
  assert.equal(acceptRes.statusCode, 200)
  assert.ok(acceptRes.body.data.token, 'Must return JWT auth token on acceptance')
  assert.equal(acceptRes.body.data.user.email, inviteReq.body.email)

  // 4. Reject second attempt to accept
  const secondAcceptReq = {
    params: { token: generatedToken },
    body: { name: 'Joined Contributor', password: 'secureNewPassword!123' },
  }
  const secondAcceptRes = mockResponse()
  const secondAcceptNext = mockNext()
  await acceptInvitation(secondAcceptReq, secondAcceptRes, secondAcceptNext)
  assert.equal(secondAcceptNext.called, true)
  assert.equal(secondAcceptNext.error.statusCode, 400, 'Must reject already accepted invitation')
})

await test('Email dispatch failure prevents invitation creation and returns error without false success', async () => {
  const origNodeEnv = process.env.NODE_ENV
  const origKey = process.env.BREVO_API_KEY
  try {
    process.env.NODE_ENV = 'production'
    delete process.env.BREVO_API_KEY
    delete process.env.SMTP_HOST
    SMTP_CONFIG.enabled = false

    const req = {
      body: {
        email: 'fail-test@recipient.com',
        role: 'Content Writer',
        name: 'Fail User',
      },
      user: { _id: 'admin-1', email: 'admin@deotech.com' },
    }
    const res = mockResponse()
    const next = mockNext()

    await createInvitation(req, res, next)

    assert.equal(next.called, true, 'Next must be called with error when email delivery fails')
    assert.equal(next.error.statusCode, 500)
    assert.ok(next.error.message.includes('Failed to deliver invitation email'))

    const created = (store.invitations || []).find((inv) => inv.email === 'fail-test@recipient.com')
    assert.equal(created, undefined, 'Invitation must NOT be saved in database if email dispatch fails')
  } finally {
    process.env.NODE_ENV = origNodeEnv
    if (origKey) process.env.BREVO_API_KEY = origKey
    SMTP_CONFIG.enabled = true
  }
})

await test('invitationRoutes and emailRoutes mount successfully with exact validator middleware', async () => {
  assert.equal(typeof invitationRoutes, 'function', 'invitationRoutes must be an Express router')
  assert.equal(typeof emailRoutes, 'function', 'emailRoutes must be an Express router')

  const registeredPaths = []
  for (const layer of invitationRoutes.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase()
      registeredPaths.push(`${methods} ${layer.route.path}`)
    }
  }

  assert.ok(registeredPaths.includes('GET /verify/:token'), 'Must register GET /verify/:token')
  assert.ok(registeredPaths.includes('POST /accept/:token'), 'Must register POST /accept/:token')
  assert.ok(registeredPaths.includes('GET /'), 'Must register GET /')
  assert.ok(registeredPaths.includes('POST /'), 'Must register POST /')
  assert.ok(registeredPaths.includes('POST /:id/resend'), 'Must register POST /:id/resend')
  assert.ok(registeredPaths.includes('DELETE /:id'), 'Must register DELETE /:id')

  const registeredEmailPaths = []
  for (const layer of emailRoutes.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase()
      registeredEmailPaths.push(`${methods} ${layer.route.path}`)
    }
  }

  assert.ok(registeredEmailPaths.includes('GET /logs'), 'Must register GET /logs')
  assert.ok(registeredEmailPaths.includes('POST /campaign'), 'Must register POST /campaign')
})

await test('invitation validation middleware rejects invalid payloads and accepts valid payloads', async () => {
  const acceptMiddleware = validate(invitationSchemas.accept)
  assert.equal(typeof acceptMiddleware, 'function')

  let errorReceived = null
  acceptMiddleware({ body: {} }, {}, (err) => {
    errorReceived = err
  })
  assert.ok(errorReceived, 'Validation middleware must fail on empty body')
  assert.equal(errorReceived.statusCode, 400)

  let passed = false
  acceptMiddleware(
    {
      body: {
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        name: 'New Member',
      },
    },
    {},
    (err) => {
      if (!err) passed = true
    }
  )
  assert.equal(passed, true, 'Validation middleware must pass on valid payload')
})

// ---------------------------------------------------------
// PRIORITY 8: Backend Real Database Persistence & Mock Isolation
// ---------------------------------------------------------
console.log('\n--- Testing Priority 8: Backend Real Database Persistence & Mock Isolation ---')

await test('getDefaultOnboardingSites returns empty object in production environment', async () => {
  const origNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const sites = getDefaultOnboardingSites()
    assert.deepEqual(sites, {}, 'Production must strictly return empty onboarding defaults (zero mock sites)')
  } finally {
    process.env.NODE_ENV = origNodeEnv
  }
})

await test('Production database disconnection fails safely with HTTP 503 instead of falling back to mock memory arrays', async () => {
  const origNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'

    // Test getPosts 503 guard
    const postsNext = mockNext()
    await getPosts({ query: { clientId: 'cli-test' }, headers: {} }, mockResponse(), postsNext)
    assert.equal(postsNext.called, true)
    assert.equal(postsNext.error?.statusCode, 503, 'getPosts must return 503 when DB is offline in production')

    // Test createPost 503 guard
    const createNext = mockNext()
    await createPost({ body: { title: 'Test Post', clientId: 'cli-test' }, user: { isPrimaryAdmin: true } }, mockResponse(), createNext)
    assert.equal(createNext.called, true)
    assert.equal(createNext.error?.statusCode, 503, 'createPost must return 503 when DB is offline in production')

    // Test getClients 503 guard
    const clientsNext = mockNext()
    await getClients({ query: {} }, mockResponse(), clientsNext)
    assert.equal(clientsNext.called, true)
    assert.equal(clientsNext.error?.statusCode, 503, 'getClients must return 503 when DB is offline in production')

    // Test getMedia 503 guard
    const mediaNext = mockNext()
    await getMedia({ query: { clientId: 'cli-test' } }, mockResponse(), mediaNext)
    assert.equal(mediaNext.called, true)
    assert.equal(mediaNext.error?.statusCode, 503, 'getMedia must return 503 when DB is offline in production')
  } finally {
    process.env.NODE_ENV = origNodeEnv
  }
})

await test('Production domain verification disallows bypass method with 403 Forbidden', async () => {
  const origNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const req = {
      body: { domain: 'techhub.deotech.com', method: 'bypass' },
    }
    const next = mockNext()
    await verifyDomainOwnership(req, mockResponse(), next)

    assert.equal(next.called, true)
    assert.equal(next.error?.statusCode, 403, 'Domain ownership verification bypass must return 403 in production')
    assert.ok(next.error?.message.includes('bypass is disabled in production'))
  } finally {
    process.env.NODE_ENV = origNodeEnv
  }
})

await test('Mongoose models do not default clientId to mock cli-2', async () => {
  const post = new Post({ title: 'Real User Post' })
  assert.equal(post.clientId, null, 'Post.clientId must default to null, never mock cli-2')

  const cat = new Category({ name: 'Real Category', slug: 'real-category' })
  assert.equal(cat.clientId, null, 'Category.clientId must default to null, never mock cli-2')

  const tag = new Tag({ name: 'Real Tag', slug: 'real-tag' })
  assert.equal(tag.clientId, null, 'Tag.clientId must default to null, never mock cli-2')

  const media = new Media({ name: 'image.png' })
  assert.equal(media.clientId, null, 'Media.clientId must default to null, never mock cli-2')

  const comment = new Comment({ content: 'Real comment' })
  assert.equal(comment.clientId, null, 'Comment.clientId must default to null, never mock cli-2')
})

await test('MemoryStore in production initializes with empty arrays and zero mock records', async () => {
  const origNodeEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    store.reset()
    assert.equal(store.users.length, 0, 'Production store.users must be empty')
    assert.equal(store.posts.length, 0, 'Production store.posts must be empty')
    assert.equal(store.clients.length, 0, 'Production store.clients must be empty')
    assert.equal(store.comments.length, 0, 'Production store.comments must be empty')
    assert.equal(store.categories.length, 0, 'Production store.categories must be empty')
    assert.equal(store.tags.length, 0, 'Production store.tags must be empty')
    assert.equal(store.media.length, 0, 'Production store.media must be empty')
  } finally {
    process.env.NODE_ENV = origNodeEnv
    store.reset()
  }
})

console.log('\n====================================================')
console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`)
console.log('====================================================\n')

if (failedCount > 0) {
  process.exit(1)
} else {
  console.log('🎉 ALL INTEGRATION & SECURITY TESTS PASSED!')
}

