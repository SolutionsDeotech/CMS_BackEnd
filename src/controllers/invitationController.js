import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { isDbConnected } from '../config/db.js'
import Invitation from '../models/Invitation.js'
import User from '../models/User.js'
import EmailLog from '../models/EmailLog.js'
import store from '../services/store.js'
import {
  sendTeamInvitationEmail,
  sendNewsletterCampaignEmail,
  getPrimaryFrontendUrl,
} from '../services/emailService.js'
import AppError from '../utils/AppError.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/helpers.js'
import Subscriber from '../models/Newsletter.js'

/**
 * 1. Verify an invitation token (Public endpoint)
 */
export const verifyInvitationToken = asyncHandler(async (req, res, next) => {
  const { token } = req.params
  if (!token) return next(new AppError('Invitation token is required', 400))

  let invitation = null

  if (isDbConnected()) {
    invitation = await Invitation.findOne({ token })
  } else {
    invitation = (store.invitations || []).find((inv) => inv.token === token)
  }

  if (!invitation) {
    return next(new AppError('Invitation link is invalid or has expired', 404))
  }

  if (invitation.status === 'accepted') {
    return next(new AppError('This invitation has already been accepted. Please log in directly.', 400))
  }

  if (invitation.status === 'revoked') {
    return next(new AppError('This invitation has been revoked by the workspace administrator.', 403))
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = 'expired'
    if (isDbConnected()) await invitation.save()
    return next(new AppError('This invitation link has expired. Please request a new invitation.', 410))
  }

  return sendSuccess(
    res,
    {
      valid: true,
      email: invitation.email,
      name: invitation.name || '',
      role: invitation.role,
      websiteName: invitation.websiteName || 'Deotech CMS Publication',
      invitedByName: invitation.invitedByName || '',
      expiresAt: invitation.expiresAt,
    },
    'Invitation verified successfully'
  )
})

/**
 * 2. Accept an invitation and set up user account (Public endpoint)
 */
export const acceptInvitation = asyncHandler(async (req, res, next) => {
  const { token } = req.params
  const { password, name } = req.body

  if (!token) return next(new AppError('Invitation token is required', 400))
  if (!password || password.length < 6) {
    return next(new AppError('Password must be at least 6 characters long', 400))
  }

  let invitation = null

  if (isDbConnected()) {
    invitation = await Invitation.findOne({ token })
  } else {
    invitation = (store.invitations || []).find((inv) => inv.token === token)
  }

  if (!invitation) {
    return next(new AppError('Invitation link is invalid or does not exist', 404))
  }

  if (invitation.status === 'accepted') {
    return next(new AppError('This invitation has already been accepted.', 400))
  }

  if (invitation.status === 'revoked') {
    return next(new AppError('This invitation has been revoked by the workspace administrator.', 403))
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    invitation.status = 'expired'
    if (isDbConnected()) await invitation.save()
    return next(new AppError('This invitation link has expired.', 410))
  }

  const effectiveName = (name || invitation.name || invitation.email.split('@')[0]).trim()
  const role = invitation.role || 'Content Writer'
  const isSuperAdminRole = role === 'Admin' || role === 'OwnerAdmin'
  const userType = isSuperAdminRole ? 'Admin' : 'User'
  const targetClientId = invitation.clientId || 'global'

  let user = null

  if (isDbConnected()) {
    user = await User.findOne({ email: invitation.email.toLowerCase() })
    if (user) {
      user.name = effectiveName
      user.password = password
      user.role = role
      user.userType = userType
      user.clientId = targetClientId
      user.status = 'active'
      user.mustChangePassword = false
      await user.save()
    } else {
      user = await User.create({
        name: effectiveName,
        email: invitation.email.toLowerCase(),
        password,
        role,
        userType,
        permission: isSuperAdminRole ? 'All Access' : 'Limited Access',
        clientId: targetClientId,
        status: 'active',
        mustChangePassword: false,
      })
    }

    invitation.status = 'accepted'
    invitation.acceptedAt = new Date()
    await invitation.save()
  } else {
    user = (store.users || []).find((u) => u.email?.toLowerCase() === invitation.email.toLowerCase())
    const hashedPassword = await bcrypt.hash(password, 10)

    if (user) {
      user.name = effectiveName
      user.password = hashedPassword
      user.role = role
      user.userType = userType
      user.clientId = targetClientId
      user.status = 'active'
    } else {
      user = {
        _id: `usr-${Date.now()}`,
        id: `usr-${Date.now()}`,
        name: effectiveName,
        email: invitation.email.toLowerCase(),
        password: hashedPassword,
        role,
        userType,
        permission: isSuperAdminRole ? 'All Access' : 'Limited Access',
        clientId: targetClientId,
        status: 'active',
      }
      store.users.unshift(user)
    }

    invitation.status = 'accepted'
    invitation.acceptedAt = new Date()
  }

  // Issue active session token
  const jwtToken = jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      userType: user.userType,
      role: user.role,
      clientId: user.clientId || '',
      isPrimaryAdmin: Boolean(user.isPrimaryAdmin),
    },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )

  const userSafe = { ...(user.toObject ? user.toObject() : user) }
  delete userSafe.password

  let redirectUrl = '/blog-posts'
  if (role === 'OwnerAdmin' || role === 'Client Admin' || role === 'Admin') {
    redirectUrl = '/blog-setup/client-admin'
  }

  return sendSuccess(
    res,
    {
      user: userSafe,
      token: jwtToken,
      redirectUrl,
    },
    'Invitation accepted successfully! Welcome to your workspace.',
    200
  )
})

