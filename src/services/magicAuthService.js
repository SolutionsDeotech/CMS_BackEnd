import crypto from 'node:crypto'

/**
 * In-memory secure registry for single-use, 15-minute time-limited magic links.
 * SuperAdmin impersonation tokens expire automatically after 15 minutes and can only be consumed once.
 */
class MagicAuthService {
  constructor() {
    this.tokenStore = new Map()
    // Periodic garbage collection every 5 minutes for expired tokens
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000).unref()
  }

  /**
   * Generates a secure, 15-minute single-use magic login token for SuperAdmin access to a client's Admin panel.
   */
  createMagicLoginToken({ clientId, superAdminUser, ip = '', userAgent = '' }) {
    if (!clientId) {
      throw new Error('ClientId is required to generate an Admin magic link.')
    }

    const token = crypto.randomBytes(32).toString('hex')
    const ttlMs = 15 * 60 * 1000 // 15 minutes
    const now = Date.now()
    const expiresAt = now + ttlMs

    const record = {
      token,
      clientId,
      superAdminId: superAdminUser?._id ? String(superAdminUser._id) : (superAdminUser?.customId || 'superadmin'),
      superAdminEmail: superAdminUser?.email || 'admin@domain.com',
      superAdminName: superAdminUser?.name || 'SuperAdmin',
      ip,
      userAgent,
      createdAt: now,
      expiresAt,
      used: false,
      usedAt: null,
    }

    this.tokenStore.set(token, record)

    return {
      token,
      expiresAt,
      expiresIn: Math.floor(ttlMs / 1000), // 900 seconds
    }
  }

  /**
   * Consumes a single-use magic token.
   * Immediately invalidates the token once verified.
   */
  consumeMagicLoginToken(token) {
    if (!token || typeof token !== 'string') {
      return {
        valid: false,
        error: 'A valid magic link token is required.',
      }
    }

    const record = this.tokenStore.get(token)

    if (!record) {
      return {
        valid: false,
        error: 'Invalid or unrecognized magic link token. It may have expired or been revoked.',
      }
    }

    if (record.used) {
      return {
        valid: false,
        error: 'This magic link has already been consumed. For security, magic links are strictly single-use.',
      }
    }

    if (Date.now() > record.expiresAt) {
      this.tokenStore.delete(token)
      return {
        valid: false,
        error: 'This magic link has expired (15-minute time limit exceeded). Please generate a new link from the SuperAdmin dashboard.',
      }
    }

    // Mark as consumed immediately to prevent replay attacks
    record.used = true
    record.usedAt = Date.now()

    return {
      valid: true,
      payload: record,
    }
  }

  /**
   * Checks if a token is valid without consuming it (read-only verification).
   */
  peekToken(token) {
    if (!token) return null
    const record = this.tokenStore.get(token)
    if (!record || record.used || Date.now() > record.expiresAt) {
      return null
    }
    return {
      clientId: record.clientId,
      expiresAt: record.expiresAt,
      superAdminEmail: record.superAdminEmail,
    }
  }

  cleanupExpired() {
    const now = Date.now()
    for (const [token, record] of this.tokenStore.entries()) {
      if (record.used || now > record.expiresAt) {
        this.tokenStore.delete(token)
      }
    }
  }
}

export const magicAuthService = new MagicAuthService()
export default magicAuthService

