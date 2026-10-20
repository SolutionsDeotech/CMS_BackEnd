import mongoose from 'mongoose'
import logger from '../utils/logger.js'

let isConnected = false

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/deotech_cms'

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    })

    isConnected = true
    logger.info(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`)
    return conn
  } catch (error) {
    isConnected = false
    logger.warn(`MongoDB connection not available (${error.message}). Running in resilient In-Memory / File Fallback Mode.`)
    return null
  }
}

export const isDbConnected = () => isConnected

export default connectDB