/**
 * 3. List invitations for workspace (Protected endpoint)
 */
export const getInvitations = asyncHandler(async (req, res) => {
  const { clientId } = req.query
  const filterClientId = clientId || req.user?.clientId

  if (isDbConnected()) {
    const query = filterClientId && filterClientId !== 'global' ? { clientId: filterClientId } : {}
    const list = await Invitation.find(query).sort({ createdAt: -1 })
    return sendSuccess(res, list, 'Invitations retrieved successfully')
  }

  let list = store.invitations || []
  if (filterClientId && filterClientId !== 'global') {
    list = list.filter((inv) => inv.clientId === filterClientId)
  }
  return sendSuccess(res, list, 'Invitations retrieved successfully')
})

/**
 * 4. Create and dispatch new invitation (Protected endpoint)
 */
export const createInvitation = asyncHandler(async (req, res, next) => {
  const { email, role = 'Content Writer', name, websiteName, clientId } = req.body
  if (!email) return next(new AppError('Please provide an email address', 400))

  const normalizedEmail = email.trim().toLowerCase()
  const targetClientId = clientId || req.user?.clientId || 'global'
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const inviteUrl = `${getPrimaryFrontendUrl()}/accept-invitation?token=${token}`

  // Check if invitation already pending
  let existing = null
  if (isDbConnected()) {
    existing = await Invitation.findOne({ email: normalizedEmail, status: 'pending' })
  } else {
    existing = (store.invitations || []).find((inv) => inv.email === normalizedEmail && inv.status === 'pending')
  }

  if (existing) {
    return next(new AppError('A pending invitation has already been dispatched to this email address.', 409))
  }

  // Requirement B: Send email via Brevo. If delivery fails, do not create record or report false success!
  const mailResult = await sendTeamInvitationEmail({
    email: normalizedEmail,
    name: name || normalizedEmail.split('@')[0],
    role,
    websiteName: websiteName || 'Deotech CMS Publication',
    inviteUrl,
    inviterName: req.user?.name || 'Administrator',
    expiresInDays: 7,
  })

  if (!mailResult.success) {
    return next(
      new AppError(
        `Failed to deliver invitation email: ${mailResult.error || 'Email service rejected delivery'}. Invitation was not created.`,
        500
      )
    )
  }

  const invitationData = {
    email: normalizedEmail,
    name: name || '',
    role,
    clientId: targetClientId,
    websiteName: websiteName || 'Deotech CMS Publication',
    token,
    status: 'pending',
    invitedBy: req.user?._id || null,
    invitedByEmail: req.user?.email || '',
    invitedByName: req.user?.name || '',
    expiresAt,
    deliveryStatus: mailResult.isSandbox ? 'sandbox' : 'delivered',
    messageId: mailResult.messageId || '',
  }

  let createdInvitation = null
  if (isDbConnected()) {
    createdInvitation = await Invitation.create(invitationData)
  } else {
    createdInvitation = {
      _id: `inv-${Date.now()}`,
      id: `inv-${Date.now()}`,
      ...invitationData,
      createdAt: new Date().toISOString(),
    }
    store.invitations = store.invitations || []
    store.invitations.unshift(createdInvitation)
  }

  return sendSuccess(res, createdInvitation, 'Invitation dispatched successfully to recipient email', 201)
})

