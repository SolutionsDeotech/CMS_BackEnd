import nodemailer from 'nodemailer'
import logger from '../utils/logger.js'

let transporter = null

async function getTransporter() {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT) || 587
  const secure = process.env.SMTP_SECURE === 'true'
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    })
    logger.info(`SMTP Mailer initialized using host: ${host}:${port}`)
  } else {
    // Generate an automatic free Ethereal test account so emails can be viewed in a real web inbox
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
      logger.info(`Ethereal Test Mailer initialized with test account: ${testAccount.user}`)
    } catch (err) {
      // Fallback to console logger if offline
      transporter = {
        sendMail: async (mailOptions) => {
          console.log('----------------------------------------------------')
          console.log(`📧 [EMAIL SENT TO]: ${mailOptions.to}`)
          console.log(`📌 [SUBJECT]: ${mailOptions.subject}`)
          console.log(`📝 [BODY PREVIEW]:\n${mailOptions.text || mailOptions.html?.substring(0, 300)}...`)
          console.log('----------------------------------------------------')
          return { messageId: `mock-email-${Date.now()}` }
        },
      }
    }
  }

  return transporter
}

/**
 * Send an email using standard HTML formatting
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    const client = await getTransporter()
    const from = process.env.EMAIL_FROM || '"Deotech CMS" <no-reply@deotechsolutions.com>'

    const info = await client.sendMail({
      from,
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, ''),
      html,
    })

    const previewUrl = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null

    logger.info(`Email successfully dispatched to ${to} (MessageId: ${info.messageId})`)
    if (previewUrl) {
      console.log('----------------------------------------------------')
      console.log(`📬 [LIVE TEST INBOX URL]: ${previewUrl}`)
      console.log(`Open the link above in your browser to view the email sent to ${to}!`)
      console.log('----------------------------------------------------')
    }

    return { success: true, messageId: info.messageId, previewUrl }
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * 1. Writer Invitation Template
 */
export async function sendWriterInvitationEmail({ email, websiteName, domain, role, loginUrl, temporaryPassword }) {
  const subject = `You've been invited to join ${websiteName || 'the Editorial Team'} as a ${role}`
  const targetUrl = loginUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`

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
  const targetUrl = loginUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`

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
