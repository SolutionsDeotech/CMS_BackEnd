import dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose'
import { connectDB } from '../config/db.js'
import Client from '../models/Client.js'
import { verifyLiveWebsiteIntegration } from '../controllers/universalIntegrationController.js'

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

async function verifyAllThreeRealDb() {
  await connectDB()

  const targetSites = [
    { name: 'Deotech Solutions', query: { websiteUrl: /deotechsolutions/i } },
    { name: 'Workleisure', query: { websiteUrl: /workleisure/i } },
    { name: 'CMS', query: { $or: [{ customId: 'site-1795254226985' }, { websiteUrl: /cms-frontend/i }] } },
  ]

  console.log('\n======================================================')
  console.log('🔍 VERIFYING REAL DATABASE RECORDS WITHOUT OVERRIDES')
  console.log('   (req.body is empty - method resolved purely from DB)')
  console.log('======================================================\n')

  for (const siteInfo of targetSites) {
    const client = await Client.findOne(siteInfo.query).lean()
    if (!client) {
      console.log(`❌ Client not found: ${siteInfo.name}`)
      continue
    }

    console.log(`Site: ${siteInfo.name}`)
    console.log(`  - customId: ${client.customId}`)
    console.log(`  - websiteUrl: ${client.websiteUrl}`)
    console.log(`  - saved integrationSettings.method: ${client.integrationSettings?.method || '(not set on client)'}`)
    console.log(`  - saved onboarding.wizard.integrationMethod: ${client.onboarding?.wizard?.integrationMethod || '(not set)'}`)

    // Strictly pass empty body so verifier must resolve from DB
    const req = {
      params: { id: client.customId || String(client._id) },
      body: {}, // NO manual method override!
      user: { role: 'Super Admin', isPrimaryAdmin: true },
    }
    const res = mockRes()
    const next = mockNext()

    await verifyLiveWebsiteIntegration(req, res, next)

    if (next.called && next.error) {
      console.log(`  ❌ Verification errored:`, next.error.message)
      continue
    }

    const report = res.body?.data
    console.log(`  - Resolved Method from DB: ${report.method} (${report.methodLabel})`)
    console.log(`  - Target URL: ${report.targetUrl}`)
    console.log(`  - Overall Status: ${report.overallStatus}`)
    console.log(`  - Checks:`)
    console.log(`      * Domain: ${report.checks.domainReachable.status} (HTTP ${report.checks.domainReachable.httpStatus}, ${report.checks.domainReachable.latencyMs}ms)`)
    console.log(`      * API Connectivity: ${report.checks.apiConnectivity.status}`)
    console.log(`      * Published Articles: ${report.checks.publishedContent.status} (${report.checks.publishedContent.count} posts)`)
    if (report.method === 'headless-api') {
      console.log(`      * REST API Mode: ${report.checks.restApiVerified.status} (${report.checks.restApiVerified.message})`)
      console.log(`      * Embed Script Tag: ${report.checks.embedScriptDetected.status} (${report.checks.embedScriptDetected.message})`)
      console.log(`      * Blog Container: ${report.checks.containerDetected.status} (${report.checks.containerDetected.message})`)
    } else if (report.method === 'hosted') {
      console.log(`      * SSR Route Verified: ${report.checks.ssrRouteVerified?.status} (${report.checks.ssrRouteVerified?.message})`)
    } else {
      console.log(`      * Embed Script: ${report.checks.embedScriptDetected.status} (${report.checks.embedScriptDetected.message})`)
      console.log(`      * Blog Container: ${report.checks.containerDetected.status} (${report.checks.containerDetected.message})`)
    }
    if (report.instructions.length > 0) {
      console.log(`  - Instructions:`)
      report.instructions.forEach((ins) => console.log(`      * ${ins}`))
    }
    console.log('------------------------------------------------------\n')
  }

  await mongoose.disconnect()
}

verifyAllThreeRealDb().catch((err) => {
  console.error('Real DB verification failed:', err)
  process.exit(1)
})

