import dotenv from 'dotenv'
dotenv.config()

import app from './src/app.js'
import connectDB from './src/config/db.js'
import store from './src/services/store.js'
import logger from './src/utils/logger.js'
import { verifyEmailTransport } from './src/services/emailService.js'
import { startWebhookRetryDaemon } from './src/services/webhookService.js'
import { startScheduledPostDaemon } from './src/services/scheduledPostService.js'

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

      // Non-blocking diagnostic SMTP connection test on startup
      verifyEmailTransport().catch((err) => {
        logger.warn(`[Email Service] Startup verification error: ${err.message}`)
      })
    })

    // Start background webhook retry worker
    let stopRetryDaemon = null
    try {
      stopRetryDaemon = startWebhookRetryDaemon(30000)
      logger.info('  Webhook Retry Daemon: active (30s interval)')
    } catch (daemonErr) {
      logger.warn(`Failed to start webhook retry daemon: ${daemonErr.message}`)
    }

    // Start background scheduled blog post publisher worker
    let stopScheduledDaemon = null
    try {
      stopScheduledDaemon = startScheduledPostDaemon(30000)
      logger.info('  Scheduled Post Publisher Daemon: active (30s interval)')
    } catch (schedErr) {
      logger.warn(`Failed to start scheduled post daemon: ${schedErr.message}`)
    }

    // Graceful shutdown handling
    const shutdown = (signal) => {
      logger.info(`${signal} signal received. Closing HTTP server gracefully...`)
      if (stopRetryDaemon) {
        try {
          stopRetryDaemon()
          logger.info('Webhook retry daemon stopped.')
        } catch {}
      }
      if (stopScheduledDaemon) {
        try {
          stopScheduledDaemon()
          logger.info('Scheduled post daemon stopped.')
        } catch {}
      }
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
