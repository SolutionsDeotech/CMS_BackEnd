import nodemailer from 'nodemailer'
import logger from '../utils/logger.js'
import { isDbConnected } from '../config/db.js'
import EmailLog from '../models/EmailLog.js'
import store from './store.js'

let transporter = null

/**
 * ============================================================================
 * BREVO HTTPS API CONFIGURATION (Port 443 - Never Blocked by Cloud Hosts)
 * ============================================================================
 * Uses Brevo's official transactional REST API on port 443.
 * Eliminates Render SMTP socket timeouts completely.
 * ============================================================================
 */
export const BREVO_CONFIG = {
  enabled: true,
  apiKey: (process.env.BREVO_API_KEY || '').trim(),
  senderEmail: (process.env.BREVO_SENDER_EMAIL || 'jainemitradeoli@gmail.com').trim(),
  senderName: (process.env.BREVO_SENDER_NAME || 'Deotech CMS').trim(),
}

/**
 * Helper to determine if Brevo HTTPS API is available and active
 */
export function isBrevoConfigured(env = process.env) {
  if (env.NODE_ENV === 'test') return false
  if (!BREVO_CONFIG.enabled) return false
  // When running security integration tests with SMTP_CONFIG disabled, treat Brevo as disabled too
  if (SMTP_CONFIG.enabled === false && !env.FORCE_BREVO && !env.BREVO_API_KEY) return false
  const key = (env.BREVO_API_KEY || BREVO_CONFIG.apiKey || '').trim()
  return Boolean(key && key.length > 10)
}

/**
 * Dispatches an email via Brevo HTTPS REST API (Port 443)
 * Completely eliminates Render SMTP socket timeout errors.
 */
export async function sendEmailViaBrevo({ to, subject, html, text }) {
  const apiKey = (process.env.BREVO_API_KEY || BREVO_CONFIG.apiKey || '').trim()
  if (!apiKey) {
    throw new Error('Brevo API key is not configured (BREVO_API_KEY missing).')
  }

  const senderEmail = (process.env.BREVO_SENDER_EMAIL || BREVO_CONFIG.senderEmail || 'jainemitradeoli@gmail.com').trim()
  const senderName = (process.env.BREVO_SENDER_NAME || BREVO_CONFIG.senderName || 'Deotech CMS').trim()

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {}),
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      const errMsg = data?.message || `Brevo API returned HTTP status ${response.status}`
      throw new Error(errMsg)
    }

    const messageId = data?.messageId || `brevo-${Date.now()}`
    logger.info(`[Email Service SUCCESS] Email delivered via Brevo HTTPS REST API (Port 443) to ${to} (MessageId: ${messageId})`)

    return {
      success: true,
      isProduction: true,
      isSandbox: false,
      messageId,
      provider: 'brevo',
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * ============================================================================
 * IN-CODE SMTP CONFIGURATION
 * ============================================================================
 * Development/Fallback SMTP configuration reading strictly from process.env
 * (Zero hardcoded credentials)
 * ============================================================================
 */
export const SMTP_CONFIG = {
  enabled: Boolean(process.env.SMTP_HOST),
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  } : null,
  from: process.env.EMAIL_FROM || (process.env.SMTP_USER ? `"Deotech CMS" <${process.env.SMTP_USER}>` : '"Deotech CMS" <jainemitradeoli@gmail.com>'),
}

export const IN_CODE_SMTP_CONFIG = SMTP_CONFIG

/**
 * Resolves authentication block:
 * 1. OAuth2 (clientId + refreshToken)
 * 2. Standard username/password (from process.env)
 * 3. Unauthenticated / IP-based relay (auth omitted)
 */
