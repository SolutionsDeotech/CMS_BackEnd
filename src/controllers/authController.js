import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, generateOTP } from '../utils/helpers.js'
import store from '../services/store.js'
import User from '../models/User.js'
import { isDbConnected } from '../config/db.js'
import {
  sendPasswordResetOtpEmail,
  sendPasswordResetSuccessEmail,
  sendPasswordChangedNotificationEmail,
  sendWelcomeRegistrationEmail,
} from '../services/emailService.js'

// In-memory OTP cache for forgot password
const otpCache = new Map()

export function parseUserAgent(uaString = '') {
  const ua = uaString || ''

  // 1. Detect OS / Device
  let os = 'Unknown OS'
  if (/Android/i.test(ua)) {
    os = 'Android'
  } else if (/iPhone/i.test(ua)) {
    os = 'iOS (iPhone)'
  } else if (/iPad/i.test(ua)) {
    os = 'iOS (iPad)'
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS'
  } else if (/Windows NT 10.0/i.test(ua) || /Windows NT 11.0/i.test(ua) || /Windows/i.test(ua)) {
    os = 'Windows'
  } else if (/Linux/i.test(ua)) {
    os = 'Linux'
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS'
  }

  // 2. Detect Browser
  let browser = 'Browser'
  if (/Edg\//i.test(ua)) {
    browser = 'Edge'
  } else if (/OPR\/|Opera/i.test(ua)) {
    browser = 'Opera'
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'Samsung Internet'
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = 'Chrome'
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Firefox'
  } else if (/Safari/i.test(ua) && !/Android/i.test(ua)) {
    browser = 'Safari'
  }

  return {
    os,
    browser,
    displayDevice: `${browser} on ${os}`,
  }
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.ip || req.connection?.remoteAddress || '127.0.0.1'
}

async function recordLoginSession(user, req) {
  try {
    const currentUA = req.headers['user-agent'] || ''
    const currentIp = getClientIp(req)
    const parsed = parseUserAgent(currentUA)
    const currentDevice = parsed.displayDevice

    let sessions = Array.isArray(user.activeSessions) ? [...user.activeSessions] : []
    sessions = sessions.filter((s) => s && s.id !== 'sess-mobile-1').map((s) => ({ ...s, isCurrent: false }))

    const newSession = {
      id: `sess-${Date.now()}`,
      device: currentDevice,
      ip: currentIp,
      location: user.country || 'Active Device',
      lastActive: 'Current Session',
      isCurrent: true,
    }
    sessions.unshift(newSession)
    sessions = sessions.slice(0, 5)

    if (isDbConnected() && user._id) {
      await User.findByIdAndUpdate(user._id, { activeSessions: sessions })
    }
    user.activeSessions = sessions
  } catch (e) {
    console.error('Failed to record login session:', e)
  }
}

export const register = asyncHandler(async (req, res, next) => {
  // Requirement 1 & 2: Completely Disable Public Signup on backend
  return next(
    new AppError(
      'Public user registration is disabled on this platform. User accounts can only be created by an authorized Admin.',
      403,
      { code: 'PUBLIC_SIGNUP_DISABLED' }
    )
  )
})

export const adminLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body

  if (!email || !password) {
    return next(new AppError('Please provide both email and password', 400))
  }

  const normalizedEmail = email.trim().toLowerCase()
  let user
  if (isDbConnected()) {
    user = await User.findOne({ email: normalizedEmail }).select('+password')
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    user = store.users.find((item) => item.email?.toLowerCase() === normalizedEmail)
  }

  if (!user) {
    return next(new AppError('Invalid email or password credentials', 401))
  }

  if (user.status && user.status !== 'active') {
    return next(new AppError('This account is not active. Contact your administrator.', 403))
  }

  let isMatch = false
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(password, user.password)
  } else {
    isMatch = user.password === password
  }

  if (!isMatch) {
    return next(new AppError('Invalid email or password credentials', 401))
  }

  // Strict Admin Route Verification: Only the verified primary Admin is authorized
  const isPrimary = Boolean(user.isPrimaryAdmin)
  if (!isPrimary) {
    return next(
      new AppError(
        'Access denied. This login portal is strictly reserved for the authorized Admin.',
        403,
        { code: 'NON_ADMIN_ACCESS_DENIED' }
      )
    )
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, userType: user.userType, role: user.role, isPrimaryAdmin: true },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const userSafe = { ...(user.toObject ? user.toObject() : user) }
  delete userSafe.password

  await recordLoginSession(user, req)

  return sendSuccess(res, { user: userSafe, token, redirectUrl: '/dashboard' }, 'Admin logged in successfully')
})

