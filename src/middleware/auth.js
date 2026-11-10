import jwt from 'jsonwebtoken'
import AppError from '../utils/AppError.js'
import store from '../services/store.js'
import User from '../models/User.js'
import Role from '../models/Role.js'
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
 * Allows Primary Admin, Owner Admin, or Client Admin to manage onboarding and websites
 */
export const requireOnboardingAccess = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('Authentication required. Please sign in.', 401))
  }
  const role = req.user.role || req.user.userType
  const isPrimary = Boolean(req.user.isPrimaryAdmin)
  const isAuthorized =
    isPrimary ||
    ['Admin', 'Super Admin', 'OwnerAdmin', 'Client Admin'].includes(role) ||
    req.user.userType === 'Admin'

  if (!isAuthorized) {
    return next(
      new AppError(
        'Access denied. Administrative privileges are required to configure website onboarding.',
        403,
        { code: 'ADMIN_ACCESS_REQUIRED' }
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

  // Tenant Isolation enforcement: If Owner Admin, safely force scope to user's assigned client
  if (isOwnerAdmin && !isPrimaryAdmin) {
    const userClient = req.user.clientId || ''
    if (userClient) {
      if (req.body) req.body.clientId = userClient
      if (req.query) req.query.clientId = userClient
    }
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

  // Tenant Isolation enforcement: If not primary admin, safely enforce own tenant scope
  if (!isPrimaryAdmin) {
    const userClient = req.user.clientId || ''
    if (userClient) {
      if (req.body) req.body.clientId = userClient
      if (req.query) req.query.clientId = userClient
    }
  }

  next()
}

/**
 * Granular module and action level permission verifier
 */
export const requirePermission = (moduleName, action = 'view') => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required. Please sign in.', 401))
    }

    // Super Admin has full global access across all modules and actions
    if (req.user.isPrimaryAdmin) {
      return next()
    }

    const roleName = req.user.role || req.user.userType

    // Tenant Admin / OwnerAdmin has full administrative authority within their tenant
    if (roleName === 'OwnerAdmin' || roleName === 'Client Admin' || roleName === 'Admin') {
      return next()
    }

    // 1. Check user-level permissions override first
    const userPerms = req.user.permissions || {}
    const modulePerms = userPerms[moduleName] || userPerms[moduleName === 'posts' ? 'blogPosts' : moduleName]
    if (Array.isArray(modulePerms)) {
      if (
        modulePerms.includes(action) ||
        modulePerms.includes('manage') ||
        modulePerms.includes('all') ||
        (action === 'view' && modulePerms.length > 0)
      ) {
        return next()
      }
    }

    // 2. Check role-level permissions from MongoDB or store
    let roleDoc = null
    if (isDbConnected()) {
      try {
        roleDoc = await Role.findOne({
          name: roleName,
          $or: [{ clientId: req.user.clientId }, { clientId: 'global' }],
        })
      } catch (e) {
        // Fallback to store
      }
    }

    if (!roleDoc && store.roles) {
      roleDoc = store.roles.find((r) => r.name?.toLowerCase() === roleName?.toLowerCase())
    }

    if (roleDoc && roleDoc.permissions) {
      const perms =
        roleDoc.permissions[moduleName] ||
        roleDoc.permissions[moduleName === 'posts' ? 'blogPosts' : moduleName] ||
        []
      if (
        perms.includes(action) ||
        perms.includes('manage') ||
        perms.includes('all') ||
        (action === 'view' && perms.length > 0)
      ) {
        return next()
      }
    }

    return next(
      new AppError(
        `Permission denied: You do not have permission to ${action} in ${moduleName}.`,
        403,
        { code: 'PERMISSION_DENIED', module: moduleName, action }
      )
    )
  }
}
