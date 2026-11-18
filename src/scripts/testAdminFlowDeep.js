process.env.NODE_ENV = 'test'

import assert from 'node:assert/strict'
import store from '../services/store.js'
import {
  getBlogHomeSettings,
  updateBlogHomeSettings,
  getCommentSettings,
  updateCommentSettings,
  getIntegrations,
  updateIntegration,
  testIntegrationConnection,
  getWriters,
  createWriter,
  updateWriter,
  deleteWriter,
  getNewsletterSettings,
  updateNewsletterSettings,
  getTeamMembers,
  inviteTeamMember,
  updateTeamMember,
  deleteTeamMember,
  resendTeamInvite,
  updateTeamMemberPermissions,
  importPosts,
  exportPosts,
  emptyPostTrash,
  publishInstagramPost,
} from '../controllers/blogSetupController.js'
import {
  createRole,
  updateRolePermission,
  deleteRole,
  getRoles,
  getActivities,
  getRedirects,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  subscribeNewsletter,
  getSubscribers,
  updateSubscriber,
  deleteSubscriber,
  getAnalyticsOverview,
  getTrafficSources,
  getDeviceBreakdown,
  getSearchPerformance,
  getSeoHealth,
  updateSeoTaskStatus,
} from '../controllers/opsController.js'
import {
  getPosts,
  getPostByIdOrSlug,
  createPost,
  updatePost,
  deletePost,
  getPostStats,
} from '../controllers/postsController.js'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getTags,
  createTag,
  updateTag,
  deleteTag,
} from '../controllers/taxonomyController.js'
import {
  getComments,
  addComment,
  updateComment,
  deleteComment,
  replyToComment,
} from '../controllers/commentsController.js'
import {
  getClientIntegration,
  updateClientIntegration,
  testWebhookPing,
} from '../controllers/universalIntegrationController.js'
import {
  probeWebsiteReachability,
  verifyDomainOwnership,
  validateBlogLocation,
  createOnboardingInvitation,
  resendOnboardingInvitation,
  revokeOnboardingInvitation,
  saveOnboardingTestPost,
} from '../controllers/onboardingController.js'
import {
  createInvitation,
  verifyInvitationToken,
  acceptInvitation,
  resendInvitation,
  revokeInvitation,
} from '../controllers/invitationController.js'

function mockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setHeader(k, v) {
      this.headers[k] = v
      return this
    },
    send(data) {
      this.body = data
      return this
    },
  }
  return res
}

