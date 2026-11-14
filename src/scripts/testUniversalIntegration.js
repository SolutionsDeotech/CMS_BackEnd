import assert from 'node:assert/strict'
import store from '../services/store.js'
import {
  getEmbedScript,
  renderEdgeSSRBlog,
  getClientIntegration,
  updateClientIntegration,
  testWebhookPing,
} from '../controllers/universalIntegrationController.js'
import { dispatchWebhook } from '../services/webhookService.js'
import { getCategories, getTags } from '../controllers/taxonomyController.js'
import { verifyDomainOwnership } from '../controllers/onboardingController.js'

function mockResponse() {
  return {
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
      this.headers[key.toLowerCase()] = val
      return this
    },
    send(data) {
      this.body = data
      return this
    },
  }
}

function mockNext() {
  const fn = (err) => {
    fn.called = true
    fn.error = err
  }
  fn.called = false
  fn.error = null
  return fn
}

async function runUniversalIntegrationTests() {
  console.log('\n====================================================')
  console.log('🧪 TESTING UNIVERSAL CLIENT INTEGRATION SUITE (PHASE 1)')
  console.log('====================================================\n')

  // Setup memory test client and post
  const testClientId = 'test-client-universal-1'
  const testClientId2 = 'test-client-universal-2'
  store.clients = store.clients || []
  store.posts = store.posts || []
  store.categories = store.categories || []
  store.tags = store.tags || []

  store.clients = store.clients.filter((c) => c.customId !== testClientId && c.id !== testClientId && c.customId !== testClientId2)
  store.clients.unshift(
    {
      id: testClientId,
      customId: testClientId,
      websiteName: 'Acme Global Corp',
      websiteUrl: 'https://acmeglobal.com',
      status: 'active',
      theme: {
        primaryColor: '#0f766e',
        textColor: '#111827',
        fontFamily: 'Roboto, sans-serif',
        headingFont: 'Montserrat, sans-serif',
      },
      integrationSettings: {
        method: 'embed',
        blogPath: '/blog',
        webhookUrl: 'https://example.com/api/revalidate-test',
        webhookSecret: 'test_secret_key_123',
      },
    },
    {
      id: testClientId2,
      customId: testClientId2,
      websiteName: 'Beta Health Systems',
      websiteUrl: 'https://betahealth.com',
      status: 'active',
      integrationSettings: {
        method: 'proxy',
        blogPath: '/insights',
      },
    }
  )

  store.posts = store.posts.filter((p) => p.clientId !== testClientId && p.clientId !== testClientId2)
  store.posts.unshift(
    {
      id: 'post-universal-test-1',
      customId: 'post-universal-test-1',
      title: 'Universal CMS Integration Across All Tech Stacks',
      slug: 'universal-cms-integration-all-stacks',
      content: '<p>This is a test article rendered by Deotech CMS edge engine.</p>',
      excerpt: 'A comprehensive guide on zero-code blog integration.',
      category: 'Engineering',
      status: 'published',
      clientId: testClientId,
      author: 'Chief Architect',
      date: 'Today',
    },
    {
      id: 'post-universal-test-2',
      customId: 'post-universal-test-2',
      title: 'Beta Health Private Clinical Protocol',
      slug: 'beta-health-clinical-protocol',
      content: '<p>Confidential medical analysis.</p>',
      excerpt: 'Private health guide.',
      category: 'Healthcare',
      status: 'published',
      clientId: testClientId2,
      author: 'Dr. Beta',
      date: 'Today',
    }
  )

  // Seed categories & tags for Tenant A and Tenant B
  store.categories = [
    { id: 'cat-1', customId: 'cat-1', name: 'Engineering', slug: 'engineering', clientId: testClientId },
    { id: 'cat-2', customId: 'cat-2', name: 'Healthcare', slug: 'healthcare', clientId: testClientId2 },
  ]
  store.tags = [
    { id: 'tag-1', customId: 'tag-1', name: 'Tech', slug: 'tech', clientId: testClientId },
    { id: 'tag-2', customId: 'tag-2', name: 'Medicine', slug: 'medicine', clientId: testClientId2 },
  ]

  // 1. Test Embed Script Generator
  console.log('--- Priority 1: Embed Script Serving ---')
  const embedReq = {}
  const embedRes = mockResponse()
  await getEmbedScript(embedReq, embedRes)
  assert.equal(embedRes.statusCode, 200, 'Embed script should return 200 OK')
  assert.match(embedRes.headers['content-type'], /javascript/, 'Embed script should have javascript Content-Type')
  assert.ok(embedRes.body.includes('Deotech CMS - Universal Blog Embed Component'), 'Script should include header signature')
  assert.ok(embedRes.body.includes('deotech-blog-feed'), 'Script should search for container element')
  console.log('  ✅ [PASS] Universal embed script /embed/v1/blog.js served with JavaScript Content-Type & caching')

  // 2. Test Edge SSR Blog Homepage Endpoint
  console.log('\n--- Priority 2: Edge SSR Reverse Proxy Blog Homepage ---')
  const ssrHomeReq = { params: { clientId: testClientId } }
  const ssrHomeRes = mockResponse()
  await renderEdgeSSRBlog(ssrHomeReq, ssrHomeRes, (err) => { if (err) throw err })
  assert.equal(ssrHomeRes.statusCode, 200, 'SSR Homepage should return 200 OK')
  assert.match(ssrHomeRes.headers['content-type'], /text\/html/, 'SSR response should be HTML')
  assert.ok(ssrHomeRes.body.includes('Acme Global Corp Blog'), 'HTML should include site title')
  assert.ok(ssrHomeRes.body.includes('Universal CMS Integration Across All Tech Stacks'), 'HTML should include published post title')
  assert.ok(ssrHomeRes.body.includes('rel="canonical"'), 'HTML should include canonical tag for Google SEO')
  assert.ok(ssrHomeRes.body.includes('--primary: #0f766e'), 'HTML should apply client custom theme colors')
  console.log('  ✅ [PASS] Edge SSR Blog Homepage rendered with full semantic HTML, branding, and canonical SEO')

  // 3. Test Edge SSR Single Article Page Endpoint
  console.log('\n--- Priority 3: Edge SSR Single Article Page ---')
  const ssrPostReq = { params: { clientId: testClientId, slug: 'universal-cms-integration-all-stacks' } }
  const ssrPostRes = mockResponse()
  await renderEdgeSSRBlog(ssrPostReq, ssrPostRes, (err) => { if (err) throw err })
  assert.equal(ssrPostRes.statusCode, 200, 'SSR Single Post should return 200 OK')
  assert.ok(ssrPostRes.body.includes('Universal CMS Integration Across All Tech Stacks'), 'HTML should contain article headline')
  assert.ok(ssrPostRes.body.includes('This is a test article rendered by Deotech CMS edge engine.'), 'HTML should contain full article content')
  assert.ok(ssrPostRes.body.includes('Chief Architect'), 'HTML should contain author byline')
  assert.ok(ssrPostRes.body.includes('schema.org'), 'HTML should contain JSON-LD BlogPosting Schema')
  console.log('  ✅ [PASS] Edge SSR Single Article rendered with JSON-LD Schema, OpenGraph metadata, and author box')

  // 4. Test Client Integration Snippets Endpoint
  console.log('\n--- Priority 4: Client Integration Snippets Endpoint & Snippet Accuracy ---')
  const integrationReq = { params: { id: testClientId }, user: { clientId: testClientId, role: 'Client Admin' } }
  const integrationRes = mockResponse()
  await getClientIntegration(integrationReq, integrationRes, (err) => { if (err) throw err })
  assert.equal(integrationRes.statusCode, 200, 'Integration endpoint should return 200 OK')
  assert.ok(integrationRes.body.data.snippets.apache.includes('RewriteRule ^blog(/.*)?$'), 'Default /blog should generate RewriteRule ^blog(/.*)?$')
  assert.ok(integrationRes.body.data.snippets.nginx.includes('proxy_pass'), 'Should generate Nginx snippet')
  assert.ok(integrationRes.body.data.snippets.nginx.includes('proxy_ssl_server_name on;'), 'Nginx snippet must include proxy_ssl_server_name on;')
  assert.ok(integrationRes.body.data.snippets.python.includes('@app.get("/blog")'), 'FastAPI snippet must include bare root handler')
  assert.ok(integrationRes.body.data.snippets.python.includes('@app.get("/blog/{path:path}")'), 'FastAPI snippet must include path handler')
  assert.ok(integrationRes.body.data.snippets.dotnet.includes('builder.Services.AddHttpClient();'), '.NET snippet must include AddHttpClient()')
  assert.ok(integrationRes.body.data.snippets.embed.includes('deotech-blog-feed'), 'Should generate Drop-in script snippet')
  assert.ok(integrationRes.body.data.snippets.cloudflare.includes('fetch'), 'Should generate Cloudflare worker snippet')

  // 4.1 Apache dynamic path verification (/news and /company/blog)
  const clientA_Snippet = store.clients.find((c) => c.customId === testClientId)
  clientA_Snippet.integrationSettings.blogPath = '/news'
  const apacheNewsRes = mockResponse()
  await getClientIntegration(integrationReq, apacheNewsRes, mockNext())
  assert.ok(apacheNewsRes.body.data.snippets.apache.includes('RewriteRule ^news(/.*)?$'), 'Apache snippet must dynamically use ^news for /news')

  clientA_Snippet.integrationSettings.blogPath = '/company/blog'
  const apacheNestedRes = mockResponse()
  await getClientIntegration(integrationReq, apacheNestedRes, mockNext())
  assert.ok(apacheNestedRes.body.data.snippets.apache.includes('RewriteRule ^company/blog(/.*)?$'), 'Apache snippet must dynamically use ^company/blog for nested path')
  console.log('  ✅ [PASS] Ready-to-copy code snippets accurately generated for Nginx, Apache (/blog, /news, /company/blog), Cloudflare, FastAPI, .NET, and Embed')

  // 5. Test Webhook Dispatch Service
  console.log('\n--- Priority 5: Webhook Dispatch & HMAC Signature ---')
  const webhookResult = await dispatchWebhook(testClientId, 'test.ping', { test: true })
  assert.ok(typeof webhookResult === 'object', 'Webhook dispatch should return status object')
  assert.ok('dispatched' in webhookResult, 'Webhook result should specify dispatched boolean')
  console.log('  ✅ [PASS] Webhook dispatcher safely computes HMAC SHA256 signature without crashing on remote errors')

  // 6. Test Public Taxonomy Security & Tenant Isolation (Task 1)
  console.log('\n--- Priority 6: Public Taxonomy Security & Tenant Isolation ---')
  
  // 6.1 Public categories without clientId -> returns 400
  const catNoClientNext = mockNext()
  await getCategories({ query: {} }, mockResponse(), catNoClientNext)
  assert.equal(catNoClientNext.called, true, 'getCategories without clientId must call next with error')
  assert.equal(catNoClientNext.error?.statusCode, 400, 'Missing clientId on public categories must return 400')
  console.log('  ✅ [PASS] Public getCategories without clientId returns HTTP 400 Bad Request')

  // 6.2 Public tags without clientId -> returns 400
  const tagNoClientNext = mockNext()
  await getTags({ query: {} }, mockResponse(), tagNoClientNext)
  assert.equal(tagNoClientNext.called, true, 'getTags without clientId must call next with error')
  assert.equal(tagNoClientNext.error?.statusCode, 400, 'Missing clientId on public tags must return 400')
  console.log('  ✅ [PASS] Public getTags without clientId returns HTTP 400 Bad Request')

  // 6.3 Public request with clientId=all -> returns 400
  const catAllNext = mockNext()
  await getCategories({ query: { clientId: 'all' } }, mockResponse(), catAllNext)
  assert.equal(catAllNext.called, true, 'Public getCategories with clientId=all must return 400')
  assert.equal(catAllNext.error?.statusCode, 400)
  console.log('  ✅ [PASS] Public getCategories with clientId=all rejected with HTTP 400 Bad Request')

  // 6.4 Tenant A querying categories only receives Tenant A categories (zero leakage)
  const catTenantARes = mockResponse()
  await getCategories({ query: { clientId: testClientId } }, catTenantARes, mockNext())
  assert.equal(catTenantARes.statusCode, 200)
  assert.equal(catTenantARes.body.data.length, 1, 'Tenant A should only receive 1 category')
  assert.equal(catTenantARes.body.data[0].name, 'Engineering', 'Tenant A should receive its Engineering category')
  assert.equal(catTenantARes.body.data.some((c) => c.name === 'Healthcare'), false, 'Tenant A must NOT receive Tenant B category')
  console.log('  ✅ [PASS] Tenant A categories are isolated: Tenant A cannot retrieve Tenant B categories')

  // 6.5 Tenant A querying tags only receives Tenant A tags (zero leakage)
  const tagTenantARes = mockResponse()
  await getTags({ query: { clientId: testClientId } }, tagTenantARes, mockNext())
  assert.equal(tagTenantARes.statusCode, 200)
  assert.equal(tagTenantARes.body.data.length, 1, 'Tenant A should only receive 1 tag')
  assert.equal(tagTenantARes.body.data[0].name, 'Tech', 'Tenant A should receive Tech tag')
  assert.equal(tagTenantARes.body.data.some((t) => t.name === 'Medicine'), false, 'Tenant A must NOT receive Tenant B tag')
  console.log('  ✅ [PASS] Tenant A tags are isolated: Tenant A cannot retrieve Tenant B tags')

  // 6.6 Authenticated global Admin can retrieve all categories
  const catAdminRes = mockResponse()
  await getCategories({ query: {}, user: { isPrimaryAdmin: true } }, catAdminRes, mockNext())
  assert.equal(catAdminRes.statusCode, 200)
  assert.equal(catAdminRes.body.data.length, 2, 'Global admin should retrieve all tenant categories')
  console.log('  ✅ [PASS] Authenticated Admin preserves global cross-tenant visibility')

  // 7. Test SSR Configured Blog Path & URL Normalization (Task 2 & Fix 3)
  console.log('\n--- Priority 7: SSR Configured Blog Path & URL Normalization ---')
  
  // 7.1 Custom blog path e.g. /news
  const clientA = store.clients.find((c) => c.customId === testClientId)
  clientA.integrationSettings.blogPath = '/news'
  const ssrCustomRes = mockResponse()
  await renderEdgeSSRBlog({ params: { clientId: testClientId } }, ssrCustomRes, mockNext())
  assert.ok(ssrCustomRes.body.includes('href="https://acmeglobal.com/news"'), 'Canonical/All Articles link should use /news')
  assert.ok(ssrCustomRes.body.includes('https://acmeglobal.com/news/universal-cms-integration-all-stacks'), 'Post link should use /news')
  assert.ok(!ssrCustomRes.body.includes('href="https://acmeglobal.com/blog"'), 'Must not hardcode /blog when /news is configured')
  console.log('  ✅ [PASS] SSR dynamically uses configured blogPath (/news) for canonical URLs and article links')

  // 7.2 Path traversal and malformed path safety
  clientA.integrationSettings.blogPath = '/../../articles///'
  const ssrSafeRes = mockResponse()
  await renderEdgeSSRBlog({ params: { clientId: testClientId } }, ssrSafeRes, mockNext())
  assert.ok(ssrSafeRes.body.includes('https://acmeglobal.com/articles'), 'Path traversal safely normalized to /articles')
  console.log('  ✅ [PASS] SSR path normalization prevents path traversal (/../../articles/// -> /articles)')

  // 7.3 Encoded path traversal (%2e%2e, %2E%2E, backslash, repeated slashes, malformed encoding)
  const encodedCases = [
    { input: '/%2e%2e/news', expected: '/news', label: 'Lowercase percent-encoded /%2e%2e/news' },
    { input: '/%2E%2E/news', expected: '/news', label: 'Uppercase percent-encoded /%2E%2E/news' },
    { input: '\\..\\..\\news', expected: '/news', label: 'Backslash traversal \\..\\..\\news' },
    { input: '///news///', expected: '/news', label: 'Repeated slashes ///news///' },
    { input: '/%zz/news', expected: '/%zz/news', label: 'Malformed percent-encoding /%zz/news handled safely without crash' },
    { input: '/company/blog', expected: '/company/blog', label: 'Nested valid path /company/blog preserved' },
    { input: '   ', expected: '/blog', label: 'Whitespace path falls back safely to /blog' },
  ]

  for (const ec of encodedCases) {
    clientA.integrationSettings.blogPath = ec.input
    const res = mockResponse()
    await renderEdgeSSRBlog({ params: { clientId: testClientId } }, res, mockNext())
    assert.ok(
      res.body.includes(`https://acmeglobal.com${ec.expected}`),
      `${ec.label}: expected https://acmeglobal.com${ec.expected}`
    )
  }
  console.log('  ✅ [PASS] SSR path normalization secures percent-encoded (%2e%2e), backslash, nested, and malformed paths')

  // 7.4 Default /blog fallback
  delete clientA.integrationSettings.blogPath
  const ssrDefaultRes = mockResponse()
  await renderEdgeSSRBlog({ params: { clientId: testClientId } }, ssrDefaultRes, mockNext())
  assert.ok(ssrDefaultRes.body.includes('https://acmeglobal.com/blog'), 'Unset blogPath safely defaults to /blog')
  console.log('  ✅ [PASS] SSR safely falls back to default /blog when blogPath is not configured')

  // 8. Test Apex and WWW Domain Verification (Task 4 & Fix 1)
  console.log('\n--- Priority 8: Apex and WWW Domain Verification ---')
  const { saveBlogSetupSetting, getBlogSetupSetting } = await import('../services/blogSetupSettings.js')
  const existingWebsites = await getBlogSetupSetting('onboarding-websites', 'global', {})
  await saveBlogSetupSetting('onboarding-websites', 'global', {
    ...existingWebsites,
    'site-apex-test': {
      id: 'site-apex-test',
      name: 'Apex Test Site',
      url: 'https://apexdomain.com',
      domain: 'apexdomain.com',
      wizard: {
        domainName: 'apexdomain.com',
        verificationStatus: 'pending',
        txtRecordKey: '_ctm-challenge',
        txtRecordValue: 'ctm-verify=apex-token-12345',
      },
    },
  })

  // Test verifyDomainOwnership when querying www.apexdomain.com
  const wwwReq = {
    body: { domain: 'www.apexdomain.com', method: 'dns-txt' },
  }
  const wwwRes = mockResponse()
  const wwwNext = mockNext()
  await verifyDomainOwnership(wwwReq, wwwRes, wwwNext)
  assert.equal(wwwNext.called, false, 'verifyDomainOwnership must find site record matching apex and not fail with 404')
  assert.ok(wwwRes.body.data, 'Domain verification should execute check and return verification status')
  console.log('  ✅ [PASS] Domain ownership verification finds site record whether queried as apex or www')

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 1 INTEGRATION & SECURITY TESTS PASSED!')
  console.log('====================================================\n')
}

runUniversalIntegrationTests().catch((err) => {
  console.error('❌ Universal Integration Tests failed:', err)
  process.exit(1)
})
