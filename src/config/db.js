import mongoose from 'mongoose'
import logger from '../utils/logger.js'

let isConnected = false

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/deotech_cms'

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })

    isConnected = true
    const hostInfo = conn.connection.port ? `${conn.connection.host}:${conn.connection.port}` : conn.connection.host
    logger.info(`====================================================`)
    logger.info(`  MongoDB Connected Successfully: ${hostInfo}`)
    logger.info(`  Database Name: ${conn.connection.name}`)
    logger.info(`  Storage Mode: PERMANENT DATABASE STORAGE (MongoDB)`)
    logger.info(`====================================================`)
    return conn
  } catch (error) {
    isConnected = false
    const sanitizedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
    logger.error(`====================================================`)
    logger.error(`  MongoDB Connection FAILED: ${error.message}`)
    logger.error(`  URI Attempted: ${sanitizedUri}`)
    logger.error(`====================================================`)
    if (process.env.STRICT_DB === 'true' || process.env.NODE_ENV === 'production') {
      throw error
    }
    return null
  }
}

export const isDbConnected = () => isConnected

export default connectDB
