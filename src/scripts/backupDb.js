import dotenv from 'dotenv'
dotenv.config()
import fs from 'fs'
import path from 'path'
import connectDB from '../config/db.js'

async function createBackup() {
  try {
    const conn = await connectDB()
    if (!conn) {
      console.error('Failed to connect to database for backup')
      process.exit(1)
    }

    const db = conn.connection.db
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.resolve('backups', `backup-${timestamp}`)
    fs.mkdirSync(backupDir, { recursive: true })

    const collections = await db.listCollections().toArray()
    console.log(`Starting backup of ${collections.length} collections into: ${backupDir}`)

    const summary = {}

    for (const c of collections) {
      const docs = await db.collection(c.name).find({}).toArray()
      const filePath = path.join(backupDir, `${c.name}.json`)
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8')
      summary[c.name] = docs.length
      console.log(`Backed up collection [${c.name}]: ${docs.length} documents`)
    }

    fs.writeFileSync(
      path.join(backupDir, 'backup-summary.json'),
      JSON.stringify({ timestamp, summary }, null, 2),
      'utf-8'
    )

    console.log('\nBackup successfully completed!')
    console.log('Summary:', summary)
    process.exit(0)
  } catch (err) {
    console.error('Backup error:', err)
    process.exit(1)
  }
}

createBackup()

