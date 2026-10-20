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
      currentUser = await User.findById(decoded.id)
    }

    if (!currentUser) {
      currentUser = store.users.find(
        (u) => String(u._id) === String(decoded.id) || u.email === decoded.email
      )
    }

    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401))
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
      currentUser = await User.findById(decoded.id)
    }
    if (!currentUser) {
      currentUser = store.users.find(
        (u) => String(u._id) === String(decoded.id) || u.email === decoded.email
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