export const userLogin = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body

  if (!email || !password) {
    return next(new AppError('Please provide both email and password', 400))
  }

  const normalizedEmail = email.trim().toLowerCase()
  let user
  if (isDbConnected()) {
    user = await User.findOne({ email: normalizedEmail }).select('+password')
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    user = store.users.find((item) => item.email?.toLowerCase() === normalizedEmail)
  }

  if (!user) {
    return next(new AppError('Invalid email or password credentials', 401))
  }

  if (user.status && user.status !== 'active') {
    return next(new AppError('This account is not active. Contact your administrator.', 403))
  }

  let isMatch = false
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(password, user.password)
  } else {
    isMatch = user.password === password
  }

  if (!isMatch) {
    return next(new AppError('Invalid email or password credentials', 401))
  }

  // Requirement 3 & 4: Only the primary Admin account is routed to /admin/login.
  // The primary Admin cannot log in through the regular user portal.
  const isPrimaryAdminAccount = Boolean(user.isPrimaryAdmin)
  if (isPrimaryAdminAccount) {
    return next(
      new AppError(
        'The primary Admin account must sign in through the Admin Portal at /admin/login.',
        403,
        { code: 'ADMIN_PORTAL_REQUIRED', adminLoginUrl: '/admin/login' }
      )
    )
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, userType: user.userType, role: user.role, clientId: user.clientId || '', isPrimaryAdmin: false },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const userSafe = { ...(user.toObject ? user.toObject() : user) }
  delete userSafe.password

  await recordLoginSession(user, req)

  // Determine role-based redirect
  const role = user.role || user.userType
  let redirectUrl = '/blog-posts'
  if (role === 'OwnerAdmin' || role === 'Client Admin' || role === 'Admin') {
    redirectUrl = '/blog-setup/client-admin'
  } else if (role === 'Content Writer' || role === 'Author') {
    redirectUrl = '/blog-posts'
  } else if (role === 'Editor') {
    redirectUrl = '/blog-posts'
  }

  return sendSuccess(res, { user: userSafe, token, redirectUrl }, 'Logged in successfully')
})

export const login = asyncHandler(async (req, res, next) => {
  // Backwards-compatible general login endpoint delegating according to verified credentials
  const { email, password } = req.body

  if (!password) {
    return next(new AppError('Please provide a password', 400))
  }

  const normalizedEmail = (email || '').trim().toLowerCase()
  let user
  if (isDbConnected()) {
    user = await User.findOne({ email: normalizedEmail }).select('+password')
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    user = store.users.find((item) => item.email?.toLowerCase() === normalizedEmail)
  }

  if (!user) {
    return next(new AppError('Invalid email or password credentials', 401))
  }

  if (user.status && user.status !== 'active') {
    return next(new AppError('This account is not active. Contact your administrator.', 403))
  }

  let isMatch = false
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(password, user.password)
  } else {
    isMatch = user.password === password
  }

  if (!isMatch) {
    return next(new AppError('Invalid email or password credentials', 401))
  }

  const isPrimary = Boolean(user.isPrimaryAdmin)
  const role = user.role || user.userType

  const token = jwt.sign(
    { id: user._id, email: user.email, userType: user.userType, role: user.role, clientId: user.clientId || '', isPrimaryAdmin: isPrimary },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const userSafe = { ...(user.toObject ? user.toObject() : user) }
  delete userSafe.password

  await recordLoginSession(user, req)

  let redirectUrl = '/blog-posts'
  if (isPrimary) {
    redirectUrl = '/dashboard'
  } else if (role === 'OwnerAdmin' || role === 'Client Admin' || role === 'Admin') {
    redirectUrl = '/blog-setup/client-admin'
  }
  return sendSuccess(res, { user: userSafe, token, redirectUrl }, 'Logged in successfully')
})

export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body
  if (!email) {
    return next(new AppError('Please provide an email address', 400))
  }

  const normalizedEmail = email.trim().toLowerCase()

  // 1. Strict Check: Check if user exists in database / registered users
  let userExists = false
  if (isDbConnected()) {
    const user = await User.findOne({ email: normalizedEmail })
    userExists = Boolean(user)
  } else {
    if (process.env.NODE_ENV === 'production') {
      return next(new AppError('Database service is unavailable', 503))
    }
    userExists = store.users.some((u) => u.email?.toLowerCase() === normalizedEmail)
  }

  if (!userExists) {
    return next(new AppError('No account found with this email address. Please register or verify the email.', 404))
  }

  const otp = generateOTP(6)
  const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes

  otpCache.set(normalizedEmail, { otp, expiresAt })

  // Send real email with OTP (only sent to recipient email, never exposed in response body)
  const mailResult = await sendPasswordResetOtpEmail({
    email: normalizedEmail,
    otp,
    expiresMinutes: 10,
  }).catch((err) => {
    console.error('Failed to send OTP email:', err)
    return { success: false, error: err.message }
  })

  if (!mailResult.success) {
    return next(
      new AppError(
        `Unable to dispatch password reset email: ${mailResult.error || 'SMTP delivery rejected'}. Please contact administrator.`,
        500
      )
    )
  }

  // Security: Do NOT return otp in the API response
  const message = mailResult.isSandbox
    ? `Password reset verification code generated in test mode (Ethereal sandbox).`
    : `Password reset verification code sent to ${normalizedEmail}`

  return sendSuccess(
    res,
    { email: normalizedEmail, expiresAt, previewUrl: mailResult?.previewUrl || null, isSandbox: Boolean(mailResult?.isSandbox) },
    message
  )
})