function mockNext() {
  const fn = function (err) {
    fn.called = true
    fn.error = err
  }
  fn.called = false
  fn.error = null
  return fn
}

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✅ [PASS] ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`)
    console.error(`     Error: ${err.message}`)
    if (err.stack) console.error(`     ${err.stack.split('\n')[1]}`)
    failed++
  }
}

console.log('====================================================')
console.log('🧪 RUNNING DEEP COMPREHENSIVE ADMIN FUNCTIONALITY TESTS')
console.log('====================================================')

const adminUser = {
  _id: 'usr-client-admin-1',
  name: 'Client Admin',
  email: 'clientadmin@example.com',
  role: 'Client Admin',
  userType: 'Admin',
  clientId: 'tenant-test-1',
  isPrimaryAdmin: false,
}

// ----------------------------------------------------
// 1. Dashboard & Posts Stats
// ----------------------------------------------------
console.log('\n--- 1. Dashboard & Post Metrics ---')

await test('getPostStats returns counts for total, published, and drafts', async () => {
  const req = { user: adminUser, query: { clientId: 'tenant-test-1' } }
  const res = mockResponse()
  const next = mockNext()
  await getPostStats(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.success)
  assert.ok(typeof res.body.data.total === 'number')
  assert.ok(Array.isArray(res.body.data.chartData))
})

// ----------------------------------------------------
// 2. Posts CRUD
// ----------------------------------------------------
console.log('\n--- 2. Posts CRUD Flow ---')

let createdPostId = null

await test('Admin creates a new published post', async () => {
  const req = {
    user: adminUser,
    body: {
      title: 'Modern CMS Architecture',
      slug: `modern-cms-${Date.now()}`,
      content: '<p>Comprehensive architecture overview.</p>',
      category: 'Engineering',
      tags: ['Architecture', 'NodeJS'],
      status: 'published',
      clientId: 'tenant-test-1',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await createPost(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 201)
  assert.ok(res.body.data._id || res.body.data.id)
  createdPostId = String(res.body.data._id || res.body.data.id)
})

await test('Admin updates an existing post', async () => {
  const req = {
    user: adminUser,
    params: { id: createdPostId },
    body: {
      title: 'Modern CMS Architecture - Updated',
      content: '<p>Updated content.</p>',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await updatePost(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin retrieves posts scoped to their client', async () => {
  const req = { user: adminUser, query: { clientId: 'tenant-test-1' } }
  const res = mockResponse()
  const next = mockNext()
  await getPosts(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.body.data))
  assert.ok(res.body.data.some(p => String(p._id || p.id) === createdPostId))
})

await test('Admin deletes a post', async () => {
  const req = { user: adminUser, params: { id: createdPostId } }
  const res = mockResponse()
  const next = mockNext()
  await deletePost(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

// ----------------------------------------------------
// 3. Taxonomy CRUD (Categories & Tags)
// ----------------------------------------------------
console.log('\n--- 3. Taxonomy (Categories & Tags) ---')

let createdCatId = null
await test('Admin creates a category', async () => {
  const req = {
    user: adminUser,
    body: { name: `Tech News ${Date.now()}`, slug: `tech-news-${Date.now()}`, clientId: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await createCategory(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 201)
  createdCatId = String(res.body.data._id || res.body.data.id)
})

await test('Admin retrieves categories for tenant', async () => {
  const req = { user: adminUser, query: { clientId: 'tenant-test-1' } }
  const res = mockResponse()
  const next = mockNext()
  await getCategories(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.body.data))
})

await test('Admin deletes category', async () => {
  const req = { user: adminUser, params: { id: createdCatId } }
  const res = mockResponse()
  const next = mockNext()
  await deleteCategory(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

let createdTagId = null
await test('Admin creates a tag', async () => {
  const req = {
    user: adminUser,
    body: { name: `Tag-${Date.now()}`, slug: `tag-${Date.now()}`, clientId: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await createTag(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 201)
  createdTagId = String(res.body.data._id || res.body.data.id)
})

await test('Admin deletes tag', async () => {
  const req = { user: adminUser, params: { id: createdTagId } }
  const res = mockResponse()
  const next = mockNext()
  await deleteTag(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

// ----------------------------------------------------
// 4. Team Members & Roles Management
// ----------------------------------------------------
console.log('\n--- 4. Team Members & Roles Management ---')

let invitedMemberId = null
const testEmail = `writer-${Date.now()}@example.com`

await test('Admin invites an operational team member (Content Writer)', async () => {
  const req = {
    user: adminUser,
    body: {
      email: testEmail,
      role: 'Content Writer',
      name: 'New Writer',
      clientId: 'tenant-test-1',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await inviteTeamMember(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 201)
  assert.ok(res.body.data.id)
  invitedMemberId = res.body.data.id
})

await test('Admin updates team member role', async () => {
  const req = {
    user: adminUser,
    params: { id: invitedMemberId },
    query: { clientId: 'tenant-test-1' },
    body: { role: 'Editor' },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateTeamMember(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin updates team member permissions', async () => {
  const req = {
    user: adminUser,
    params: { id: invitedMemberId },
    query: { clientId: 'tenant-test-1' },
    body: { canViewComments: true, canReplyComments: true },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateTeamMemberPermissions(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin resends team invite email', async () => {
  const req = {
    user: adminUser,
    params: { id: invitedMemberId },
    query: { clientId: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await resendTeamInvite(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin retrieves team member list', async () => {
  const req = {
    user: adminUser,
    query: { clientId: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await getTeamMembers(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.body.data))
  assert.ok(res.body.data.some(m => m.id === invitedMemberId))
})

await test('Admin deletes team member', async () => {
  const req = {
    user: adminUser,
    params: { id: invitedMemberId },
    query: { clientId: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await deleteTeamMember(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

// ----------------------------------------------------
// 5. Custom Roles & RBAC Restrictions
// ----------------------------------------------------
console.log('\n--- 5. Custom Roles & RBAC Restrictions ---')

let createdRoleId = null

await test('Admin creates custom operational role (SEO Specialist)', async () => {
  const req = {
    user: adminUser,
    body: {
      name: `SEO Specialist ${Date.now()}`,
      description: 'Manages meta tags and sitemaps',
      permission: 'Limited Access',
      permissions: { seo: ['view', 'edit'], analytics: ['view'] },
      clientId: 'tenant-test-1',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await createRole(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 201)
  createdRoleId = String(res.body.data.id || res.body.data._id)
})

await test('Admin is blocked from creating Admin or Super Admin role', async () => {
  const req = {
    user: adminUser,
    body: {
      name: 'Secondary Admin',
      description: 'Admin attempt',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await createRole(req, res, next)
  assert.equal(next.called, true)
  assert.equal(next.error.statusCode, 403)
})

await test('Admin updates custom role permissions tier', async () => {
  const req = {
    user: adminUser,
    params: { id: createdRoleId },
    body: { permission: 'Full Access' },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateRolePermission(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin deletes custom role', async () => {
  const req = {
    user: adminUser,
    params: { id: createdRoleId },
  }
  const res = mockResponse()
  const next = mockNext()
  await deleteRole(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

// ----------------------------------------------------
// 6. Comments Moderation & Policies
// ----------------------------------------------------
console.log('\n--- 6. Comments Moderation & Policies ---')

await test('Admin updates comment policy and spam keywords', async () => {
  const req = {
    user: adminUser,
    query: { clientId: 'tenant-test-1' },
    body: {
      moderationPolicy: 'all',
      autoFlagLinks: true,
      blockedWords: ['spam', 'viagra', 'casino'],
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateCommentSettings(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.moderationPolicy, 'all')
})

await test('Admin retrieves comment policies', async () => {
  const req = { user: adminUser, query: { clientId: 'tenant-test-1' } }
  const res = mockResponse()
  const next = mockNext()
  await getCommentSettings(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.autoFlagLinks, true)
})

// ----------------------------------------------------
// 7. Redirect Rules
// ----------------------------------------------------
console.log('\n--- 7. Redirect Rules Manager ---')

let redirectId = null

await test('Admin creates redirect rule', async () => {
  const req = {
    user: adminUser,
    body: {
      sourceUrl: '/old-guide',
      targetUrl: '/new-guide',
      statusCode: 301,
      clientId: 'tenant-test-1',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await createRedirect(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 201)
  redirectId = String(res.body.data.id || res.body.data._id)
})

await test('Admin retrieves redirect rules', async () => {
  const req = { user: adminUser, query: { clientId: 'tenant-test-1' } }
  const res = mockResponse()
  const next = mockNext()
  await getRedirects(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.ok(Array.isArray(res.body.data))
})

await test('Admin deletes redirect rule', async () => {
  const req = { user: adminUser, params: { id: redirectId } }
  const res = mockResponse()
  const next = mockNext()
  await deleteRedirect(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

// ----------------------------------------------------
// 8. Blog Home & Newsletter Settings
// ----------------------------------------------------
console.log('\n--- 8. Blog Home & Newsletter Settings ---')

await test('Admin updates blog home hero & layout settings', async () => {
  const req = {
    user: adminUser,
    query: { clientId: 'tenant-test-1' },
    body: {
      heroHeading: 'Latest Insights',
      postsPerPage: 12,
      featuredPostIds: [],
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateBlogHomeSettings(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin updates newsletter settings', async () => {
  const req = {
    user: adminUser,
    query: { clientId: 'tenant-test-1' },
    body: {
      heading: 'Join our weekly digest',
      buttonText: 'Subscribe Now',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateNewsletterSettings(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

// ----------------------------------------------------
// 9. Integrations & Instagram Publishing
// ----------------------------------------------------
console.log('\n--- 9. Integrations & Instagram Studio ---')

await test('Admin configures Google Analytics 4 integration', async () => {
  const req = {
    user: adminUser,
    params: { serviceKey: 'ga4' },
    query: { clientId: 'tenant-test-1' },
    body: {
      name: 'Google Analytics 4',
      enabled: true,
      measurementId: 'G-1234567890',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateIntegration(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin tests integration connection', async () => {
  const req = {
    user: adminUser,
    params: { serviceKey: 'ga4' },
    query: { clientId: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await testIntegrationConnection(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
})

await test('Admin publishes Instagram carousel post via CMS', async () => {
  const req = {
    user: adminUser,
    body: {
      clientId: 'tenant-test-1',
      type: 'carousel',
      caption: 'Testing Instagram multi-slide carousel publish from CMS!',
      carouselImages: [
        'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
        'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800',
      ],
      hashtags: '#fashion #workwear',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await publishInstagramPost(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.success)
  assert.ok(res.body.data.postId)
})

// ----------------------------------------------------
// 10. Universal Integration & Webhooks
// ----------------------------------------------------
console.log('\n--- 10. Universal Integration & Webhooks ---')

store.clients.push({
  id: 'tenant-test-1',
  customId: 'tenant-test-1',
  websiteName: 'Test Tenant',
  websiteUrl: 'https://testtenant.com',
  integration: { blogPath: '/blog' },
})

await test('Admin configures instant revalidation webhook', async () => {
  const req = {
    user: adminUser,
    params: { id: 'tenant-test-1' },
    body: {
      webhookUrl: 'https://example.com/api/revalidate-blog',
      webhookSecret: 'secret_abc_123',
      blogPath: '/blog',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await updateClientIntegration(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.blogPath, '/blog')
})

await test('Admin retrieves universal integration snippets & config', async () => {
  const req = {
    user: adminUser,
    params: { id: 'tenant-test-1' },
  }
  const res = mockResponse()
  const next = mockNext()
  await getClientIntegration(req, res, next)
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.data.snippets)
  assert.ok(res.body.data.snippets.embed)
  assert.ok(res.body.data.snippets.wordpress)
  assert.ok(res.body.data.snippets.nginx)
  assert.ok(res.body.data.snippets.nextjs)
})

// ----------------------------------------------------
// 11. Website Onboarding Wizard
// ----------------------------------------------------
console.log('\n--- 11. Website Onboarding Wizard ---')

await test('probeWebsiteReachability checks HTTP reachability', async () => {
  const req = { body: { url: 'https://workleisure.in' } }
  const res = mockResponse()
  const next = mockNext()
  await probeWebsiteReachability(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
  assert.ok(res.body.data.status)
})

await test('validateBlogLocation validates subdirectory route', async () => {
  const req = {
    user: adminUser,
    body: {
      websiteUrl: 'https://workleisure.in',
      path: 'blog',
    },
  }
  const res = mockResponse()
  const next = mockNext()
  await validateBlogLocation(req, res, next)
  assert.equal(next.called, false, next.error?.message)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.valid, true)
})

console.log('\n====================================================')
console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`)
console.log('====================================================\n')

if (failed > 0) {
  process.exit(1)
} else {
  console.log('🎉 ALL ADMIN FUNCTIONALITY, TAB, AND API TESTS PASSED!\n')
}
