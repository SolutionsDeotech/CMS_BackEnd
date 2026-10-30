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
import { swaggerRouter } from './routes/swaggerRoutes.js'
import blogSetupRoutes from './routes/blogSetupRoutes.js'
import { isDbConnected } from './config/db.js'

const app = express()

// Security headers (Allow embedding uploads into frontend iframes & video players)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'self'", 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
      },
    },
  })
)

// Gzip compression
app.use(compression())

// CORS configuration for frontend
const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean)

const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5173',
]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true)

      const normalizedOrigin = origin.replace(/\/+$/, '')
      const isAllowed = allowedOrigins.includes(normalizedOrigin)

      if (isAllowed || (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'))) {
        callback(null, true)
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
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

// Serve uploaded static files with frame and range headers for video and PDF streaming
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.removeHeader('X-Frame-Options')
    next()
  },
  express.static(path.resolve('uploads'))
)

// Global API rate limiting
app.use('/api', apiLimiter)

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    persistence: isDbConnected() ? 'mongodb' : 'local-file',
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
      blogSetup: '/api/v1/blog-setup',
    },
  })
})

// Mount API route groups
const apiPrefix = process.env.API_PREFIX || '/api/v1'

// Mount Swagger interactive documentation and openapi.json
app.use(apiPrefix, swaggerRouter)
app.get('/api-docs', (req, res) => res.redirect(`${apiPrefix}/docs`))
app.get('/docs', (req, res) => res.redirect(`${apiPrefix}/docs`))

app.use(`${apiPrefix}/auth`, authRoutes)
app.use(`${apiPrefix}/posts`, postRoutes)
app.use(`${apiPrefix}/comments`, commentRoutes)
app.use(`${apiPrefix}/categories`, categoryRouter)
app.use(`${apiPrefix}/tags`, tagRouter)
app.use(`${apiPrefix}/media`, mediaRoutes)
app.use(`${apiPrefix}/pages`, pageRoutes)
app.use(`${apiPrefix}/clients`, clientRoutes)
app.use(`${apiPrefix}/blog-setup`, blogSetupRoutes)
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