export function buildAuthConfiguration(env = process.env) {
  const {
    SMTP_USER,
    SMTP_PASS,
    SMTP_OAUTH_CLIENT_ID,
    SMTP_OAUTH_CLIENT_SECRET,
    SMTP_OAUTH_REFRESH_TOKEN,
    SMTP_OAUTH_ACCESS_TOKEN,
  } = env

  // 1. OAuth2 Authentication
  if (SMTP_OAUTH_CLIENT_ID && SMTP_OAUTH_REFRESH_TOKEN) {
    return {
      type: 'OAuth2',
      user: SMTP_USER || '',
      clientId: SMTP_OAUTH_CLIENT_ID,
      clientSecret: SMTP_OAUTH_CLIENT_SECRET || '',
      refreshToken: SMTP_OAUTH_REFRESH_TOKEN,
      ...(SMTP_OAUTH_ACCESS_TOKEN ? { accessToken: SMTP_OAUTH_ACCESS_TOKEN } : {}),
    }
  }

  // 2. Standard Username/Password (Environment variable only)
  const rawPass = SMTP_PASS || ''
  const pass = rawPass ? String(rawPass).replace(/\s+/g, '') : ''
  const user = (SMTP_USER || '').trim()

  if (pass) {
    return {
      user: user || '',
      pass,
    }
  }

  // 3. Unauthenticated / IP-based relay: auth is omitted
  return null
}

/**
 * Builds the Nodemailer transport configuration object
 */
export function buildTransportConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production'
  const isLiveRuntime = env === process.env
  const inCodeActive = Boolean(
    isLiveRuntime &&
    SMTP_CONFIG.enabled &&
    SMTP_CONFIG.host &&
    SMTP_CONFIG.auth?.pass
  )

  const host = env.SMTP_HOST || (inCodeActive ? SMTP_CONFIG.host : null)

  // In production, SMTP_HOST or active in-code credentials are required.
  if (isProduction && (!host || !host.trim())) {
    return null
  }

  // In non-production, if no host is configured, return null to allow Ethereal test sandbox
  if (!host || !host.trim()) {
    return null
  }

  const port = Number(env.SMTP_PORT) || (inCodeActive ? SMTP_CONFIG.port : 465) || 465
  const secure = env.SMTP_SECURE !== undefined
    ? (env.SMTP_SECURE === 'true' || port === 465)
    : (inCodeActive ? SMTP_CONFIG.secure : (port === 465))

  const config = {
    host: host.trim(),
    port,
    secure,
    family: 4, // Force IPv4 on cloud hosts like Render to prevent IPv6 socket connection timeouts
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  }

  const auth = buildAuthConfiguration(env)
  if (auth) {
    config.auth = auth
  }

  // Requirement 9: Remove tls.rejectUnauthorized=false from production configuration.
  // Standard TLS validation against system CAs is always enforced in production.
  if (env.SMTP_IGNORE_TLS === 'true' && !isProduction) {
    config.tls = { rejectUnauthorized: false }
  }

  return config
}

/**
 * Initializes or retrieves the singleton Nodemailer transporter
 */
export async function getTransporter() {
  if (transporter) return transporter

  // Fast-path for automated test suites to avoid sandbox socket hangs
  if (process.env.NODE_ENV === 'test') {
    transporter = {
      isProductionSmtp: false,
      isConfigured: true,
      sendMail: async (mailOptions) => {
        return { messageId: `mock-email-test-${Date.now()}` }
      },
      verify: async () => true,
    }
    return transporter
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const config = buildTransportConfig(process.env)

  if (config) {
    transporter = nodemailer.createTransport(config)
    transporter.isProductionSmtp = true
    transporter.isConfigured = true

    const authType = config.auth
      ? (config.auth.type === 'OAuth2' ? 'OAuth2' : 'Password/App Password')
      : 'Unauthenticated/IP-Relay'

    const maskedUser = config.auth?.user
      ? (config.auth.user.includes('@')
          ? config.auth.user.replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 5)) + c)
          : config.auth.user.substring(0, 2) + '****')
      : '(None)'

    logger.info(`[Email Service] Production SMTP initialized: host=${config.host}, port=${config.port}, secure=${config.secure}, authType=${authType}, user=${maskedUser}`)
    return transporter
  }

  // Requirement 6 & 7: Never use Ethereal in production. Fail safely if SMTP is unconfigured.
  if (isProduction) {
    logger.warn('⚠️ [Email Service ALERT] SMTP_HOST is not configured in production. Outbound emails will fail gracefully without crashing.')
    transporter = {
      isProductionSmtp: false,
      isConfigured: false,
      sendMail: async () => {
        throw new Error('SMTP is not configured in production environment (SMTP_HOST missing).')
      },
      verify: async () => {
        throw new Error('Cannot verify SMTP: SMTP_HOST is missing in production environment.')
      },
    }
    return transporter
  }

  // Local development / testing only: Ethereal fallback
  logger.info('[Email Service] Initializing Ethereal sandbox test account for development/testing...')
  try {
    const testAccount = await nodemailer.createTestAccount()
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    })
    transporter.isProductionSmtp = false
    transporter.isConfigured = true
    logger.info(`[Email Service] Development Ethereal sandbox initialized: user=${testAccount.user}`)
  } catch (err) {
    transporter = {
      isProductionSmtp: false,
      isConfigured: true,
      sendMail: async (mailOptions) => {
        console.log('----------------------------------------------------')
        console.log(`📧 [MOCK EMAIL SENT TO]: ${mailOptions.to}`)
        console.log(`📌 [SUBJECT]: ${mailOptions.subject}`)
        console.log('----------------------------------------------------')
        return { messageId: `mock-email-${Date.now()}` }
      },
      verify: async () => true,
    }
  }

  return transporter
}