/**
 * 5. Resend invitation (Protected endpoint)
 */
export const resendInvitation = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  let invitation = null

  if (isDbConnected()) {
    invitation = await Invitation.findById(id)
  } else {
    invitation = (store.invitations || []).find((inv) => inv._id === id || inv.id === id)
  }

  if (!invitation) return next(new AppError('Invitation not found', 404))

  // Refresh expiration & token
  invitation.token = crypto.randomBytes(32).toString('hex')
  invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  invitation.status = 'pending'

  const inviteUrl = `${getPrimaryFrontendUrl()}/accept-invitation?token=${invitation.token}`

  const mailResult = await sendTeamInvitationEmail({
    email: invitation.email,
    name: invitation.name || invitation.email.split('@')[0],
    role: invitation.role,
    websiteName: invitation.websiteName,
    inviteUrl,
    inviterName: req.user?.name || 'Administrator',
    expiresInDays: 7,
  })

  if (!mailResult.success) {
    return next(new AppError(`Failed to resend invitation email: ${mailResult.error || 'Delivery failed'}`, 500))
  }

  invitation.deliveryStatus = mailResult.isSandbox ? 'sandbox' : 'delivered'
  invitation.messageId = mailResult.messageId || ''

  if (isDbConnected()) {
    await invitation.save()
  }

  return sendSuccess(res, invitation, 'Invitation link renewed and resent successfully')
})

/**
 * 6. Revoke invitation (Protected endpoint)
 */
export const revokeInvitation = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  let invitation = null

  if (isDbConnected()) {
    invitation = await Invitation.findById(id)
  } else {
    invitation = (store.invitations || []).find((inv) => inv._id === id || inv.id === id)
  }

  if (!invitation) return next(new AppError('Invitation not found', 404))

  invitation.status = 'revoked'
  if (isDbConnected()) {
    await invitation.save()
  }

  return sendSuccess(res, null, 'Invitation revoked successfully')
})

/**
 * 7. Broadcast newsletter campaign to active subscribers (Protected endpoint)
 */
export const sendNewsletterCampaign = asyncHandler(async (req, res, next) => {
  const { subject, headline, bodyContent, postUrl, clientId } = req.body
  if (!subject || !headline) {
    return next(new AppError('Please provide both subject and headline for the campaign', 400))
  }

  const targetClientId = clientId || req.user?.clientId || 'global'
  let subscribers = []

  if (isDbConnected()) {
    const filter = targetClientId && targetClientId !== 'global' ? { clientId: targetClientId, status: 'active' } : { status: 'active' }
    subscribers = await Subscriber.find(filter)
  } else {
    subscribers = (store.subscribers || []).filter((s) => s.status === 'active')
  }

  if (subscribers.length === 0) {
    return next(new AppError('No active newsletter subscribers found to dispatch campaign to.', 400))
  }

  const results = { total: subscribers.length, delivered: 0, failed: 0, errors: [] }

  for (const sub of subscribers) {
    try {
      const resMail = await sendNewsletterCampaignEmail({
        email: sub.email,
        websiteName: 'Deotech CMS',
        subject,
        headline,
        bodyContent,
        postUrl,
      })

      if (resMail.success) {
        results.delivered++
      } else {
        results.failed++
        results.errors.push({ email: sub.email, error: resMail.error })
      }
    } catch (err) {
      results.failed++
      results.errors.push({ email: sub.email, error: err.message })
    }
  }

  return sendSuccess(res, results, `Campaign dispatched to ${results.delivered} of ${results.total} subscribers`)
})

/**
 * 8. Retrieve safe email activity logs (Protected endpoint)
 */
export const getEmailLogs = asyncHandler(async (req, res) => {
  const { limit = 50, recipient, status } = req.query
  const numLimit = Math.min(Number(limit) || 50, 100)

  if (isDbConnected()) {
    const query = {}
    if (recipient) query.recipient = recipient.toLowerCase().trim()
    if (status) query.status = status
    const logs = await EmailLog.find(query).sort({ createdAt: -1 }).limit(numLimit)
    return sendSuccess(res, logs, 'Email activity logs retrieved successfully')
  }

  let logs = store.emailLogs || []
  if (recipient) {
    logs = logs.filter((l) => l.recipient.includes(recipient.toLowerCase().trim()))
  }
  if (status) {
    logs = logs.filter((l) => l.status === status)
  }
  return sendSuccess(res, logs.slice(0, numLimit), 'Email activity logs retrieved successfully')
})