export const verifyOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body
  if (!email || !otp) {
    return next(new AppError('Please provide email and OTP', 400))
  }

  const cached = otpCache.get(email.toLowerCase())
  if (!cached) {
    return next(new AppError('No OTP request found for this email', 400))
  }

  if (Date.now() > cached.expiresAt) {
    otpCache.delete(email.toLowerCase())
    return next(new AppError('OTP has expired. Please request a new one.', 400))
  }

  if (cached.otp !== String(otp).trim()) {
    return next(new AppError('Invalid OTP code. Please try again.', 400))
  }

  return sendSuccess(res, { verified: true }, 'OTP verified successfully')
})

export const resetPassword = asyncHandler(async (req, res, next) => {
  const { email, otp, newPassword, password } = req.body
  const finalPassword = newPassword || password
  if (!email || !finalPassword) {
    return next(new AppError('Please provide email and new password', 400))
  }

  const cached = otpCache.get(email.toLowerCase())
  if (cached && cached.otp !== String(otp).trim()) {
    return next(new AppError('Invalid verification OTP code', 400))
  }

  let userObj = null
  if (isDbConnected()) {
    const user = await User.findOne({ email: email.toLowerCase() })
    if (user) {
      user.password = finalPassword
      await user.save()
      userObj = user
    }
  } else {
    const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (user) {
      user.password = await bcrypt.hash(finalPassword, 10)
      userObj = user
    }
  }

  otpCache.delete(email.toLowerCase())

  // Send confirmation email
  sendPasswordResetSuccessEmail({
    email: email.toLowerCase(),
    name: userObj?.name || '',
  }).catch((err) => console.error('Failed to send password reset confirmation email:', err.message))

  return sendSuccess(res, null, 'Password reset successfully. You can now login.')
})

export const getMe = asyncHandler(async (req, res) => {
  const userSafe = { ...(req.user.toObject ? req.user.toObject() : req.user) }
  delete userSafe.password
  return sendSuccess(res, userSafe, 'Current user profile')
})

export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, phone, country, bio, avatar, email } = req.body
  const userId = req.user._id

  const updateFields = {}
  if (name !== undefined) updateFields.name = name
  if (phone !== undefined) updateFields.phone = phone
  if (country !== undefined) updateFields.country = country
  if (bio !== undefined) updateFields.bio = bio
  if (avatar !== undefined) {
    updateFields.avatar = avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'
  }
  if (email !== undefined) updateFields.email = email

  if (isDbConnected()) {
    const updated = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    ).select('-password')
    const userSafe = updated ? (updated.toObject ? updated.toObject() : updated) : null
    if (userSafe) delete userSafe.password
    return sendSuccess(res, userSafe, 'Profile updated successfully')
  }

  const user = store.users.find((u) => String(u._id) === String(userId))
  if (user) {
    if (name !== undefined) user.name = name
    if (phone !== undefined) user.phone = phone
    if (country !== undefined) user.country = country
    if (bio !== undefined) user.bio = bio
    if (avatar !== undefined) {
      user.avatar = avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'
    }
    if (email !== undefined) user.email = email
  }
  const userSafe = user ? { ...user } : null
  if (userSafe) delete userSafe.password
  return sendSuccess(res, userSafe, 'Profile updated successfully')
})