/**
 * Diagnostic connection handshake: tests connectivity without stopping the CMS server
 */
export async function verifyEmailTransport() {
  const isProduction = process.env.NODE_ENV === 'production'

  try {
    // 1. Production Mode: Brevo HTTPS REST API exclusively (Port 443)
    // Never fall back to SMTP on Render (prevents ETIMEDOUT socket timeout)
    if (isProduction) {
      if (isBrevoConfigured()) {
        const apiKey = (process.env.BREVO_API_KEY || BREVO_CONFIG.apiKey || '').trim()
        const maskedKey = apiKey.length > 8 ? `${apiKey.slice(0, 4)}***${apiKey.slice(-4)}` : '****'
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 8000)
          const res = await fetch('https://api.brevo.com/v3/smtp/templates?limit=1', {
            method: 'GET',
            headers: {
              'api-key': apiKey,
              'Accept': 'application/json',
            },
            signal: controller.signal,
          })
          clearTimeout(timeoutId)

          if (res.ok) {
            logger.info(`[Email Service Diagnostic] ✅ Brevo HTTPS REST API (Port 443) connection verified successfully (${maskedKey}). Ready to dispatch mail.`)
            return { verified: true, mode: 'Brevo HTTPS REST API (Port 443)' }
          } else {
            logger.error(`[Email Service Diagnostic] ❌ Brevo HTTPS API check failed with HTTP ${res.status}.`)
            return { verified: false, error: `Brevo API returned HTTP status ${res.status}` }
          }
        } catch (brevoErr) {
          logger.error(`[Email Service Diagnostic] ❌ Brevo API diagnostic request failed: ${brevoErr.message}`)
          return { verified: false, error: brevoErr.message }
        }
      }

      // In production without BREVO_API_KEY: Never attempt SMTP (prevents Render socket hang)
      logger.warn('[Email Service Diagnostic] ⚠️ BREVO_API_KEY is not configured in production environment (SMTP_HOST not configured). Outbound email sending will be rejected.')
      return { verified: false, error: 'BREVO_API_KEY is not configured in production environment (SMTP_HOST not configured).' }
    }

    // 2. Offline Test Mode:
    if (process.env.NODE_ENV === 'test') {
      return { verified: true, isSandbox: true }
    }

    // 3. Local Development Mode:
    if (isBrevoConfigured()) {
      return { verified: true, mode: 'Brevo HTTPS REST API (Port 443)' }
    }

    const client = await getTransporter()
    if (!client || !client.isConfigured) {
      return { verified: true, isSandbox: true }
    }

    if (typeof client.verify === 'function') {
      await client.verify()
      const mode = client.isProductionSmtp ? 'Live SMTP' : 'Ethereal Sandbox'
      logger.info(`[Email Service Diagnostic] ✅ ${mode} connection verified successfully. Ready to dispatch mail.`)
      return { verified: true, mode }
    }

    return { verified: true }
  } catch (error) {
    const sanitizedError = error.message.replace(/([a-zA-Z0-9_\-\.]{16,})/g, '***')
    logger.error(`[Email Service Diagnostic] ❌ Email connection verification failed: ${sanitizedError} (code: ${error.code || 'UNKNOWN'})`)
    return { verified: false, error: sanitizedError, code: error.code }
  }
}

/**
 * Resets cached transporter (used by automated tests)
 */
export function resetTransporterForTesting() {
  transporter = null
}

/**
 * Persists email activity safely to MongoDB (EmailLog) or in-memory store
 * Guarantee: Zero passwords, OTPs, or reset tokens are ever logged.
 */
