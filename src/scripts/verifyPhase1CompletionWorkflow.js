import dotenv from 'dotenv'
dotenv.config()
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import Client from '../models/Client.js'
import {
  updateClientIntegration,
  getClientIntegration,
  verifyLiveWebsiteIntegration,
} from '../controllers/universalIntegrationController.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(data) { this.body = data; return this },
    send(data) { this.body = data; return this },
  }
}
function mockNext() {
  const fn = (err) => { fn.called = true; fn.error = err }
  fn.called = false; fn.error = null
  return fn
}

async function runPhase1CompletionWorkflow() {
  await connectDB()

  console.log('\n======================================================')
  console.log('🚀 PHASE 1 FINAL CONFIGURATION & VERIFICATION WORKFLOW')
  console.log('======================================================\n')

  const targetClients = [
    { id: 'site-1794811860577', name: 'Workleisure' },
    { id: 'site-1795254226985', name: 'CMS Web Portal' },
    { id: 'site-1793962551452', name: 'Deotech Solutions' },
  ]

  for (const clientInfo of targetClients) {
    console.log(`\n>>> Processing ${clientInfo.name} (${clientInfo.id}) <<<`)

    // 1. Update saved integration method through the API controller (identical to UI save)
    console.log(`  1. Updating integration method to "headless-api" via updateClientIntegration API...`)
    const putReq = {
      params: { id: clientInfo.id },
      body: { method: 'headless-api', blogPath: '/blog' },
      user: { role: 'Super Admin', isPrimaryAdmin: true },
    }
    const putRes = mockRes()
    await updateClientIntegration(putReq, putRes, mockNext())
    assert.equal(putRes.statusCode, 200, 'Update must return 200')
    assert.equal(putRes.body.data.method, 'headless-api', 'Saved method must be headless-api')
    console.log(`     ✅ API returned saved method: "${putRes.body.data.method}"`)

    // 2. Simulate page reload / logout & login (GET /clients/:id/integration)
    console.log(`  2. Simulating page refresh & login reload via getClientIntegration API...`)
    const getReq = {
      params: { id: clientInfo.id },
      user: { role: 'Super Admin', isPrimaryAdmin: true },
    }
    const getRes = mockRes()
    await getClientIntegration(getReq, getRes, mockNext())
    assert.equal(getRes.statusCode, 200, 'Get must return 200')
    assert.equal(getRes.body.data.integration.method, 'headless-api', 'Reloaded method must be headless-api')
    console.log(`     ✅ Reloaded method from backend: "${getRes.body.data.integration.method}" (confirmed persisted on server)`)

    // 3. Verify live connection with empty body (verifier resolves solely from DB)
    console.log(`  3. Running live connection verification with empty body (no manual overrides)...`)
    const verifyReq = {
      params: { id: clientInfo.id },
      body: {}, // EMPTY BODY: Verifier MUST resolve method from DB!
      user: { role: 'Super Admin', isPrimaryAdmin: true },
    }
    const verifyRes = mockRes()
    const verifyNext = mockNext()
    await verifyLiveWebsiteIntegration(verifyReq, verifyRes, verifyNext)

    if (verifyNext.called && verifyNext.error) {
      throw new Error(`Verification failed with error: ${verifyNext.error.message}`)
    }

    const report = verifyRes.body.data
    console.log(`     Resolved Method: ${report.method} (${report.methodLabel})`)
    console.log(`     Target URL: ${report.targetUrl}`)
    console.log(`     Overall Status: ${report.overallStatus}`)
    console.log(`     Domain Status: ${report.checks.domainReachable.status} (HTTP ${report.checks.domainReachable.httpStatus}, ${report.checks.domainReachable.latencyMs}ms)`)
    console.log(`     Public API Status: ${report.checks.apiConnectivity.status} (${report.checks.apiConnectivity.endpoint})`)
    console.log(`     Published Content: ${report.checks.publishedContent.status} (${report.checks.publishedContent.count} articles)`)
    console.log(`     Direct REST API Mode: ${report.checks.restApiVerified.status} (${report.checks.restApiVerified.message})`)

    assert.equal(report.method, 'headless-api', 'Must resolve headless-api from database')
    assert.equal(report.overallStatus, 'connected', 'Status MUST be connected')
    assert.equal(report.checks.domainReachable.status, 'passed')
    assert.equal(report.checks.apiConnectivity.status, 'passed')
    assert.equal(report.checks.publishedContent.status, 'passed')
    assert.equal(report.checks.restApiVerified.status, 'passed')
    console.log(`     🎉 ${clientInfo.name} connection status is now CONNECTED & VERIFIED!`)
  }

  console.log('\n======================================================')
  console.log('✅ ALL THREE WEBSITES ARE NOW FULLY CONNECTED!')
  console.log('======================================================\n')

  await mongoose.disconnect()
}

runPhase1CompletionWorkflow().catch((err) => {
  console.error('Workflow error:', err)
  process.exit(1)
})

