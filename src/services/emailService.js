import nodemailer from 'nodemailer'
import logger from '../utils/logger.js'

let transporter = null

/**
 * ============================================================================
 * IN-CODE SMTP CONFIGURATION
 * ============================================================================
 * If you do not want to set environment variables in Render, you can configure
 * your SMTP credentials directly here.
 *
 * 1. Set `enabled: true`
 * 2. Put your sending email in `auth.user`
 * 3. Put your 16-character Google App Password in `auth.pass`
 * ============================================================================
 */
export const SMTP_CONFIG = {
  enabled: true,
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for port 465 (SSL), false for 587 (STARTTLS)
  auth: {
    user: 'jainemitradeoli@gmail.com',
    pass: 'byhvgewvbmuajvvl',
  },
  from: '"Deotech CMS" <jainemitradeoli@gmail.com>',
}

export const IN_CODE_SMTP_CONFIG = SMTP_CONFIG

/**
 * Resolves authentication block:
 * 1. OAuth2 (clientId + refreshToken)
 * 2. Standard username/password (from process.env or in-code config)
 * 3. Unauthenticated / IP-based relay (auth omitted)
 */
export function buildAuthConfiguration(env = process.env) {
  // Only fall back to in-code config for the live application runtime (env === process.env)
  const inCode = (env === process.env && SMTP_CONFIG.enabled) ? SMTP_CONFIG : null

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
      user: SMTP_USER || inCode?.auth?.user || '',
      clientId: SMTP_OAUTH_CLIENT_ID,
      clientSecret: SMTP_OAUTH_CLIENT_SECRET || '',
      refreshToken: SMTP_OAUTH_REFRESH_TOKEN,
      ...(SMTP_OAUTH_ACCESS_TOKEN ? { accessToken: SMTP_OAUTH_ACCESS_TOKEN } : {}),
    }
  }

  // 2. Standard Username/Password (Environment variable takes precedence over in-code)
  const rawPass = SMTP_PASS || (inCode?.auth?.pass ? inCode.auth.pass : '')
  const pass = rawPass ? String(rawPass).replace(/\s+/g, '') : ''
  const user = (SMTP_USER || (inCode?.auth?.user ? inCode.auth.user : '')).trim()

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
  try {
    const client = await getTransporter()

    if (!client || !client.isConfigured) {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('[Email Service Diagnostic] ⚠️ SMTP is not configured in production. Outbound email sending will be rejected.')
        return { verified: false, error: 'SMTP_HOST not configured in production' }
      }
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
    const activePass = process.env.SMTP_PASS || (SMTP_CONFIG.enabled ? SMTP_CONFIG.auth?.pass : '') || '___'
    const sanitizedError = error.message.replace(new RegExp(activePass.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), '***')
    logger.error(`[Email Service Diagnostic] ❌ SMTP connection verification failed: ${sanitizedError} (code: ${error.code || 'UNKNOWN'})`)
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
 * Send an email using standard HTML formatting
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    const client = await getTransporter()

    if (!client || !client.isConfigured) {
      const errorMsg = process.env.NODE_ENV === 'production'
        ? 'SMTP is not configured in production environment (SMTP_HOST missing).'
        : 'SMTP transporter is not configured.'
      logger.error(`[Email Service] Cannot send email to ${to}: ${errorMsg}`)
      return {
        success: false,
        isProduction: process.env.NODE_ENV === 'production',
        isSandbox: false,
        error: errorMsg,
        errorCode: 'SMTP_NOT_CONFIGURED',
      }
    }

    const isRealSmtp = Boolean(client?.isProductionSmtp)
    const from =
      (SMTP_CONFIG.enabled && SMTP_CONFIG.from ? SMTP_CONFIG.from : null) ||
      (SMTP_CONFIG.enabled && SMTP_CONFIG.auth?.user ? `"Deotech CMS" <${SMTP_CONFIG.auth.user}>` : null) ||
      process.env.EMAIL_FROM ||
      (process.env.SMTP_USER ? `"Deotech CMS" <${process.env.SMTP_USER}>` : '"Deotech CMS" <jainemitradeoli@gmail.com>')

    const info = await client.sendMail({
      from,
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, ''),
      html,
    })

    const previewUrl = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null

    if (isRealSmtp) {
      logger.info(`[Email Service SUCCESS] Email delivered via real SMTP to ${to} (MessageId: ${info.messageId})`)
      return {
        success: true,
        isProduction: true,
        isSandbox: false,
        messageId: info.messageId,
      }
    }

    logger.warn(`[Email Service SANDBOX] Email to ${to} delivered to Ethereal sandbox. Real inbox was NOT reached. Preview: ${previewUrl}`)
    if (previewUrl) {
      console.log('----------------------------------------------------')
      console.log(`📬 [LIVE TEST INBOX URL]: ${previewUrl}`)
      console.log(`Open the link above in your browser to view the email sent to ${to}!`)
      console.log('----------------------------------------------------')
    }

    return {
      success: true,
      isProduction: false,
      isSandbox: true,
      messageId: info.messageId,
      previewUrl,
    }
  } catch (error) {
    const isTimeout = error.code === 'ETIMEDOUT' || error.message.toLowerCase().includes('timeout')
    const currentPort = transporter?.options?.port || 465
    const alternatePort = currentPort === 465 ? 587 : 465

    if (isTimeout && transporter?.isProductionSmtp && !transporter._hasRetriedAlternate) {
      logger.warn(`[Email Service] Connection timed out on port ${currentPort}. Retrying via fallback port ${alternatePort}...`)
      try {
        const fallbackConfig = {
          ...transporter.options,
          port: alternatePort,
          secure: alternatePort === 465,
          family: 4,
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000,
        }
        const fallbackClient = nodemailer.createTransport(fallbackConfig)
        fallbackClient._hasRetriedAlternate = true
        fallbackClient.isProductionSmtp = true
        fallbackClient.isConfigured = true

        const from =
          (SMTP_CONFIG.enabled && SMTP_CONFIG.from ? SMTP_CONFIG.from : null) ||
          (SMTP_CONFIG.enabled && SMTP_CONFIG.auth?.user ? `"Deotech CMS" <${SMTP_CONFIG.auth.user}>` : null) ||
          process.env.EMAIL_FROM ||
          (process.env.SMTP_USER ? `"Deotech CMS" <${process.env.SMTP_USER}>` : '"Deotech CMS" <jainemitradeoli@gmail.com>')

        const info = await fallbackClient.sendMail({
          from,
          to,
          subject,
          text: text || html?.replace(/<[^>]+>/g, ''),
          html,
        })

        transporter = fallbackClient
        logger.info(`[Email Service SUCCESS] Email delivered via fallback port ${alternatePort} to ${to} (MessageId: ${info.messageId})`)
        return {
          success: true,
          isProduction: true,
          isSandbox: false,
          messageId: info.messageId,
        }
      } catch (fallbackError) {
        logger.error(`[Email Service ERROR] Fallback port ${alternatePort} also failed: ${fallbackError.message}`)
      }
    }

    const activePass = process.env.SMTP_PASS || (SMTP_CONFIG.enabled ? SMTP_CONFIG.auth?.pass : '') || '___'
    const sanitizedError = error.message.replace(new RegExp(activePass.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), '***')
    logger.error(`[Email Service ERROR] SMTP rejected delivery to ${to}: ${sanitizedError} (code: ${error.code || 'UNKNOWN'})`)
    return {
      success: false,
      isProduction: Boolean(transporter?.isProductionSmtp),
      isSandbox: Boolean(transporter && !transporter.isProductionSmtp),
      error: sanitizedError,
      errorCode: error.code || 'SMTP_ERROR',
    }
  }
}