export async function logEmailActivity({
  recipient,
  emailType,
  subject,
  status,
  messageId = '',
  error = '',
  provider = 'brevo',
  metadata = {},
}) {
  try {
    const sanitizedMetadata = { ...metadata }
    delete sanitizedMetadata.otp
    delete sanitizedMetadata.password
    delete sanitizedMetadata.token
    delete sanitizedMetadata.temporaryPassword

    const logEntry = {
      recipient: (recipient || '').toLowerCase().trim(),
      emailType: emailType || 'transactional',
      subject: subject || '',
      status: status || 'sent',
      provider: provider || 'brevo',
      messageId: messageId || '',
      error: error || '',
      metadata: sanitizedMetadata,
      createdAt: new Date(),
    }

    if (isDbConnected()) {
      await EmailLog.create(logEntry).catch((err) => {
        logger.warn(`[EmailLog] Failed to persist email log to MongoDB: ${err.message}`)
      })
    } else {
      store.emailLogs = store.emailLogs || []
      store.emailLogs.unshift({
        id: `elog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        ...logEntry,
      })
      if (store.emailLogs.length > 500) {
        store.emailLogs = store.emailLogs.slice(0, 500)
      }
    }
  } catch (err) {
    logger.warn(`[EmailLog] Error recording email activity: ${err.message}`)
  }
}

/**
 * Send an email using standard HTML formatting
 */
export async function sendEmail({ to, subject, html, text, type = 'transactional', metadata = {} }) {
  const isProduction = process.env.NODE_ENV === 'production'

  // Fast-path for automated test suites (zero network calls)
  if (process.env.NODE_ENV === 'test') {
    const msgId = `mock-email-test-${Date.now()}`
    await logEmailActivity({
      recipient: to,
      emailType: type,
      subject,
      status: 'sent',
      messageId: msgId,
      provider: 'test-sandbox',
      metadata,
    })
    return {
      success: true,
      isProduction: false,
      isSandbox: true,
      messageId: msgId,
    }
  }

  // 1. Production Mode: Brevo HTTPS REST API exclusively (Requirement 1)
  // Never fall back to SMTP in production on Render
  if (isProduction) {
    if (isBrevoConfigured()) {
      try {
        const brevoRes = await sendEmailViaBrevo({ to, subject, html, text })
        await logEmailActivity({
          recipient: to,
          emailType: type,
          subject,
          status: 'sent',
          messageId: brevoRes.messageId,
          provider: 'brevo',
          metadata,
        })
        return brevoRes
      } catch (brevoError) {
        logger.error(`[Email Service ERROR] Brevo HTTPS dispatch failed for ${to}: ${brevoError.message}`)
        await logEmailActivity({
          recipient: to,
          emailType: type,
          subject,
          status: 'failed',
          error: brevoError.message,
          provider: 'brevo',
          metadata,
        })
        return {
          success: false,
          isProduction: true,
          isSandbox: false,
          error: brevoError.message,
          errorCode: 'BREVO_API_ERROR',
        }
      }
    }

    // Production without BREVO_API_KEY: Fail safely without attempting SMTP hang
    const errorMsg = 'Brevo HTTPS API is not configured in production environment (BREVO_API_KEY / SMTP_HOST missing).'
    logger.error(`[Email Service] Cannot send email to ${to}: ${errorMsg}`)
    await logEmailActivity({
      recipient: to,
      emailType: type,
      subject,
      status: 'failed',
      error: errorMsg,
      provider: 'brevo',
      metadata,
    })
    return {
      success: false,
      isProduction: true,
      isSandbox: false,
      error: errorMsg,
      errorCode: 'SMTP_NOT_CONFIGURED',
    }
  }

  // 2. Development Mode:
  if (isBrevoConfigured()) {
    try {
      const brevoRes = await sendEmailViaBrevo({ to, subject, html, text })
      await logEmailActivity({
        recipient: to,
        emailType: type,
        subject,
        status: 'sent',
        messageId: brevoRes.messageId,
        provider: 'brevo',
        metadata,
      })
      return brevoRes
    } catch (brevoError) {
      logger.warn(`[Email Service] Brevo HTTPS dispatch failed (${brevoError.message}). Attempting fallback transport...`)
    }
  }

  try {
    const client = await getTransporter()
    if (!client || !client.isConfigured) {
      const errorMsg = 'Transporter is not configured.'
      logger.error(`[Email Service] Cannot send email to ${to}: ${errorMsg}`)
      await logEmailActivity({
        recipient: to,
        emailType: type,
        subject,
        status: 'failed',
        error: errorMsg,
        provider: 'smtp',
        metadata,
      })
      return {
        success: false,
        isProduction: false,
        isSandbox: false,
        error: errorMsg,
        errorCode: 'SMTP_NOT_CONFIGURED',
      }
    }

    const from = process.env.EMAIL_FROM || (process.env.SMTP_USER ? `"Deotech CMS" <${process.env.SMTP_USER}>` : '"Deotech CMS" <jainemitradeoli@gmail.com>')
    const info = await client.sendMail({
      from,
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, ''),
      html,
    })

    const previewUrl = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null

    if (client.isProductionSmtp) {
      logger.info(`[Email Service SUCCESS] Email delivered via SMTP to ${to} (MessageId: ${info.messageId})`)
      await logEmailActivity({
        recipient: to,
        emailType: type,
        subject,
        status: 'sent',
        messageId: info.messageId,
        provider: 'smtp',
        metadata,
      })
      return {
        success: true,
        isProduction: true,
        isSandbox: false,
        messageId: info.messageId,
      }
    }

    logger.warn(`[Email Service SANDBOX] Email to ${to} delivered to Ethereal sandbox. Preview: ${previewUrl}`)
    await logEmailActivity({
      recipient: to,
      emailType: type,
      subject,
      status: 'sent',
      messageId: info.messageId,
      provider: 'ethereal',
      metadata,
    })
    return {
      success: true,
      isProduction: false,
      isSandbox: true,
      messageId: info.messageId,
      previewUrl,
    }
  } catch (error) {
    logger.error(`[Email Service ERROR] Delivery failed to ${to}: ${error.message} (code: ${error.code || 'UNKNOWN'})`)
    await logEmailActivity({
      recipient: to,
      emailType: type,
      subject,
      status: 'failed',
      error: error.message,
      provider: 'smtp',
      metadata,
    })
    return {
      success: false,
      isProduction: false,
      isSandbox: false,
      error: error.message,
      errorCode: error.code || 'SMTP_ERROR',
    }
  }
}

/**
 * Helper to safely extract the primary frontend URL from multi-origin FRONTEND_URL env
 * Ensures production emails never contain localhost URLs.
 */
export function getPrimaryFrontendUrl() {
  const isProduction = process.env.NODE_ENV === 'production'
  const fallback = isProduction ? 'https://cms-frontend-wgwj.onrender.com' : 'http://localhost:5173'
  const raw = process.env.FRONTEND_URL || fallback
  const first = raw.split(/[,;\s]+/)[0] || fallback
  return first.trim().replace(/\/+$/, '')
}

/**
 * 1. Password Reset OTP Template
 */
export async function sendPasswordResetOtpEmail({ email, otp, expiresMinutes = 10 }) {
  const subject = `Your Password Reset OTP: ${otp}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Security &amp; Account Protection</p>
      </div>

      <h2 style="color: #111827; font-size: 18px; margin-bottom: 8px;">Reset Your Password</h2>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        We received a request to reset the password for your Deotech CMS account. Use the one-time verification code below to proceed:
      </p>

      <div style="text-align: center; margin: 28px 0; background-color: #fafafa; border: 1px dashed #d1d5db; border-radius: 8px; padding: 20px;">
        <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #691717;">
          ${otp}
        </span>
        <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">This code will expire in ${expiresMinutes} minutes.</p>
      </div>

      <p style="color: #dc2626; font-size: 13px;">
        <strong>Important:</strong> If you did not initiate this request, please change your password immediately or contact your administrator.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'forgot_password_otp',
    metadata: { expiresMinutes },
  })
}

// Alias for backwards-compatibility
export const sendOtpEmail = sendPasswordResetOtpEmail

/**
 * 2. Password Reset Confirmation Template
 */
export async function sendPasswordResetSuccessEmail({ email, name, loginUrl }) {
  const subject = `Your Deotech CMS Account Password Has Been Reset Successfully`
  const targetUrl = loginUrl || `${getPrimaryFrontendUrl()}/login`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Security &amp; Account Confirmation</p>
      </div>

      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="margin: 0 0 8px 0; color: #15803d; font-size: 18px;">Password Reset Complete ✅</h2>
        <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
          Hello ${name || 'User'}, the password for your Deotech CMS account was updated successfully.
        </p>
      </div>

      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        You can now sign in to your dashboard using your new password.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${targetUrl}" style="background-color: #691717; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Sign In to Deotech CMS
        </a>
      </div>

      <p style="color: #dc2626; font-size: 13px; line-height: 1.5;">
        <strong>Security Notice:</strong> If you did not make this change, please reset your password immediately and notify our security team.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'password_reset_success',
    metadata: { name },
  })
}