export const changePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body
  const userId = req.user._id

  if (!currentPassword || !newPassword) {
    return next(new AppError('Please provide current password and new password', 400))
  }

  if (isDbConnected()) {
    const user = await User.findById(userId).select('+password')
    const isMatch = await user.matchPassword(currentPassword)
    if (!isMatch) {
      return next(new AppError('Incorrect current password', 400))
    }
    user.password = newPassword
    user.mustChangePassword = false
    await user.save()

    // Send security notification email
    const currentUA = req.headers['user-agent'] || ''
    const currentIp = getClientIp(req)
    const parsed = parseUserAgent(currentUA)
    sendPasswordChangedNotificationEmail({
      email: user.email || req.user.email,
      name: user.name || req.user.name,
      device: parsed.displayDevice,
      ip: currentIp,
      time: new Date(),
    }).catch((err) => console.error('Failed to send password changed notification email:', err.message))

    return sendSuccess(res, null, 'Password updated successfully')
  }

  const user = store.users.find((u) => String(u._id) === String(userId))
  if (user) {
    const isMatch = user.password.startsWith('$2')
      ? await bcrypt.compare(currentPassword, user.password)
      : user.password === currentPassword

    if (!isMatch) {
      return next(new AppError('Incorrect current password', 400))
    }
    user.password = await bcrypt.hash(newPassword, 10)
    user.mustChangePassword = false

    // Send security notification email
    const currentUA = req.headers['user-agent'] || ''
    const currentIp = getClientIp(req)
    const parsed = parseUserAgent(currentUA)
    sendPasswordChangedNotificationEmail({
      email: user.email || req.user.email,
      name: user.name || req.user.name,
      device: parsed.displayDevice,
      ip: currentIp,
      time: new Date(),
    }).catch((err) => console.error('Failed to send password changed notification email:', err.message))
  }

  return sendSuccess(res, null, 'Password updated successfully')
})

export const getActiveSessions = asyncHandler(async (req, res) => {
  const user = req.user
  if (!user) {
    return sendSuccess(res, [], 'Active user sessions')
  }

  const currentUA = req.headers['user-agent'] || ''
  const currentIp = getClientIp(req)
  const parsed = parseUserAgent(currentUA)
  const currentDevice = parsed.displayDevice

  let sessions = Array.isArray(user.activeSessions) ? [...user.activeSessions] : []

  // Filter out any stale dummy sessions
  sessions = sessions.filter((s) => s && s.id !== 'sess-mobile-1')

  // Find if there is an existing current session
  const currentIdx = sessions.findIndex((s) => s.isCurrent === true)

  if (currentIdx >= 0) {
    // Update current session with the actual device, IP, and activity
    sessions = sessions.map((s, idx) => {
      if (idx === currentIdx) {
        return {
          ...s,
          device: currentDevice,
          ip: currentIp,
          lastActive: 'Current Session',
          isCurrent: true,
        }
      }
      return {
        ...s,
        isCurrent: false,
      }
    })
  } else {
    // Create new current session at the front
    const newCurrent = {
      id: `sess-${Date.now()}`,
      device: currentDevice,
      ip: currentIp,
      location: user.country || 'Active Device',
      lastActive: 'Current Session',
      isCurrent: true,
    }
    sessions = [newCurrent, ...sessions.map((s) => ({ ...s, isCurrent: false }))]
  }

  // Keep max 5 sessions
  sessions = sessions.slice(0, 5)

  if (isDbConnected() && user._id) {
    await User.findByIdAndUpdate(user._id, { activeSessions: sessions })
  }
  req.user.activeSessions = sessions

  return sendSuccess(res, sessions, 'Active user sessions')
})

export const logoutAllOtherSessions = asyncHandler(async (req, res) => {
  let currentSessions = []
  if (req.user) {
    const currentUA = req.headers['user-agent'] || ''
    const currentIp = getClientIp(req)
    const parsed = parseUserAgent(currentUA)
    const currentDevice = parsed.displayDevice

    const currentSession = {
      id: `sess-${Date.now()}`,
      device: currentDevice,
      ip: currentIp,
      location: req.user.country || 'Active Device',
      lastActive: 'Current Session',
      isCurrent: true,
    }

    currentSessions = [currentSession]

    if (isDbConnected() && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, { activeSessions: currentSessions })
    }
    req.user.activeSessions = currentSessions
  }
  return sendSuccess(res, currentSessions, 'Logged out of all other devices successfully')
})

export const revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params
  let remaining = []
  if (req.user) {
    remaining = (req.user.activeSessions || []).filter((s) => s.id !== sessionId)
    if (isDbConnected() && req.user._id) {
      await User.findByIdAndUpdate(req.user._id, { activeSessions: remaining })
    }
    req.user.activeSessions = remaining
  }
  return sendSuccess(res, remaining, `Session ${sessionId} revoked successfully`)
})

export const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    const userAgent = req.headers['user-agent'] || ''
    // Filter out current device session from user's activeSessions
    if (req.user.activeSessions && req.user.activeSessions.length > 0) {
      const remainingSessions = req.user.activeSessions.filter((s) => !s.isCurrent)
      if (isDbConnected() && req.user._id) {
        await User.findByIdAndUpdate(req.user._id, { activeSessions: remainingSessions })
      }
      req.user.activeSessions = remainingSessions
    }
  }

  // Clear session or token cookies if present
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  res.clearCookie('cms_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })

  // Send cache control headers to prevent Safari / iOS back-forward cache (bfcache) leaks
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  return sendSuccess(res, null, 'Logged out successfully')
})
