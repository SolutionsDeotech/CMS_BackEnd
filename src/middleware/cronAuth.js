import crypto from 'node:crypto'
import AppError from '../utils/AppError.js'

/**
 * Middleware to verify incoming internal cron requests using CRON_SECRET and X-Cron-Key.
 * Performs constant-time comparison using Node.js crypto.timingSafeEqual on SHA-256 digests.
 * Rejects requests if CRON_SECRET is missing or invalid.
 * Never logs or exposes the secret in responses or error messages.
 */
export function verifyCronSecret(req, res, next) {
  const configuredSecret = process.env.CRON_SECRET

  // Reject if CRON_SECRET environment variable is missing or empty
  if (!configuredSecret || typeof configuredSecret !== 'string' || configuredSecret.trim() === '') {
    return next(
      new AppError('Internal cron trigger is not configured or disabled.', 503, {
        code: 'CRON_NOT_CONFIGURED',
      })
    )
  }

  const providedKey = req.headers['x-cron-key']
  if (!providedKey || typeof providedKey !== 'string') {
    return next(
      new AppError('Unauthorized: Missing X-Cron-Key request header.', 401, {
        code: 'CRON_KEY_MISSING',
      })
    )
  }

  const configuredBuf = Buffer.from(configuredSecret, 'utf8')
  const providedBuf = Buffer.from(providedKey, 'utf8')

  // Hash both buffers with SHA-256 to guarantee equal 32-byte length for timingSafeEqual
  // and prevent timing leakage on string length differences
  const hashConfigured = crypto.createHash('sha256').update(configuredBuf).digest()
  const hashProvided = crypto.createHash('sha256').update(providedBuf).digest()

  const isValid = crypto.timingSafeEqual(hashConfigured, hashProvided) && configuredBuf.length === providedBuf.length
  if (!isValid) {
    return next(
      new AppError('Unauthorized: Invalid cron authentication key.', 401, {
        code: 'CRON_KEY_INVALID',
      })
    )
  }

  next()
}

export default verifyCronSecret