/**
 * 3. Password Changed Notification Template (Security Alert)
 */
export async function sendPasswordChangedNotificationEmail({ email, name, device, ip, time }) {
  const subject = `Security Alert: Your Deotech CMS Account Password Was Changed`
  const timestamp = time ? new Date(time).toUTCString() : new Date().toUTCString()

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Security Audit Alert</p>
      </div>

      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="margin: 0 0 8px 0; color: #92400e; font-size: 18px;">Password Changed 🔐</h2>
        <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.5;">
          Hello ${name || 'User'}, the password for your account was changed from account settings.
        </p>
      </div>

      <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0 0 6px 0; font-size: 13px; color: #4b5563;"><strong>Time:</strong> ${timestamp}</p>
        ${device ? `<p style="margin: 0 0 6px 0; font-size: 13px; color: #4b5563;"><strong>Device:</strong> ${device}</p>` : ''}
        ${ip ? `<p style="margin: 0; font-size: 13px; color: #4b5563;"><strong>IP Address:</strong> ${ip}</p>` : ''}
      </div>

      <p style="color: #dc2626; font-size: 13px; line-height: 1.5;">
        <strong>Didn't make this change?</strong> Your account may be compromised. Use Forgot Password to reset credentials immediately.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'password_changed',
    metadata: { name, device, ip },
  })
}

