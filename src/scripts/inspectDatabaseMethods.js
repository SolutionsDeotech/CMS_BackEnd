import dotenv from 'dotenv'
dotenv.config()
import mongoose from 'mongoose'
import Client from '../models/Client.js'
import { connectDB } from '../config/db.js'

async function inspect() {
  await connectDB()
  const clients = await Client.find({}).lean()

  console.log(`\nFound ${clients.length} clients in database:\n`)
  for (const c of clients) {
    console.log(`-------------------------------------------------`)
    console.log(`ID: ${c._id}`)
    console.log(`Custom ID: ${c.customId}`)
    console.log(`Website Name: ${c.websiteName}`)
    console.log(`Website URL: ${c.websiteUrl}`)
    console.log(`Status: ${c.status}`)
    console.log(`integrationSettings:`, JSON.stringify(c.integrationSettings, null, 2))
    console.log(`onboarding.wizard.integrationMethod:`, c.onboarding?.wizard?.integrationMethod)
    console.log(`onboarding.wizard:`, JSON.stringify(c.onboarding?.wizard, null, 2))
    console.log(`onboarding:`, JSON.stringify(c.onboarding, null, 2))
  }

  // Also check onboarding-websites setting in MongoDB
  const { getBlogSetupSetting } = await import('../services/blogSetupSettings.js')
  const onboardingWebsites = await getBlogSetupSetting('onboarding-websites', 'global', {})
  console.log(`\n=================================================`)
  console.log(`ONBOARDING-WEBSITES SETTINGS IN DB:`)
  console.log(`=================================================\n`)
  for (const [k, v] of Object.entries(onboardingWebsites || {})) {
    console.log(`Key: ${k}`)
    console.log(`  Name: ${v.name || v.websiteName}`)
    console.log(`  Url: ${v.url || v.websiteUrl}`)
    console.log(`  wizard.integrationMethod: ${v.wizard?.integrationMethod}`)
    console.log(`  wizard.verificationStatus: ${v.wizard?.verificationStatus}`)
  }

  await mongoose.disconnect()
}

inspect().catch(console.error)

