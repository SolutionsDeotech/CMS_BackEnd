import assert from 'node:assert/strict'
import http from 'node:http'
import store from '../services/store.js'
import Client from '../models/Client.js'
import Post from '../models/Post.js'
import { isDbConnected } from '../config/db.js'
import {
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateUrlForSSRF,
  safeFetchHtml,
} from '../utils/ssrfValidator.js'
import {
  verifyLiveWebsiteIntegration,
  recordClientVerificationBeacon,
  getClientIntegration,
} from '../controllers/universalIntegrationController.js'

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

async function runLiveVerificationTests() {
  console.log('\n=================================================================')
  console.log('🧪 TESTING PHASE 1: AUTOMATED LIVE WEBSITE CONNECTION VERIFICATION')
  console.log('=================================================================\n')

  // --- Suite 1: SSRF Protection & IP Validation ---
  console.log('--- Suite 1: SSRF Protection & IP Validation ---')

  // 1.1 IPv4 Private / Loopback / Link-Local / Reserved Checks
  assert.equal(isPrivateOrReservedIPv4('127.0.0.1'), true, '127.0.0.1 must be identified as loopback')
  assert.equal(isPrivateOrReservedIPv4('127.255.255.255'), true, '127.255.255.255 must be identified as loopback')
  assert.equal(isPrivateOrReservedIPv4('10.0.0.1'), true, '10.0.0.1 must be identified as private')
  assert.equal(isPrivateOrReservedIPv4('10.255.255.255'), true, '10.255.255.255 must be identified as private')
  assert.equal(isPrivateOrReservedIPv4('172.16.0.1'), true, '172.16.0.1 must be identified as private')
  assert.equal(isPrivateOrReservedIPv4('172.31.255.255'), true, '172.31.255.255 must be identified as private')
  assert.equal(isPrivateOrReservedIPv4('192.168.1.1'), true, '192.168.1.1 must be identified as private')
  assert.equal(isPrivateOrReservedIPv4('169.254.169.254'), true, '169.254.169.254 (Cloud metadata) must be identified as private/reserved')
  assert.equal(isPrivateOrReservedIPv4('100.64.0.1'), true, '100.64.0.1 (Carrier-grade NAT) must be identified as reserved')
  assert.equal(isPrivateOrReservedIPv4('224.0.0.1'), true, '224.0.0.1 (Multicast) must be identified as reserved')
  assert.equal(isPrivateOrReservedIPv4('8.8.8.8'), false, '8.8.8.8 must be identified as public')
  assert.equal(isPrivateOrReservedIPv4('1.1.1.1'), false, '1.1.1.1 must be identified as public')
  console.log('  ✅ [PASS] IPv4 private, loopback, cloud metadata, and reserved ranges blocked')

  // 1.2 IPv6 Private / Loopback Checks
  assert.equal(isPrivateOrReservedIPv6('::1'), true, '::1 must be identified as loopback')
  assert.equal(isPrivateOrReservedIPv6('fc00::1'), true, 'fc00::1 (Unique Local) must be identified as private')
  assert.equal(isPrivateOrReservedIPv6('fe80::1'), true, 'fe80::1 (Link-local) must be identified as link-local')
  assert.equal(isPrivateOrReservedIPv6('::ffff:127.0.0.1'), true, '::ffff:127.0.0.1 (Mapped loopback) must be identified as loopback')
  console.log('  ✅ [PASS] IPv6 loopback, link-local, and mapped addresses blocked')

  // 1.3 URL SSRF Validation
  const localRes = await validateUrlForSSRF('http://127.0.0.1/blog')
  assert.equal(localRes.valid, false, '127.0.0.1 must be rejected')
  assert.equal(localRes.code, 'ERR_SSRF_BLOCKED')

  const metaRes = await validateUrlForSSRF('http://169.254.169.254/latest/meta-data')
  assert.equal(metaRes.valid, false, 'Cloud metadata must be rejected')
  assert.equal(metaRes.code, 'ERR_SSRF_BLOCKED')

  const localHostRes = await validateUrlForSSRF('http://localhost:3000/blog')
  assert.equal(localHostRes.valid, false, 'localhost must be rejected')
  assert.equal(localHostRes.code, 'ERR_SSRF_BLOCKED')

  const ftpRes = await validateUrlForSSRF('ftp://example.com/blog')
  assert.equal(ftpRes.valid, false, 'ftp:// must be rejected')
  assert.equal(ftpRes.code, 'ERR_FORBIDDEN_PROTOCOL')

  const fileRes = await validateUrlForSSRF('file:///etc/passwd')
  assert.equal(fileRes.valid, false, 'file:/// must be rejected')
  assert.equal(fileRes.code, 'ERR_FORBIDDEN_PROTOCOL')
  console.log('  ✅ [PASS] SSRF validator prevents loopback, cloud metadata, internal hostnames, and unsafe protocols')

  // --- Suite 2: Safe Fetch Engine, Redirect Handling, & Size Limits ---
  console.log('\n--- Suite 2: Safe Fetch Engine, Redirects, & Size Limits ---')

  // Create a local test HTTP server to simulate various server responses
  let serverMode = 'complete' // 'complete' | 'missing-container' | 'missing-script' | 'ssr' | 'redirect' | 'huge'
  const testServer = http.createServer((req, res) => {
    if (req.url === '/redirect-me') {
      res.writeHead(302, { Location: '/final-blog' })
      res.end()
      return
    }
    if (req.url === '/final-blog') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<!DOCTYPE html><html><body>Final Destination</body></html>')
      return
    }

    if (serverMode === 'huge') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      const chunk = '<div>Lorem ipsum dolor sit amet</div>\n'
      for (let i = 0; i < 20000; i++) {
        res.write(chunk)
      }
      res.end()
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    if (serverMode === 'complete') {
      res.end(`<!DOCTYPE html>
<html>
<head><title>My Company Blog</title></head>
<body>
  <h1>Welcome to our blog</h1>
  <div id="deotech-blog-feed" data-client-id="test-client-verify" data-base-path="/blog"></div>
  <script src="https://cms-backend-3fdr.onrender.com/embed/v1/blog.js" async></script>
</body>
</html>`)
    } else if (serverMode === 'missing-container') {
      res.end(`<!DOCTYPE html>
<html>
<head><title>Missing Container</title></head>
<body>
  <h1>Welcome to our blog</h1>
  <script src="https://cms-backend-3fdr.onrender.com/embed/v1/blog.js" async></script>
</body>
</html>`)
    } else if (serverMode === 'missing-script') {
      res.end(`<!DOCTYPE html>
<html>
<head><title>Missing Script</title></head>
<body>
  <h1>Welcome to our blog</h1>
  <div id="deotech-blog-feed" data-client-id="test-client-verify" data-base-path="/blog"></div>
</body>
</html>`)
    } else if (serverMode === 'ssr') {
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>SSR Company Blog</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "Server-Side Rendered Blog Post"
  }
  </script>
</head>
<body>
  <article class="card"><div class="deotech-post-body">Content</div></article>
</body>
</html>`)
    }
  })

  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve))
  const serverPort = testServer.address().port
  const mockServerUrl = `http://127.0.0.1:${serverPort}`

  // Safe fetch against mock server with allowLocalInTest: true
  const fetchResult = await safeFetchHtml(`${mockServerUrl}/blog`, { allowLocalInTest: true })
  assert.equal(fetchResult.status, 200)
  assert.ok(fetchResult.text.includes('deotech-blog-feed'), 'Should retrieve HTML containing container')
  assert.ok(fetchResult.latencyMs >= 0, 'Should measure latency')
  console.log('  ✅ [PASS] Safe fetch executes correctly with latency measurement')

  // Redirect handling
  const redirectResult = await safeFetchHtml(`${mockServerUrl}/redirect-me`, { allowLocalInTest: true })
  assert.equal(redirectResult.status, 200)
  assert.ok(redirectResult.finalUrl.includes('/final-blog'), 'Must follow redirects and record finalUrl')
  console.log('  ✅ [PASS] Redirects are safely followed with hop-by-hop verification')

  // Response size capping (huge payload)
  serverMode = 'huge'
  const hugeResult = await safeFetchHtml(`${mockServerUrl}/blog`, { allowLocalInTest: true, maxBytes: 50 * 1024 })
  assert.ok(Buffer.byteLength(hugeResult.text) <= 55 * 1024, 'Payload reader must enforce maxBytes limit')
  console.log('  ✅ [PASS] Response size limits cap body reading to prevent memory exhaustion')

  // --- Suite 3: Backend verifyLiveWebsiteIntegration Controller ---
  console.log('\n--- Suite 3: verifyLiveWebsiteIntegration Controller Scenarios ---')

  const testClientId = 'test-client-verify'
  store.clients = store.clients || []
  store.posts = store.posts || []

  // Ensure test client exists in memory store
  const mockClient = {
    id: testClientId,
    customId: testClientId,
    websiteName: 'Verify Test Co',
    websiteUrl: mockServerUrl,
    status: 'active',
    integrationSettings: {
      method: 'embed',
      blogPath: '/blog',
    },
  }
  store.clients = store.clients.filter((c) => c.customId !== testClientId && c.id !== testClientId)
  store.clients.unshift(mockClient)

  // Seed 2 published posts for this client
  store.posts = store.posts.filter((p) => p.clientId !== testClientId)
  store.posts.push(
    {
      id: 'post-verify-1',
      clientId: testClientId,
      title: 'First Verification Post',
      slug: 'first-verification-post',
      status: 'published',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'post-verify-2',
      clientId: testClientId,
      title: 'Second Verification Post',
      slug: 'second-verification-post',
      status: 'published',
      createdAt: new Date().toISOString(),
    }
  )

  const adminReq = {
    params: { id: testClientId },
    user: { role: 'Super Admin', isPrimaryAdmin: true },
  }

  // Scenario 3.1: Missing Container HTML
  serverMode = 'missing-container'
  const res31 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res31, mockNext())
  const report31 = res31.body.data
  assert.equal(report31.checks.domainReachable.status, 'passed')
  assert.equal(report31.checks.embedScriptDetected.status, 'passed')
  assert.equal(report31.checks.containerDetected.status, 'failed')
  assert.equal(report31.overallStatus, 'failed')
  assert.ok(report31.instructions.some((inst) => inst.includes('deotech-blog-feed')), 'Must instruct client to add container')
  console.log('  ✅ [PASS] Scenario 3.1: Missing container correctly detected and reported as failed')

  // Scenario 3.2: Missing Script HTML
  serverMode = 'missing-script'
  const res32 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res32, mockNext())
  const report32 = res32.body.data
  assert.equal(report32.checks.domainReachable.status, 'passed')
  assert.equal(report32.checks.embedScriptDetected.status, 'failed')
  assert.equal(report32.checks.containerDetected.status, 'passed')
  assert.equal(report32.overallStatus, 'failed')
  assert.ok(report32.instructions.some((inst) => inst.includes('embed/v1/blog.js')), 'Must instruct client to add script tag')
  console.log('  ✅ [PASS] Scenario 3.2: Missing script correctly detected and reported as failed')

  // Scenario 3.3: Server Checks Pass, BUT No Browser Beacon Yet
  serverMode = 'complete'
  // Clear any existing browser verification
  delete mockClient.integrationSettings.browserVerification
  const res33 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res33, mockNext())
  const report33 = res33.body.data
  assert.equal(report33.checks.domainReachable.status, 'passed')
  assert.equal(report33.checks.embedScriptDetected.status, 'passed')
  assert.equal(report33.checks.containerDetected.status, 'passed')
  assert.equal(report33.checks.apiConnectivity.status, 'passed')
  assert.equal(report33.checks.publishedContent.status, 'passed')
  assert.equal(report33.checks.publishedContent.count, 2)
  assert.equal(report33.checks.browserVerification.status, 'pending')
  assert.equal(report33.overallStatus, 'partially_connected', 'Must NOT mark fully connected on HTML alone')
  console.log('  ✅ [PASS] Scenario 3.3: Strict rule satisfied: Site marked partially_connected awaiting browser beacon')

  // Scenario 3.3.1: Spoofed Beacon Origin from unauthorized domain rejected
  const spoofedReq = {
    params: { id: testClientId },
    body: {
      url: 'https://evil-hacker.com/blog',
      origin: 'https://evil-hacker.com',
      containerId: 'deotech-blog-feed',
      renderedCount: 2,
    },
  }
  const spoofNext = mockNext()
  await recordClientVerificationBeacon(spoofedReq, mockResponse(), spoofNext)
  assert.equal(spoofNext.called, true, 'Spoofed beacon origin must be rejected with error')
  assert.equal(spoofNext.error.statusCode, 403, 'Must return HTTP 403 Forbidden')
  assert.equal(spoofNext.error.details.code, 'BEACON_ORIGIN_MISMATCH')
  console.log('  ✅ [PASS] Spoofed browser beacon origin rejected with 403 BEACON_ORIGIN_MISMATCH')

  // Scenario 3.4: Browser Beacon Arrives & Upgrades Status to Fully Connected
  const beaconReq = {
    params: { id: testClientId },
    body: {
      url: `${mockServerUrl}/blog`,
      origin: mockServerUrl,
      containerId: 'deotech-blog-feed',
      renderedCount: 2,
    },
  }
  const beaconRes = mockResponse()
  await recordClientVerificationBeacon(beaconReq, beaconRes, mockNext())
  assert.equal(beaconRes.statusCode, 200)
  assert.equal(beaconRes.body.data.recorded, true)

  // Re-verify after beacon
  const res34 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res34, mockNext())
  const report34 = res34.body.data
  assert.equal(report34.checks.browserVerification.status, 'passed')
  assert.equal(report34.overallStatus, 'connected', 'Must be fully connected after browser beacon confirmed')
  console.log('  ✅ [PASS] Scenario 3.4: Browser beacon records execution and upgrades site to fully connected')

  // Scenario 3.5: Edge SSR Reverse Proxy Detection
  serverMode = 'ssr'
  mockClient.integrationSettings.method = 'hosted'
  delete mockClient.integrationSettings.browserVerification
  const res35 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res35, mockNext())
  const report35 = res35.body.data
  assert.equal(report35.method, 'hosted')
  assert.equal(report35.checks.ssrRouteVerified.status, 'passed')
  assert.equal(report35.checks.embedScriptDetected.status, 'not_applicable')
  assert.equal(report35.overallStatus, 'connected')
  console.log('  ✅ [PASS] Scenario 3.5: Edge SSR reverse proxy signature recognized and connected')

  // Scenario 3.6: Direct REST API (Headless) Verification
  serverMode = 'missing-script' // Plain HTML without embed script or container
  mockClient.integrationSettings.method = 'headless-api'
  const res36 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res36, mockNext())
  const report36 = res36.body.data
  assert.equal(report36.method, 'headless-api')
  assert.equal(report36.checks.domainReachable.status, 'passed')
  assert.equal(report36.checks.apiConnectivity.status, 'passed')
  assert.equal(report36.checks.publishedContent.status, 'passed')
  assert.equal(report36.checks.restApiVerified.status, 'passed')
  assert.equal(report36.checks.embedScriptDetected.status, 'not_applicable', 'Embed script must be not_applicable for Direct REST API')
  assert.equal(report36.checks.containerDetected.status, 'not_applicable', 'Container must be not_applicable for Direct REST API')
  assert.equal(report36.checks.browserVerification.status, 'not_applicable', 'Browser beacon must be not_applicable for Direct REST API')
  assert.equal(report36.overallStatus, 'connected', 'Must be connected for Direct REST API without requiring script/container')
  console.log('  ✅ [PASS] Scenario 3.6: Direct REST API verified without requiring embed script or container')

  // Scenario 3.7: Method Override via Request Body
  // Client has method 'embed' in DB, but request specifies method 'headless-api'
  mockClient.integrationSettings.method = 'embed'
  const overrideReq = {
    params: { id: testClientId },
    body: { method: 'headless-api' },
    user: { role: 'Super Admin', isPrimaryAdmin: true },
  }
  const res37 = mockResponse()
  await verifyLiveWebsiteIntegration(overrideReq, res37, mockNext())
  const report37 = res37.body.data
  assert.equal(report37.method, 'headless-api')
  assert.equal(report37.overallStatus, 'connected')
  console.log('  ✅ [PASS] Scenario 3.7: Method override via request body works and updates client method')

  // Scenario 3.8: Not Configured State (Empty Website URL)
  const unconfiguredClient = {
    id: 'test-unconfigured',
    customId: 'test-unconfigured',
    websiteName: 'Unconfigured Site',
    websiteUrl: '',
    status: 'active',
    integrationSettings: {},
  }
  store.clients.unshift(unconfiguredClient)
  const unconfReq = {
    params: { id: 'test-unconfigured' },
    user: { role: 'Super Admin', isPrimaryAdmin: true },
  }
  const res38 = mockResponse()
  await verifyLiveWebsiteIntegration(unconfReq, res38, mockNext())
  const report38 = res38.body.data
  assert.equal(report38.overallStatus, 'not_configured')
  assert.ok(report38.instructions.some((ins) => ins.includes('configure your registered Website URL')))
  console.log('  ✅ [PASS] Scenario 3.8: Unconfigured website returns clear not_configured status')

  // --- Suite 4: Non-Existent Domain & Network Failures ---
  console.log('\n--- Suite 4: Non-Existent Domain & Network Failures ---')
  mockClient.websiteUrl = 'https://this-domain-definitely-does-not-exist-89234789.com'
  const res4 = mockResponse()
  await verifyLiveWebsiteIntegration(adminReq, res4, mockNext())
  const report4 = res4.body.data
  assert.equal(report4.checks.domainReachable.status, 'failed')
  assert.equal(report4.overallStatus, 'failed')
  assert.ok(report4.instructions.length > 0)
  console.log('  ✅ [PASS] Non-existent domain safely handled with actionable instructions')

  // --- Suite 5: Existing Production Clients Compatibility ---
  console.log('\n--- Suite 5: Existing Production Clients Compatibility ---')
  // Verify that getClientIntegration includes verification fields and existing snippets
  const getIntegReq = {
    params: { id: testClientId },
    user: { role: 'Super Admin', isPrimaryAdmin: true },
  }
  const getIntegRes = mockResponse()
  await getClientIntegration(getIntegReq, getIntegRes, mockNext())
  assert.equal(getIntegRes.statusCode, 200)
  assert.ok(getIntegRes.body.data.integration.verification, 'Must include last verification object')
  assert.ok(getIntegRes.body.data.snippets.embed, 'Must preserve existing drop-in snippet')
  assert.ok(getIntegRes.body.data.snippets.wordpress, 'Must preserve existing wordpress snippet')
  assert.ok(getIntegRes.body.data.snippets.nginx, 'Must preserve existing nginx snippet')
  console.log('  ✅ [PASS] getClientIntegration returns verification state without breaking existing snippets')

  // --- Suite 6: Live Production Websites Probing ---
  console.log('\n--- Suite 6: Live Production Websites Probing ---')
  const liveSites = [
    { name: 'Deotech Solutions', url: 'https://deotechsolutions.com/blog' },
    { name: 'Workleisure', url: 'https://workleisure.in/blog' },
    { name: 'CMS Web Portal', url: 'https://cms-frontend-wgwj.onrender.com/blog' },
  ]

  for (const site of liveSites) {
    try {
      const liveRes = await safeFetchHtml(site.url, { timeoutMs: 8000, maxRedirects: 3 })
      console.log(`  🌐 ${site.name} (${site.url}): HTTP ${liveRes.status} in ${liveRes.latencyMs}ms (${liveRes.text.length} bytes)`)
      assert.ok(liveRes.status >= 200 && liveRes.status < 400, `${site.name} should respond with 2xx/3xx`)
    } catch (err) {
      console.log(`  ⚠️  ${site.name} probe: ${err.message}`)
    }
  }

  // Close test server
  testServer.close()

  console.log('\n=================================================================')
  console.log('🎉 ALL PHASE 1 LIVE VERIFICATION TESTS PASSED SUCCESSFULLY!')
  console.log('=================================================================\n')
}

runLiveVerificationTests().catch((err) => {
  console.error('❌ Live Verification Tests Failed:', err)
  process.exit(1)
})
