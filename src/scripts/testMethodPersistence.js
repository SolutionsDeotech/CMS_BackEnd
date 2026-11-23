import assert from 'node:assert/strict'
import http from 'node:http'
import store from '../services/store.js'
import {
  updateClientIntegration,
  getClientIntegration,
  verifyLiveWebsiteIntegration,
  parseIntegrationMethod,
  normalizeIntegrationMethod,
  SUPPORTED_INTEGRATION_METHODS,
} from '../controllers/universalIntegrationController.js'

function mockRes() {
  return {
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

async function runPersistenceTests() {
  console.log('\n======================================================================')
  console.log('🧪 TESTING INTEGRATION METHOD PERSISTENCE (STRICT SEPARATION)')
  console.log('   Canonical Endpoints:')
  console.log('   - PUT  /api/v1/clients/:id/integration (Save method permanently)')
  console.log('   - POST /api/v1/clients/:id/integration/verify-live (Diagnostic only)')
  console.log('======================================================================\n')

  // Setup local mock server to simulate live client domain
  const server = http.createServer((req, res) => {
    if (req.url === '/fail') {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
      return
    }
    if (req.url.startsWith('/blog') || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Test Live Blog</title></head>
          <body>
            <div id="deotech-blog-feed" data-client-id="test-client-strict-sep" data-base-path="/blog"></div>
            <div id="ssr-container"><h1>SSR Pre-rendered Content</h1></div>
            <script src="https://cms-backend-3fdr.onrender.com/embed/v1/blog.js" async></script>
          </body>
        </html>
      `)
      return
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const targetDomain = `http://127.0.0.1:${port}`

  const testClientId = 'test-client-strict-sep'
  store.clients = store.clients || []
  store.clients = store.clients.filter((c) => c.customId !== testClientId && c.id !== testClientId)
  store.posts = store.posts || []
  store.posts = store.posts.filter((p) => p.clientId !== testClientId)

  // Seed client in memory (zero production database writes)
  const clientRecord = {
    id: testClientId,
    customId: testClientId,
    websiteName: 'Strict Separation Test Client',
    websiteUrl: targetDomain,
    status: 'active',
    integrationSettings: {
      method: 'headless-api',
      blogPath: '/blog',
      webhookUrl: 'https://example.com/webhook',
      webhookSecret: 'secret_123',
    },
  }
  store.clients.unshift(clientRecord)

  // Seed sample published post for public API connectivity check
  store.posts.unshift({
    id: 'post-test-1',
    customId: 'post-test-1',
    clientId: testClientId,
    title: 'Testing Strict Method Separation',
    slug: 'testing-strict-method-separation',
    status: 'published',
  })

  const adminUser = { role: 'Super Admin', isPrimaryAdmin: true }

  try {
    // -------------------------------------------------------------
    // Case 1: Saved 'headless-api' + verify unsaved 'embed'
    // Expected: verification runs 'embed', but DB remains 'headless-api'
    // -------------------------------------------------------------
    console.log('Case 1: Saved "headless-api" + verify unsaved "embed"')
    clientRecord.integrationSettings.method = 'headless-api'
    const req1 = {
      params: { id: testClientId },
      body: { method: 'embed' },
      user: adminUser,
    }
    const res1 = mockRes()
    const next1 = mockNext()
    await verifyLiveWebsiteIntegration(req1, res1, next1)
    assert.equal(next1.called, false, 'Should not error')
    assert.equal(res1.body.data.method, 'embed', 'Verification report should reflect tested method "embed"')
    assert.equal(clientRecord.integrationSettings.method, 'headless-api', 'DB method must remain "headless-api"')

    // Confirm via getClientIntegration
    const resGet1 = mockRes()
    await getClientIntegration({ params: { id: testClientId }, user: adminUser }, resGet1, mockNext())
    assert.equal(resGet1.body.data.integration.method, 'headless-api', 'Saved method returned by GET must remain "headless-api"')
    console.log('  ✅ Database remained "headless-api" after verifying unsaved "embed".')

    // -------------------------------------------------------------
    // Case 2: Saved 'embed' + verify unsaved 'hosted'
    // Expected: verification runs 'hosted', but DB remains 'embed'
    // -------------------------------------------------------------
    console.log('\nCase 2: Saved "embed" + verify unsaved "hosted"')
    clientRecord.integrationSettings.method = 'embed'
    const req2 = {
      params: { id: testClientId },
      body: { method: 'hosted' },
      user: adminUser,
    }
    const res2 = mockRes()
    const next2 = mockNext()
    await verifyLiveWebsiteIntegration(req2, res2, next2)
    assert.equal(next2.called, false, 'Should not error')
    assert.equal(res2.body.data.method, 'hosted', 'Verification report should reflect tested method "hosted"')
    assert.equal(clientRecord.integrationSettings.method, 'embed', 'DB method must remain "embed"')

    const resGet2 = mockRes()
    await getClientIntegration({ params: { id: testClientId }, user: adminUser }, resGet2, mockNext())
    assert.equal(resGet2.body.data.integration.method, 'embed', 'Saved method returned by GET must remain "embed"')
    console.log('  ✅ Database remained "embed" after verifying unsaved "hosted".')

    // -------------------------------------------------------------
    // Case 3: Saved 'hosted' + invalid method
    // Expected: HTTP 400 error and DB method remains 'hosted'
    // -------------------------------------------------------------
    console.log('\nCase 3: Saved "hosted" + invalid method')
    clientRecord.integrationSettings.method = 'hosted'
    const req3Verify = {
      params: { id: testClientId },
      body: { method: 'invalid_random_method_123' },
      user: adminUser,
    }
    const next3Verify = mockNext()
    await verifyLiveWebsiteIntegration(req3Verify, mockRes(), next3Verify)
    assert.equal(next3Verify.called, true, 'verify-live with invalid method must trigger error')
    assert.equal(next3Verify.error.statusCode, 400, 'Invalid method must return HTTP 400')
    assert.equal(clientRecord.integrationSettings.method, 'hosted', 'DB method must not be changed on invalid method')

    // Also test PUT with invalid method
    const req3Put = {
      params: { id: testClientId },
      body: { method: 'another_bogus_method' },
      user: adminUser,
    }
    const next3Put = mockNext()
    await updateClientIntegration(req3Put, mockRes(), next3Put)
    assert.equal(next3Put.called, true, 'PUT with invalid method must trigger error')
    assert.equal(next3Put.error.statusCode, 400, 'PUT with invalid method must return HTTP 400')
    assert.equal(clientRecord.integrationSettings.method, 'hosted', 'DB method must remain "hosted"')
    console.log('  ✅ Invalid method rejected with HTTP 400 and database remained "hosted".')

    // -------------------------------------------------------------
    // Case 4: Failed verification: saved method remains unchanged
    // -------------------------------------------------------------
    console.log('\nCase 4: Failed verification: saved method remains unchanged')
    clientRecord.integrationSettings.method = 'headless-api'
    clientRecord.websiteUrl = `http://127.0.0.1:${port}/fail`
    const req4 = {
      params: { id: testClientId },
      body: { method: 'embed' },
      user: adminUser,
    }
    const res4 = mockRes()
    const next4 = mockNext()
    await verifyLiveWebsiteIntegration(req4, res4, next4)
    assert.equal(next4.called, false)
    assert.equal(res4.body.data.overallStatus, 'failed', 'Verification must fail on 500 status')
    assert.equal(clientRecord.integrationSettings.method, 'headless-api', 'Saved method must remain "headless-api" on failure')
    console.log('  ✅ Failed verification did not change saved method.')

    // -------------------------------------------------------------
    // Case 5: Successful verification: saved method remains unchanged
    // -------------------------------------------------------------
    console.log('\nCase 5: Successful verification: saved method remains unchanged')
    clientRecord.integrationSettings.method = 'headless-api'
    clientRecord.websiteUrl = targetDomain
    // Add mock browser verification so embed verification is fully connected
    clientRecord.integrationSettings.browserVerification = {
      verified: true,
      renderedCount: 1,
      lastBeaconAt: new Date().toISOString(),
    }
    const req5 = {
      params: { id: testClientId },
      body: { method: 'embed' },
      user: adminUser,
    }
    const res5 = mockRes()
    const next5 = mockNext()
    await verifyLiveWebsiteIntegration(req5, res5, next5)
    assert.equal(next5.called, false)
    assert.equal(res5.body.data.overallStatus, 'connected', 'Verification must pass')
    assert.equal(clientRecord.integrationSettings.method, 'headless-api', 'Saved method must remain "headless-api" even on success')
    console.log('  ✅ Successful verification did not change saved method.')

    // -------------------------------------------------------------
    // Case 6: Explicit PUT save: selected method persists correctly
    // -------------------------------------------------------------
    console.log('\nCase 6: Explicit PUT save: selected method persists correctly')
    const req6 = {
      params: { id: testClientId },
      body: { method: 'hosted', blogPath: '/blog' },
      user: adminUser,
    }
    const res6 = mockRes()
    const next6 = mockNext()
    await updateClientIntegration(req6, res6, next6)
    assert.equal(next6.called, false)
    assert.equal(res6.statusCode, 200)
    assert.equal(res6.body.data.method, 'hosted', 'PUT must return newly saved method')
    assert.equal(clientRecord.integrationSettings.method, 'hosted', 'DB must be updated by PUT')

    const resGet6 = mockRes()
    await getClientIntegration({ params: { id: testClientId }, user: adminUser }, resGet6, mockNext())
    assert.equal(resGet6.body.data.integration.method, 'hosted', 'GET must return updated saved method "hosted"')
    console.log('  ✅ Explicit PUT save persisted method to database.')

    // -------------------------------------------------------------
    // Case 7: Verification without method: saved method is used
    // -------------------------------------------------------------
    console.log('\nCase 7: Verification without method: saved method is used')
    clientRecord.integrationSettings.method = 'headless-api'
    const req7 = {
      params: { id: testClientId },
      body: {}, // method omitted
      user: adminUser,
    }
    const res7 = mockRes()
    const next7 = mockNext()
    await verifyLiveWebsiteIntegration(req7, res7, next7)
    assert.equal(next7.called, false)
    assert.equal(res7.body.data.method, 'headless-api', 'Omitted method must resolve from saved DB record')
    assert.equal(clientRecord.integrationSettings.method, 'headless-api', 'DB record remains untouched')
    console.log('  ✅ Verification without method used saved method "headless-api".')

    console.log('\n======================================================')
    console.log('🎉 ALL 7 METHOD PERSISTENCE TESTS PASSED (100% SUCCESS)')
    console.log('======================================================\n')
  } finally {
    server.close()
  }
}

runPersistenceTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
