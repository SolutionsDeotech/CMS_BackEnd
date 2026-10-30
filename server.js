import dotenv from 'dotenv'
dotenv.config()

import app from './src/app.js'
import connectDB from './src/config/db.js'
import store from './src/services/store.js'
import logger from './src/utils/logger.js'

const PORT = process.env.PORT || 5000

async function startServer() {
  try {
    // Attempt database connection with resilient fallback
    await connectDB()

    // Sync seed data if database is connected
    await store.syncToMongoIfConnected()
    await store.loadRegisteredUsers()

    const server = app.listen(PORT, () => {
      logger.info(`====================================================`)
      logger.info(`  Deotech CMS Backend Server Running on Port: ${PORT}`)
      logger.info(`  Environment: ${process.env.NODE_ENV || 'development'}`)
      logger.info(`  Health Check: http://localhost:${PORT}/api/v1/health`)
      logger.info(`  API Base: http://localhost:${PORT}/api/v1`)
      logger.info(`====================================================`)
    })

    // Graceful shutdown handling
    const shutdown = (signal) => {
      logger.info(`${signal} signal received. Closing HTTP server gracefully...`)
      server.close(() => {
        logger.info('HTTP server closed.')
        process.exit(0)
      })
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    logger.error(`Fatal error starting server: ${error.message}`)
    process.exit(1)
  }
}

startServer()
