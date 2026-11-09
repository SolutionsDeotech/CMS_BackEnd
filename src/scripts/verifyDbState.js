import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const uri = process.env.MONGODB_URI

async function verify() {
  await mongoose.connect(uri)
  const db = mongoose.connection.db

  const clients = await db.collection('clients').find({}).toArray()
  console.log('--- CLIENTS in MongoDB ---')
  console.log(clients.map(c => ({ id: c.customId || c.id || c._id, name: c.websiteName, url: c.websiteUrl, status: c.status })))

  const onboardingSettings = await db.collection('blogsetupsettings').findOne({ key: 'onboarding-websites' })
  console.log('--- ONBOARDING WEBSITES SETTING in blogsetupsettings ---')
  if (onboardingSettings && onboardingSettings.value) {
    console.log(JSON.stringify(onboardingSettings.value['site-1793694562971'], null, 2))
  } else {
    console.log('No onboarding-websites setting found.')
  }

  const users = await db.collection('users').find({}).toArray()
  console.log('--- USERS in MongoDB ---')
  console.log(users.map(u => ({ email: u.email, role: u.role, clientId: u.clientId, isPrimaryAdmin: u.isPrimaryAdmin })))

  await mongoose.disconnect()
}

verify().catch(console.error)
