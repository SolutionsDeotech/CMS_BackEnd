import jwt from 'jsonwebtoken'
import AppError from '../utils/AppError.js'
import store from '../services/store.js'
import User from '../models/User.js'
import { isDbConnected } from '../config/db.js'

export const verifyToken = async (req, res, next) => {
  let token

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1]
  }

  if (!token) {
    return next(new AppError('Authentication required. Please provide a token.', 401))
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech'
    )

    let currentUser = null
    if (isDbConnected()) {
      if (decoded.id && /^[0-9a-fA-F]{24}$/.test(decoded.id)) {
        currentUser = await User.findById(decoded.id)
      }
      if (!currentUser && (decoded.id || decoded.email)) {
        currentUser = await User.findOne({
          $or: [
            ...(decoded.id ? [{ customId: decoded.id }] : []),
            ...(decoded.email ? [{ email: decoded.email.toLowerCase() }] : []),
          ],
        })
      }
    }

    if (!currentUser) {
      currentUser = store.users.find(
        (u) => String(u._id) === String(decoded.id) || u.customId === decoded.id || u.email === decoded.email
      )
    }

    if (!currentUser) {
      return next(
        new AppError(
          'Your session is no longer active. Please sign in again.',
          401,
          { code: 'SESSION_USER_NOT_FOUND' }
        )
      )
    }

    req.user = currentUser
    next()
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401))
  }
}

export const optionalAuth = async (req, res, next) => {
  let token
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1]
  }

  if (!token) {
    return next()
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech'
    )
    let currentUser = null
    if (isDbConnected()) {
      if (decoded.id && /^[0-9a-fA-F]{24}$/.test(decoded.id)) {
        currentUser = await User.findById(decoded.id)
      }
      if (!currentUser && (decoded.id || decoded.email)) {
        currentUser = await User.findOne({
          $or: [
            ...(decoded.id ? [{ customId: decoded.id }] : []),
            ...(decoded.email ? [{ email: decoded.email.toLowerCase() }] : []),
          ],
        })
      }
    }
    if (!currentUser) {
      currentUser = store.users.find(
        (u) => String(u._id) === String(decoded.id) || u.customId === decoded.id || u.email === decoded.email
      )
    }
    if (currentUser) {
      req.user = currentUser
    }
  } catch {
    // Ignore error for optional authentication
  }
  next()
}

export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('User not authenticated', 401))
    }
    const userRole = req.user.userType || req.user.role
    if (!roles.includes(userRole)) {
      return next(
        new AppError(
          `User role '${userRole}' is not authorized to access this route`,
          403
        )
      )
    }
    next()
  }
}
