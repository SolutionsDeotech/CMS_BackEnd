import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendUploadsDir = path.resolve(__dirname, '../uploads')

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
import Client from './models/Client.js'
import store from './services/store.js'

const app = express()

// Trust reverse proxies (Cloudflare, Nginx, Render, AWS) for accurate client IPs and rate limiting
app.set('trust proxy', 1)

// Security headers (Allow embedding uploads into frontend iframes, object tags, Swagger CDN & video players)
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://unpkg.com', 'data:'],
        frameAncestors: ["'self'", 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
        objectSrc: ["'self'", 'blob:', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https:',
          'http:',
          'https://cdnjs.cloudflare.com',
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
        ],
        mediaSrc: ["'self'", 'blob:', 'data:', 'https:', 'http:'],
        connectSrc: ["'self'", 'https:', 'http:'],
      },
    },
  })
)

// Gzip compression
app.use(compression())

// CORS configuration: Safe multi-origin and client-domain support without wildcard *
function extractOrigin(str) {
  if (!str) return null
  try {
    const hasProtocol = /^https?:\/\//i.test(str)
    const url = new URL(hasProtocol ? str : `https://${str}`)
    return url.origin.toLowerCase()
  } catch {
    return str.trim().toLowerCase().replace(/\/+$/, '')
  }
}

function parseOrigins(raw) {
  if (!raw) return []
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(extractOrigin)
    .filter(Boolean)
}

const staticAllowedOrigins = new Set([
  ...parseOrigins(process.env.FRONTEND_URL),
  ...parseOrigins(process.env.ALLOWED_ORIGINS),
  ...parseOrigins(process.env.CLIENT_DOMAINS),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

async function isOriginAllowed(origin) {
  if (!origin) return true
  const normalizedOrigin = extractOrigin(origin)
  if (!normalizedOrigin) return false

  // 1. Configured origins whitelist (FRONTEND_URL, ALLOWED_ORIGINS, CLIENT_DOMAINS)
  if (staticAllowedOrigins.has(normalizedOrigin)) return true

  // 2. Allow Render cloud deployments
  if (normalizedOrigin.endsWith('.onrender.com')) return true

  // 3. Local development origins
  if (process.env.NODE_ENV !== 'production') {
    if (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:')) {
      return true
    }
  }

  // 4. Dynamically allow active tenant client domains (from DB or memory store)
  try {
    if (isDbConnected()) {
      const activeClients = await Client.find({ status: { $ne: 'inactive' } }, 'websiteUrl').lean()
      for (const client of activeClients) {
        if (extractOrigin(client.websiteUrl) === normalizedOrigin) {
          staticAllowedOrigins.add(normalizedOrigin)
          return true
        }
      }
    } else if (store?.clients) {
      for (const client of store.clients) {
        if (client.status !== 'inactive' && extractOrigin(client.websiteUrl) === normalizedOrigin) {
          staticAllowedOrigins.add(normalizedOrigin)
          return true
        }
      }
    }
  } catch {
    // Fail closed on error without crashing
  }

  return false
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true)

      isOriginAllowed(origin)
        .then((allowed) => {
          if (allowed) {
            callback(null, true)
          } else {
            callback(null, false)
          }
        })
        .catch(() => callback(null, false))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client-Id', 'X-Tenant-Id'],
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
const staticUploadsMiddleware = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none')
  res.removeHeader('X-Frame-Options')
  res.setHeader('Content-Disposition', 'inline')
  next()
}

const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline')
    } else if (filePath.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4')
    } else if (filePath.endsWith('.webm')) {
      res.setHeader('Content-Type', 'video/webm')
    }
  },
}

app.use('/uploads', staticUploadsMiddleware, express.static(backendUploadsDir, staticOptions))
app.use('/uploads', staticUploadsMiddleware, express.static(path.resolve('uploads'), staticOptions))

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
app.get('/swagger', (req, res) => res.redirect(`${apiPrefix}/docs`))
app.get('/swagger-ui', (req, res) => res.redirect(`${apiPrefix}/docs`))
app.get('/docs', (req, res) => res.redirect(`${apiPrefix}/docs`))
app.get('/openapi.json', (req, res) => res.redirect(`${apiPrefix}/openapi.json`))

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
