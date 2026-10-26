import rateLimit from 'express-rate-limit'

export const apiLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MIN, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again after 15 minutes',
  },
})
