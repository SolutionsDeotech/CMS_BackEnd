import dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose'
import Client from '../models/Client.js'
import Post from '../models/Post.js'
import { connectDB } from '../config/db.js'
import { verifyLiveWebsiteIntegration } from '../controllers/universalIntegrationController.js'

function mockResponse() {
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

async function runTest() {
  console.log('Connecting to database...')
  await connectDB()

  const targetSites = [
    { name: 'Deotech Solutions', query: { websiteUrl: /deotechsolutions/i } },
    { name: 'Workleisure', query: { websiteUrl: /workleisure/i } },
    { name: 'CMS', query: { $or: [{ customId: 'site-1795254226985' }, { websiteUrl: /cms-frontend/i }] } },
  ]

  console.log('\n======================================================')
  console.log('🔍 AUDITING LIVE VERIFICATION FOR THE 3 WEBSITES')
  console.log('======================================================\n')

  for (const siteInfo of targetSites) {
    console.log(`Checking ${siteInfo.name}...`)
    const client = await Client.findOne(siteInfo.query).lean()
    if (!client) {
      console.log(`  ❌ Record not found in database for ${siteInfo.name}`)
      continue
    }

    console.log(`  Found client: _id=${client._id}, customId=${client.customId}, websiteUrl=${client.websiteUrl}`)

    // 1. Test with Direct REST API (headless-api)
    console.log(`\n  --- 1. Testing with Method: Direct REST API (headless-api) ---`)
    const reqApi = {
      params: { id: client.customId || String(client._id) },
      body: { method: 'headless-api' },
      user: { role: 'Super Admin', isPrimaryAdmin: true },
    }
    const resApi = mockResponse()
    const nextApi = mockNext()

    await verifyLiveWebsiteIntegration(reqApi, resApi, nextApi)

    if (nextApi.called && nextApi.error) {
      console.log(`  ❌ Verification errored:`, nextApi.error.message)
    } else {
      const report = resApi.body?.data
      console.log(`  Target URL: ${report.targetUrl}`)
      console.log(`  Method: ${report.method} (${report.methodLabel})`)
      console.log(`  Overall Status: ${report.overallStatus}`)
      console.log(`  Checks:`)
      console.log(`    - Domain: ${report.checks.domainReachable.status} (${report.checks.domainReachable.httpStatus}, ${report.checks.domainReachable.latencyMs}ms)`)
      console.log(`    - API Connectivity: ${report.checks.apiConnectivity.status} (${report.checks.apiConnectivity.endpoint})`)
      console.log(`    - Published Content: ${report.checks.publishedContent.status} (${report.checks.publishedContent.count} posts)`)
      console.log(`    - REST API Mode: ${report.checks.restApiVerified.status} (${report.checks.restApiVerified.message})`)
      console.log(`    - Embed Script: ${report.checks.embedScriptDetected.status} (${report.checks.embedScriptDetected.message})`)
      console.log(`    - Blog Container: ${report.checks.containerDetected.status} (${report.checks.containerDetected.message})`)
    }

    // 2. Test with Drop-in Embed (embed)
    console.log(`\n  --- 2. Testing with Method: Drop-in Embed (embed) ---`)
    const reqEmbed = {
      params: { id: client.customId || String(client._id) },
      body: { method: 'embed' },
      user: { role: 'Super Admin', isPrimaryAdmin: true },
    }
    const resEmbed = mockResponse()
    const nextEmbed = mockNext()

    await verifyLiveWebsiteIntegration(reqEmbed, resEmbed, nextEmbed)

    if (nextEmbed.called && nextEmbed.error) {
      console.log(`  ❌ Verification errored:`, nextEmbed.error.message)
    } else {
      const report = resEmbed.body?.data
      console.log(`  Target URL: ${report.targetUrl}`)
      console.log(`  Method: ${report.method} (${report.methodLabel})`)
      console.log(`  Overall Status: ${report.overallStatus}`)
      console.log(`  Checks:`)
      console.log(`    - Domain: ${report.checks.domainReachable.status} (${report.checks.domainReachable.httpStatus}, ${report.checks.domainReachable.latencyMs}ms)`)
      console.log(`    - Embed Script: ${report.checks.embedScriptDetected.status} (${report.checks.embedScriptDetected.message})`)
      console.log(`    - Blog Container: ${report.checks.containerDetected.status} (${report.checks.containerDetected.message})`)
      console.log(`    - API Connectivity: ${report.checks.apiConnectivity.status}`)
      console.log(`    - Published Content: ${report.checks.publishedContent.status} (${report.checks.publishedContent.count} posts)`)
    }
    console.log('------------------------------------------------------\n')
  }

  await mongoose.disconnect()
  console.log('Audit complete.')
}

runTest().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})

