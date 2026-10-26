import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess, generateOTP } from '../utils/helpers.js'
import store from '../services/store.js'
import User from '../models/User.js'
import { isDbConnected } from '../config/db.js'

// In-memory OTP cache for forgot password
const otpCache = new Map()

export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, userType, phone, country, bio, avatar } = req.body

  if (!email || !password || !name) {
    return next(new AppError('Please provide name, email, and password', 400))
  }

  // Check if user already exists
  let existingUser = null
  if (isDbConnected()) {
    existingUser = await User.findOne({ email: email.toLowerCase() })
  } else {
    existingUser = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
  }

  if (existingUser) {
    return next(new AppError('A user with that email already exists', 400))
  }

  const role = userType === 'Admin' ? 'Admin' : 'Content Writer'
  const permission = userType === 'Admin' ? 'Full Access' : 'Limited Access'

  let newUser
  if (isDbConnected()) {
    newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      userType: userType || 'Content Writer',
      role,
      permission,
      phone: phone || '',
      country: country || 'India',
      bio: bio || '',
      avatar: avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
    })
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    newUser = {
      _id: `usr-${Date.now()}`,
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      userType: userType || 'Content Writer',
      role,
      permission,
      phone: phone || '',
      country: country || 'India',
      bio: bio || '',
      avatar: avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
      status: 'active',
      clientId: 'cli-1',
      canViewComments: userType === 'Admin',
      canReplyComments: userType === 'Admin',
      activeSessions: [
        {
          id: `sess-${Date.now()}`,
          device: req.headers['user-agent']?.includes('Mac') ? 'Chrome on macOS' : 'Chrome on Windows',
          ip: req.ip || '127.0.0.1',
          location: 'Jaipur',
          lastActive: 'Just now',
          isCurrent: true,
        },
      ],
      createdAt: new Date().toISOString(),
    }
    store.users.unshift(newUser)
  }

  const token = jwt.sign(
    { id: newUser._id, email: newUser.email, userType: newUser.userType, role: newUser.role },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const userSafe = { ...newUser }
  delete userSafe.password

  return sendSuccess(res, { user: userSafe, token }, 'User registered successfully', 201)
})

export const login = asyncHandler(async (req, res, next) => {
  const { email, password, userType } = req.body

  if (!password) {
    return next(new AppError('Please provide a password', 400))
  }

  let user = null
  if (email) {
    if (isDbConnected()) {
      user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    } else {
      user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    }
  } else if (userType) {
    // If only userType and password provided from UI quick login
    const targetType = userType.toLowerCase()
    if (isDbConnected()) {
      user = await User.findOne({
        $or: [
          { userType: new RegExp(userType, 'i') },
          { role: new RegExp(userType, 'i') },
        ],
      }).select('+password')
    } else {
      user = store.users.find((u) => {
        const uType = (u.userType || '').toLowerCase()
        const uRole = (u.role || '').toLowerCase()
        return (
          uType === targetType ||
          uRole === targetType ||
          (targetType.includes('admin') && (uType.includes('admin') || uRole.includes('admin'))) ||
          (targetType.includes('writer') && (uType.includes('writer') || uRole.includes('writer')))
        )
      })
    }
  }

  if (!user) {
    return next(new AppError('Invalid email or password credentials', 401))
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

  // If user selected userType on UI, check compatibility
  if (userType && user.userType !== userType && user.role !== userType) {
    // Provide lenient fallback or accept
  }

  const token = jwt.sign(
    { id: user._id, email: user.email, userType: user.userType, role: user.role },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const userSafe = { ...(user.toObject ? user.toObject() : user) }
  delete userSafe.password

  return sendSuccess(res, { user: userSafe, token }, 'Logged in successfully')
})

export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body
  if (!email) {
    return next(new AppError('Please provide an email address', 400))
  }

  const otp = generateOTP(6)
  const expiresAt = Date.now() + 10 * 60 * 1000 // 10 minutes

  otpCache.set(email.toLowerCase(), { otp, expiresAt })

  return sendSuccess(
    res,
    { email, otp, expiresAt },
    `Password reset OTP sent to ${email} (OTP: ${otp})`
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
  const { email, otp, newPassword } = req.body
  if (!email || !newPassword) {
    return next(new AppError('Please provide email and new password', 400))
  }

  const cached = otpCache.get(email.toLowerCase())
  if (cached && cached.otp !== String(otp).trim()) {
    return next(new AppError('Invalid verification OTP code', 400))
  }

  if (isDbConnected()) {
    const user = await User.findOne({ email: email.toLowerCase() })
    if (user) {
      user.password = newPassword
      await user.save()
    }
  } else {
    const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (user) {
      user.password = await bcrypt.hash(newPassword, 10)
    }
  }

  otpCache.delete(email.toLowerCase())
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

  if (isDbConnected()) {
    const updated = await User.findByIdAndUpdate(
      userId,
      { name, phone, country, bio, avatar, email },
      { new: true, runValidators: true }
    )
    return sendSuccess(res, updated, 'Profile updated successfully')
  }

  const user = store.users.find((u) => String(u._id) === String(userId))
  if (user) {
    if (name) user.name = name
    if (phone) user.phone = phone
    if (country) user.country = country
    if (bio) user.bio = bio
    if (avatar) user.avatar = avatar
    if (email) user.email = email
  }
  return sendSuccess(res, user, 'Profile updated successfully')
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
    await user.save()
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
  }

  return sendSuccess(res, null, 'Password updated successfully')
})

export const getActiveSessions = asyncHandler(async (req, res) => {
  const sessions = req.user.activeSessions || [
    {
      id: 'sess-1',
      device: 'Chrome on macOS',
      ip: 'Jaipur - 10.0.0.1',
      location: 'Jaipur',
      lastActive: 'Current Session',
      isCurrent: true,
    },
    {
      id: 'sess-2',
      device: 'Safari on iPhone',
      ip: 'Jaipur - 192.168.1.1',
      location: 'Jaipur',
      lastActive: 'Last Active 2 Days Ago',
      isCurrent: false,
    },
  ]
  return sendSuccess(res, sessions, 'Active user sessions')
})

export const logoutAllOtherSessions = asyncHandler(async (req, res) => {
  if (req.user && req.user.activeSessions) {
    req.user.activeSessions = req.user.activeSessions.filter((s) => s.isCurrent)
  }
  return sendSuccess(res, null, 'Logged out of all other devices successfully')
})

export const revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params
  if (req.user && req.user.activeSessions) {
    req.user.activeSessions = req.user.activeSessions.filter((s) => s.id !== sessionId)
  }
  return sendSuccess(res, null, `Session ${sessionId} revoked successfully`)
})
