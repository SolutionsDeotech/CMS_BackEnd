import logger from '../utils/logger.js'

export const errorHandler = (err, req, res, next) => {
  let error = { ...err }
  error.message = err.message
  error.statusCode = err.statusCode || 500

  // Log error for internal inspection
  if (error.statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, { stack: err.stack })
  } else {
    logger.warn(`[${req.method}] ${req.originalUrl} - ${err.message}`)
  }

  // Mongoose bad ObjectId (CastError)
  if (err.name === 'CastError') {
    const message = `Resource not found with id: ${err.value}`
    error.statusCode = 404
    error.message = message
  }

  // Mongoose duplicate key (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field'
    const message = `Duplicate value entered for ${field}. Please use another value.`
    error.statusCode = 400
    error.message = message
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message).join(', ')
    error.statusCode = 400
    error.message = message
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.statusCode = 401
    error.message = 'Invalid authentication token'
  }

  if (err.name === 'TokenExpiredError') {
    error.statusCode = 401
    error.message = 'Authentication token expired'
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message || 'Internal Server Error',
    details: error.details || null,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

export default errorHandler