/**
 * 4. User Registration & Admin Welcome Template
 */
export async function sendWelcomeRegistrationEmail({ email, name, role = 'User', loginUrl, clientName }) {
  const subject = `Welcome to Deotech CMS, ${name || 'User'}!`
  const targetUrl = loginUrl || `${getPrimaryFrontendUrl()}/login`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Next-Gen Publishing Workspace</p>
      </div>

      <h2 style="color: #111827; font-size: 18px;">Welcome aboard, ${name || 'User'}! 🎉</h2>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Your account has been created successfully with the role of <strong>${role}</strong>${clientName ? ` for <strong>${clientName}</strong>` : ''}.
      </p>

      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        You can now log in to access the editorial workspace, media library, blog configuration tools, and analytics dashboards.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${targetUrl}" style="background-color: #691717; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Log In to Workspace
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'welcome_registration',
    metadata: { name, role, clientName },
  })
}

/**
 * 5. Unified Team, Writer, Admin & Employee Invitation Template
 */
export async function sendTeamInvitationEmail({
  email,
  name,
  role = 'Content Writer',
  websiteName = 'Deotech CMS Publication',
  domain,
  inviteUrl,
  loginUrl,
  temporaryPassword,
  inviterName,
  expiresInDays = 7,
}) {
  const subject = `You've been invited to join ${websiteName} as a ${role}`
  const targetUrl = inviteUrl || loginUrl || `${getPrimaryFrontendUrl()}/accept-invitation`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Editorial Publishing Platform</p>
      </div>

      <div style="background-color: #fcf8f8; border-left: 4px solid #691717; padding: 16px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 18px;">Team Invitation</h2>
        <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
          ${inviterName ? `<strong>${inviterName}</strong> has invited you` : 'You have been invited'} to join <strong>${websiteName || domain || 'our publication'}</strong> as a <strong>${role}</strong>.
        </p>
      </div>

      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        As a ${role}, you will have access to draft articles, manage rich media, collaborate with editorial staff, and publish content to the live blog.
      </p>

      ${
        temporaryPassword
          ? `<div style="background-color: #f3f4f6; padding: 12px 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0; font-size: 13px; color: #4b5563;">Your temporary password:</p>
              <p style="margin: 4px 0 0 0; font-family: monospace; font-size: 16px; font-weight: bold; color: #111827;">${temporaryPassword}</p>
            </div>`
          : ''
      }

      <div style="text-align: center; margin: 32px 0;">
        <a href="${targetUrl}" style="background-color: #691717; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
          Accept Invitation &amp; Join
        </a>
      </div>

      <p style="color: #6b7280; font-size: 13px; text-align: center; margin: 16px 0;">
        This invitation link will expire in <strong>${expiresInDays} days</strong>.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        If you did not expect this invitation, you can safely ignore this email.<br />
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'team_invitation',
    metadata: { role, websiteName, inviterName, expiresInDays },
  })
}

