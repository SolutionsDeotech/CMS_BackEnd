import express from 'express'
import path from 'path'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

import { errorHandler } from './middleware/errorHandler.js'
import { apiLimiter } from './middleware/rateLimiter.js'
import authRoutes from './routes/authRoutes.js'
import postRoutes from './routes/postRoutes.js'
import commentRoutes from './routes/commentRoutes.js'
import { categoryRouter, tagRouter } from './routes/taxonomyRoutes.js'
import mediaRoutes from './routes/mediaRoutes.js'
import pageRoutes from './routes/pageRoutes.js'
import clientRoutes from './routes/clientRoutes.js'
import { opsRouter } from './routes/opsRoutes.js'

const app = express()

// Security headers
app.use(helmet({ crossOriginResourcePolicy: false }))

// Gzip compression
app.use(compression())

// CORS configuration for frontend
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(null, true) // Lenient for development
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
)

// Body parsers
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
} else {
  app.use(morgan('combined'))
}

// Serve uploaded static files
app.use('/uploads', express.static(path.resolve('uploads')))

// Global API rate limiting
app.use('/api', apiLimiter)

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'Deotech CMS Backend API',
    version: '1.0.0',
  })
})

// API root welcome / index
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    service: 'Deotech Solutions Enterprise Multi-Tenant CMS API',
    version: 'v1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      posts: '/api/v1/posts',
      comments: '/api/v1/comments',
      categories: '/api/v1/categories',
      tags: '/api/v1/tags',
      media: '/api/v1/media',
      pages: '/api/v1/pages',
      clients: '/api/v1/clients',
      analytics: '/api/v1/analytics',
      seo: '/api/v1/seo',
      roles: '/api/v1/roles',
      redirects: '/api/v1/redirects',
      newsletter: '/api/v1/newsletter',
    },
  })
})

// Mount API route groups
const apiPrefix = process.env.API_PREFIX || '/api/v1'
app.use(`${apiPrefix}/auth`, authRoutes)
app.use(`${apiPrefix}/posts`, postRoutes)
app.use(`${apiPrefix}/comments`, commentRoutes)
app.use(`${apiPrefix}/categories`, categoryRouter)
app.use(`${apiPrefix}/tags`, tagRouter)
app.use(`${apiPrefix}/media`, mediaRoutes)
app.use(`${apiPrefix}/pages`, pageRoutes)
app.use(`${apiPrefix}/clients`, clientRoutes)
app.use(`${apiPrefix}`, opsRouter)

// 404 handler for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}. Route not found on this server.`,
  })
})

// Centralized error handling middleware
app.use(errorHandler)

export default app
