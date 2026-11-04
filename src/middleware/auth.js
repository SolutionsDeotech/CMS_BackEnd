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

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required. Please sign in.', 401))
  }
  const isPrimary = Boolean(req.user.isPrimaryAdmin)

  if (!isPrimary) {
    return next(
      new AppError(
        'Access denied. Only the authorized primary Admin has global access to this resource.',
        403,
        { code: 'GLOBAL_ADMIN_REQUIRED' }
      )
    )
  }
  next()
}

/**
 * Allows Primary Admin OR Owner Admin (for their own assigned website)
 */
export const requireOwnerAdminOrAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required. Please sign in.', 401))
  }
  const role = req.user.role || req.user.userType
  const isPrimaryAdmin = Boolean(req.user.isPrimaryAdmin)
  const isOwnerAdmin = role === 'OwnerAdmin'

  if (!isPrimaryAdmin && !isOwnerAdmin) {
    return next(
      new AppError(
        'Access denied. Owner Admin or Global Admin privileges required.',
        403,
        { code: 'OWNER_ADMIN_REQUIRED' }
      )
    )
  }

  // Tenant Isolation enforcement: If Owner Admin, ensure their tenant matches target
  if (isOwnerAdmin && !isPrimaryAdmin) {
    const userClient = req.user.clientId || 'cli-1'
    const requestedClient = req.body?.clientId || req.query?.clientId || req.params?.clientId

    if (requestedClient && requestedClient !== 'all' && requestedClient !== userClient) {
      return next(
        new AppError(
          `Tenant Isolation: You are only permitted to access your assigned website (${userClient}).`,
          403,
          { code: 'TENANT_ISOLATION_VIOLATION' }
        )
      )
    }

    // Force client scope
    if (req.body) req.body.clientId = userClient
    if (req.query) req.query.clientId = userClient
  }

  next()
}

/**
 * Allows Primary Admin, Owner Admin, or Client Admin
 */
export const requireClientAdminOrHigher = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required. Please sign in.', 401))
  }
  const role = req.user.role || req.user.userType

  const isPrimaryAdmin = Boolean(req.user.isPrimaryAdmin)
  const isOwnerAdmin = role === 'OwnerAdmin'
  const isClientAdmin = role === 'Client Admin' || role === 'Admin'

  if (!isPrimaryAdmin && !isOwnerAdmin && !isClientAdmin) {
    return next(
      new AppError(
        'Access denied. Administrative privileges required for this section.',
        403,
        { code: 'ADMIN_ACCESS_REQUIRED' }
      )
    )
  }

  // Tenant Isolation enforcement: If not primary admin, enforce own tenant scope
  if (!isPrimaryAdmin) {
    const userClient = req.user.clientId || 'cli-1'
    const requestedClient = req.body?.clientId || req.query?.clientId || req.params?.clientId

    if (requestedClient && requestedClient !== 'all' && requestedClient !== userClient) {
      return next(
        new AppError(
          `Tenant Isolation: You are only permitted to access your assigned website (${userClient}).`,
          403,
          { code: 'TENANT_ISOLATION_VIOLATION' }
        )
      )
    }

    // Force tenant scope to prevent cross-tenant access
    if (req.body) req.body.clientId = userClient
    if (req.query) req.query.clientId = userClient
  }

  next()
}