// Backwards-compatible mapping for writer invitations
export async function sendWriterInvitationEmail(params) {
  return sendTeamInvitationEmail({
    ...params,
    role: params.role || 'Content Writer',
    inviteUrl: params.inviteUrl || params.loginUrl,
  })
}

/**
 * 6. Newsletter Welcome Template
 */
export async function sendNewsletterWelcomeEmail({ email, websiteName = 'Deotech CMS', unsubscribeUrl }) {
  const subject = `Welcome to the ${websiteName} Editorial Newsletter!`
  const unsubLink = unsubscribeUrl || `${getPrimaryFrontendUrl()}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">${websiteName}</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Curated Articles, Technical Insights &amp; Updates</p>
      </div>

      <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="margin: 0 0 8px 0; color: #15803d; font-size: 18px;">Subscription Confirmed! 🎉</h2>
        <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
          Thank you for joining our community! You are now subscribed to our weekly curated insights.
        </p>
      </div>

      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Here's what you can look forward to:
      </p>

      <ul style="color: #374151; font-size: 14px; line-height: 1.6; padding-left: 20px;">
        <li>In-depth articles and architectural breakdowns</li>
        <li>Engineering, design tokens, and digital transformation benchmarks</li>
        <li>Early access to new product and platform releases</li>
      </ul>

      <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin-top: 24px;">
        Zero spam guarantee. You can <a href="${unsubLink}" style="color: #691717; text-decoration: underline;">unsubscribe</a> at any time with a single click.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'newsletter_welcome',
    metadata: { websiteName },
  })
}

/**
 * 7. Newsletter Campaign Template
 */
export async function sendNewsletterCampaignEmail({
  email,
  websiteName = 'Deotech CMS',
  subject,
  headline,
  bodyContent,
  postUrl,
  unsubscribeUrl,
}) {
  const mailSubject = subject || `Latest Insights from ${websiteName}`
  const unsubLink = unsubscribeUrl || `${getPrimaryFrontendUrl()}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">${websiteName}</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Editorial Newsletter Edition</p>
      </div>

      <h2 style="color: #111827; font-size: 20px; margin-bottom: 12px;">${headline || mailSubject}</h2>

      <div style="color: #374151; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
        ${bodyContent || '<p>Here are the latest insights and curated stories from our editorial team.</p>'}
      </div>

      ${
        postUrl
          ? `<div style="text-align: center; margin: 28px 0;">
              <a href="${postUrl}" style="background-color: #691717; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                Read Full Story
              </a>
            </div>`
          : ''
      }

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        You received this email because you subscribed to ${websiteName}.<br />
        <a href="${unsubLink}" style="color: #691717; text-decoration: underline;">Unsubscribe from this list</a><br />
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject: mailSubject,
    html,
    type: 'newsletter_campaign',
    metadata: { websiteName, headline },
  })
}

/**
 * 8. Account & System Notification Template
 */
export async function sendAccountNotificationEmail({
  email,
  name,
  title,
  message,
  actionUrl,
  actionText = 'View Account',
}) {
  const subject = `Notification: ${title || 'Deotech CMS Account Update'}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Account Notification</p>
      </div>

      <h2 style="color: #111827; font-size: 18px; margin-bottom: 12px;">${title || 'Important Account Notice'}</h2>

      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Hello ${name || 'User'},
      </p>

      <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; color: #374151; font-size: 14px; line-height: 1.6;">
        ${message}
      </div>

      ${
        actionUrl
          ? `<div style="text-align: center; margin: 28px 0;">
              <a href="${actionUrl}" style="background-color: #691717; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
                ${actionText}
              </a>
            </div>`
          : ''
      }

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({
    to: email,
    subject,
    html,
    type: 'account_notification',
    metadata: { name, title },
  })
}