/**
 * Helper to safely extract the primary frontend URL from multi-origin FRONTEND_URL env
 */
export function getPrimaryFrontendUrl() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:5173'
  const first = raw.split(/[,;\s]+/)[0] || 'http://localhost:5173'
  return first.trim().replace(/\/+$/, '')
}

/**
 * 1. Writer Invitation Template
 */
export async function sendWriterInvitationEmail({ email, websiteName, domain, role, loginUrl, temporaryPassword }) {
  const subject = `You've been invited to join ${websiteName || 'the Editorial Team'} as a ${role}`
  const targetUrl = loginUrl || `${getPrimaryFrontendUrl()}/login`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Editorial Publishing Platform</p>
      </div>

      <div style="background-color: #fcf8f8; border-left: 4px solid #691717; padding: 16px; margin-bottom: 20px; border-radius: 4px;">
        <h2 style="margin: 0 0 8px 0; color: #111827; font-size: 18px;">Editorial Team Invitation</h2>
        <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
          You have been invited to collaborate on <strong>${websiteName || domain || 'our publication'}</strong> as a <strong>${role}</strong>.
        </p>
      </div>

      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        As a team member, you'll be able to draft articles, collaborate with editors, manage rich media, and publish high-quality content directly to the live blog.
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
        <a href="${targetUrl}" style="background-color: #691717; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">
          Accept Invitation &amp; Sign In
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        If you did not expect this invitation, you can safely ignore this email.<br />
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({ to: email, subject, html })
}

/**
 * 2. Newsletter Welcome Template
 */
export async function sendNewsletterWelcomeEmail({ email, websiteName = 'Deotech CMS' }) {
  const subject = `Welcome to the ${websiteName} Editorial Newsletter!`

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
        Zero spam guarantee. You can unsubscribe at any time with a single click.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        &copy; ${new Date().getFullYear()} Deotech Solutions. All rights reserved.
      </p>
    </div>
  `

  return sendEmail({ to: email, subject, html })
}

/**
 * 3. Password Reset OTP Template
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

  return sendEmail({ to: email, subject, html })
}

/**
 * 4. User Registration & Admin Welcome Template
 */
export async function sendWelcomeRegistrationEmail({ email, name, role = 'User', loginUrl }) {
  const subject = `Welcome to Deotech CMS, ${name || 'User'}!`
  const targetUrl = loginUrl || `${getPrimaryFrontendUrl()}/login`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #691717; margin: 0; font-size: 24px;">Deotech CMS</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Next-Gen Publishing Workspace</p>
      </div>

      <h2 style="color: #111827; font-size: 18px;">Welcome aboard, ${name}! 🎉</h2>
      <p style="color: #374151; font-size: 14px; line-height: 1.6;">
        Your account has been created successfully with the role of <strong>${role}</strong>.
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

  return sendEmail({ to: email, subject, html })
}
