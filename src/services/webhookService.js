import crypto from 'node:crypto'
import Client from '../models/Client.js'
import WebhookDeliveryLog from '../models/WebhookDeliveryLog.js'
import { isDbConnected } from '../config/db.js'
import store from './store.js'

export const DEFAULT_MAX_ATTEMPTS = 5
export const DEFAULT_LEASE_DURATION_MS = 30000 // 30 seconds
export const DEFAULT_DISPATCH_TIMEOUT_MS = 7000 // 7 seconds

/**
 * Calculates exponential backoff with random jitter.
 * Respects Retry-After header if supplied (seconds or HTTP-date).
 */
export function calculateNextRetry(attemptNumber, retryAfterHeader = null) {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds) && seconds > 0) {
      const capped = Math.min(Math.max(seconds, 5), 7200) // between 5s and 2h
      return new Date(Date.now() + capped * 1000)
    }
    const httpDate = new Date(retryAfterHeader)
    if (!isNaN(httpDate.getTime()) && httpDate.getTime() > Date.now()) {
      const diffSec = Math.min(Math.max(Math.floor((httpDate.getTime() - Date.now()) / 1000), 5), 7200)
      return new Date(Date.now() + diffSec * 1000)
    }
  }

  // Base backoff delays in seconds
  const delays = [30, 120, 600, 3600, 7200]
  const base = delays[Math.min(attemptNumber - 1, delays.length - 1)] || 30
  // Jitter: +/- 15% to prevent thundering herd
  const jitter = Math.floor(Math.random() * (base * 0.3)) - Math.floor(base * 0.15)
  const delaySec = Math.max(5, base + jitter)
  return new Date(Date.now() + delaySec * 1000)
}

/**
 * Retrieves the client's webhook secret, or generates and stores a secure tenant-specific secret.
 * NEVER returns a shared default secret.
 */
export async function getTenantWebhookSecret(client, clientId) {
  const configured = client?.integrationSettings?.webhookSecret || client?.webhookSecret
  if (configured && typeof configured === 'string' && configured.trim()) {
    return configured.trim()
  }

  // Generate a dedicated, cryptographically strong secret for this tenant
  const generated = `whsec_${crypto.randomBytes(24).toString('hex')}`
  try {
    if (isDbConnected() && client?._id) {
      await Client.findByIdAndUpdate(client._id, {
        $set: { 'integrationSettings.webhookSecret': generated },
      })
    } else if (client) {
      if (!client.integrationSettings) client.integrationSettings = {}
      client.integrationSettings.webhookSecret = generated
    }
  } catch {
    // Non-fatal fallback
  }

  return generated
}

/**
 * Sanitizes payload for safe storage and logging.
 * Strips sensitive credentials, tokens, or private secrets, and caps size.
 */
export function sanitizeWebhookPayload(payload) {
  if (!payload || typeof payload !== 'object') return {}
  const sanitized = { ...payload }
  const sensitiveKeys = ['password', 'secret', 'token', 'authorization', 'apiKey', 'cookie', 'session', 'otp']
  for (const k of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
      delete sanitized[k]
    }
  }
  // Enforce max stringified payload size (64KB)
  const str = JSON.stringify(sanitized)
  if (str.length > 65536) {
    return { summary: 'Payload truncated due to excessive size', data: str.slice(0, 1000) }
  }
  return sanitized
}

/**
 * Resolves client model or memory store client.
 */
async function resolveClient(clientId, session = null) {
  if (!clientId) return null
  if (isDbConnected()) {
    const query = Client.findOne({
      $or: [{ customId: clientId }, { websiteUrl: clientId }],
    }).lean()
    if (session) query.session(session)
    return await query
  }
  return store.clients?.find(
    (c) => c.customId === clientId || c.id === clientId || c.websiteUrl === clientId
  ) || null
}

/**
 * Atomically claims a delivery with a unique lease token.
 * Single unified atomic claim mechanism used by immediate dispatch,
 * background retry daemon workers, and manual retries.
 */
export async function claimDeliveryLease(
  deliveryIdentifier,
  workerId = 'worker-main',
  options = {}
) {
  const now = new Date()
  const leaseDurationMs = options.leaseDurationMs || DEFAULT_LEASE_DURATION_MS
  const leaseToken = crypto.randomUUID()

  const idCondition =
    deliveryIdentifier && typeof deliveryIdentifier === 'object'
      ? { _id: deliveryIdentifier._id || deliveryIdentifier.id }
      : String(deliveryIdentifier).match(/^[0-9a-fA-F]{24}$/)
      ? { $or: [{ _id: deliveryIdentifier }, { deliveryId: deliveryIdentifier }] }
      : { deliveryId: String(deliveryIdentifier) }

  // Eligible states:
  // - Automatic workers / immediate dispatch: pending and due OR processing with expired lease
  // - Manual retry (allowNonProcessing: true): non-processing (failed/delivered) OR processing with expired lease
  const statusCondition = options.allowNonProcessing
    ? [
        { status: { $ne: 'processing' } },
        { leaseExpiresAt: { $lte: now } },
      ]
    : [
        { status: 'pending', nextRetryAt: { $lte: now } },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ]

  const claimFilter = {
    ...idCondition,
    $or: statusCondition,
  }

  if (options.clientId) {
    claimFilter.clientId = options.clientId
  }

  const claimUpdate = {
    $set: {
      status: 'processing',
      lockedAt: now,
      lockedBy: workerId,
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + leaseDurationMs),
      updatedAt: now,
    },
  }

  if (isDbConnected()) {
    const claimed = await WebhookDeliveryLog.findOneAndUpdate(claimFilter, claimUpdate, { new: true })
    if (!claimed) {
      return { claimed: false, delivery: null, leaseToken: null, reason: 'Race lost or not eligible for claim' }
    }
    return { claimed: true, delivery: claimed, leaseToken }
  } else if (process.env.NODE_ENV === 'test' && store.webhookDeliveries) {
    const rawId = typeof deliveryIdentifier === 'object' ? deliveryIdentifier.deliveryId || deliveryIdentifier._id : deliveryIdentifier
    const idx = store.webhookDeliveries.findIndex((d) => {
      const matchId = d.deliveryId === rawId || String(d._id) === String(rawId)
      if (!matchId) return false
      if (options.clientId && d.clientId !== options.clientId) return false

      if (options.allowNonProcessing) {
        const notProcessing = d.status !== 'processing'
        const expired = d.status === 'processing' && (!d.leaseExpiresAt || new Date(d.leaseExpiresAt).getTime() <= now.getTime())
        return notProcessing || expired
      } else {
        const isPendingDue = d.status === 'pending' && (!d.nextRetryAt || new Date(d.nextRetryAt).getTime() <= now.getTime())
        const isExpiredProcessing = d.status === 'processing' && (!d.leaseExpiresAt || new Date(d.leaseExpiresAt).getTime() <= now.getTime())
        return isPendingDue || isExpiredProcessing
      }
    })

    if (idx === -1) {
      return { claimed: false, delivery: null, leaseToken: null, reason: 'Race lost or not eligible for claim' }
    }

    store.webhookDeliveries[idx] = {
      ...store.webhookDeliveries[idx],
      status: 'processing',
      lockedAt: now.toISOString(),
      lockedBy: workerId,
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
      updatedAt: now.toISOString(),
    }
    return { claimed: true, delivery: store.webhookDeliveries[idx], leaseToken }
  }

  return { claimed: false, delivery: null, leaseToken: null, reason: 'Database unavailable' }
}

/**
 * Atomically claims and immediately executes a newly staged outbox delivery.
 * Enforces worker fencing so immediate dispatch cannot collide with background daemon claims.
 */
export async function dispatchImmediateOutboxDelivery(delivery, secret = null, workerId = 'dispatcher-immediate') {
  if (!delivery) return { dispatched: false, reason: 'No delivery provided' }
  const deliveryId = delivery.deliveryId || delivery._id
  const claimResult = await claimDeliveryLease(deliveryId, workerId)
  if (!claimResult.claimed) {
    return {
      dispatched: false,
      claimed: false,
      fenced: true,
      reason: claimResult.reason || 'Failed to acquire atomic lease for immediate dispatch',
    }
  }

  const effectiveSecret = secret || (await getTenantWebhookSecret(null, claimResult.delivery.clientId))
  return await executeDeliveryAttempt(claimResult.delivery, effectiveSecret, workerId, claimResult.leaseToken)
}

/**
 * Executes a single delivery attempt for a WebhookDeliveryLog record.
 * Handles timeouts, network errors, 4xx, 5xx, and backoff scheduling.
 * Fenced with unique leaseToken to prevent stale worker overwrites.
 */
export async function executeDeliveryAttempt(delivery, secret, workerId = 'worker-main', leaseToken = null) {
  let effectiveLeaseToken = leaseToken || delivery?.leaseToken || null
  let activeDelivery = delivery

  if (!effectiveLeaseToken && delivery?.deliveryId) {
    const claimResult = await claimDeliveryLease(delivery.deliveryId, workerId)
    if (!claimResult.claimed) {
      return {
        deliveryId: delivery.deliveryId,
        dispatched: false,
        fenced: true,
        status: 'fenced',
        error: 'LeaseAcquisitionFailed',
        message: 'Could not acquire active worker lease for delivery attempt.',
      }
    }
    effectiveLeaseToken = claimResult.leaseToken
    activeDelivery = claimResult.delivery
  } else if (!effectiveLeaseToken) {
    return {
      deliveryId: delivery?.deliveryId,
      dispatched: false,
      fenced: true,
      status: 'fenced',
      error: 'UnleasedExecutionForbidden',
      message: 'Cannot execute delivery attempt without an active worker lease token.',
    }
  }

  const startTime = Date.now()
  const timestamp = Math.floor(Date.now() / 1000)
  const attemptNum = (activeDelivery.attemptCount || 0) + 1

  const bodyData = {
    event: delivery.event,
    deliveryId: delivery.deliveryId,
    timestamp,
    clientId: delivery.clientId,
    attempt: attemptNum,
    data: delivery.payload,
  }

  const bodyString = JSON.stringify(bodyData)
  const signature = crypto.createHmac('sha256', secret).update(bodyString).digest('hex')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_DISPATCH_TIMEOUT_MS)

  let outcome = {
    status: 'pending',
    httpStatus: null,
    errorMessage: null,
    responseBody: null,
    latencyMs: 0,
    attemptCount: attemptNum,
    nextRetryAt: null,
    completedAt: null,
    lockedAt: null,
    lockedBy: null,
    leaseToken: null,
    leaseExpiresAt: null,
  }

  try {
    const response = await fetch(delivery.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Deotech-CMS-Webhook/2.0 (+https://deotechsolutions.com)',
        'X-Deotech-Event': delivery.event,
        'X-Deotech-Delivery': delivery.deliveryId,
        'X-Deotech-Timestamp': String(timestamp),
        'X-Deotech-Attempt': String(attemptNum),
        'X-Deotech-Signature': `sha256=${signature}`,
      },
      body: bodyString,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime
    outcome.latencyMs = latencyMs
    outcome.httpStatus = response.status

    let rawBody = ''
    try {
      rawBody = await response.text()
      outcome.responseBody = rawBody.slice(0, 1000)
    } catch {
      outcome.responseBody = ''
    }

    if (response.ok) {
      // 1. HTTP 2xx: Delivered successfully
      outcome.status = 'delivered'
      outcome.completedAt = new Date()
      outcome.errorMessage = null
    } else if ([400, 401, 403, 404, 405, 410, 422].includes(response.status)) {
      // 2. Permanent Client Error: Do NOT repeatedly retry invalid endpoints or auth errors
      outcome.status = 'failed'
      outcome.completedAt = new Date()
      outcome.errorMessage = `Permanent client error HTTP ${response.status}. Delivery halted.`
    } else {
      // 3. Retryable HTTP Error (408, 429, 500, 502, 503, 504)
      if (attemptNum >= delivery.maxAttempts) {
        outcome.status = 'failed'
        outcome.completedAt = new Date()
        outcome.errorMessage = `Retry exhausted after ${attemptNum} attempts (HTTP ${response.status}).`
      } else {
        outcome.status = 'pending'
        const retryAfter = response.headers?.get ? response.headers.get('retry-after') : null
        outcome.nextRetryAt = calculateNextRetry(attemptNum, retryAfter)
        outcome.errorMessage = `HTTP ${response.status} returned. Scheduled for retry attempt ${attemptNum + 1}.`
      }
    }
  } catch (err) {
    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startTime
    outcome.latencyMs = latencyMs
    outcome.httpStatus = 0

    const isTimeout = err.name === 'AbortError'
    const errorText = isTimeout
      ? `Webhook delivery timed out after ${DEFAULT_DISPATCH_TIMEOUT_MS / 1000}s`
      : `Network error: ${err.message}`

    if (attemptNum >= delivery.maxAttempts) {
      outcome.status = 'failed'
      outcome.completedAt = new Date()
      outcome.errorMessage = `Retry exhausted after ${attemptNum} attempts (${errorText}).`
    } else {
      outcome.status = 'pending'
      outcome.nextRetryAt = calculateNextRetry(attemptNum)
      outcome.errorMessage = `${errorText}. Scheduled for retry attempt ${attemptNum + 1}.`
    }
  }

  // Update persistent record with fencing token check
  const now = new Date()
  let fenced = false
  const updatePayload = {
    ...outcome,
    lockedAt: null,
    lockedBy: null,
    leaseToken: null,
    leaseExpiresAt: null,
  }

  if (isDbConnected() && delivery._id) {
    const filter = {
      _id: delivery._id,
      leaseToken: effectiveLeaseToken,
      status: 'processing',
      leaseExpiresAt: { $gte: now },
    }
    const updated = await WebhookDeliveryLog.findOneAndUpdate(filter, { $set: updatePayload }, { new: true })
    if (!updated) {
      fenced = true
    }
  } else if (process.env.NODE_ENV === 'test') {
    // Memory store fallback only for isolated test runs
    store.webhookDeliveries = store.webhookDeliveries || []
    const idx = store.webhookDeliveries.findIndex((d) => {
      const matchId = d.deliveryId === delivery.deliveryId || (delivery._id && String(d._id) === String(delivery._id))
      if (!matchId) return false
      if (d.leaseToken !== effectiveLeaseToken) return false
      if (d.status !== 'processing') return false
      if (d.leaseExpiresAt && new Date(d.leaseExpiresAt).getTime() < now.getTime()) return false
      return true
    })
    if (idx !== -1) {
      store.webhookDeliveries[idx] = {
        ...store.webhookDeliveries[idx],
        ...updatePayload,
        updatedAt: new Date().toISOString(),
      }
    } else {
      fenced = true
    }
  } else {
    fenced = true
  }

  return {
    deliveryId: delivery.deliveryId,
    dispatched: outcome.status === 'delivered' && !fenced,
    status: fenced ? 'fenced' : outcome.status,
    fenced,
    statusCode: outcome.httpStatus,
    latencyMs: outcome.latencyMs,
    attemptCount: attemptNum,
    errorMessage: fenced ? 'Stale worker lease expired before completion; fenced to prevent overwrite' : outcome.errorMessage,
    nextRetryAt: outcome.nextRetryAt,
  }
}

/**
 * Dispatches an asynchronous webhook notification.
 * 1. Checks duplicate event window.
 * 2. Persists the delivery record BEFORE attempting delivery.
 * 3. Immediately executes the first delivery attempt.
 * 4. Schedules exponential retry if needed.
 */
export async function dispatchWebhook(clientId, event, payload = {}, options = {}) {
  if (!clientId) return { dispatched: false, reason: 'No clientId provided' }

  // In production, strictly require database connectivity
  const isTestOffline = process.env.NODE_ENV === 'test' && !isDbConnected()
  if (!isDbConnected() && !isTestOffline) {
    return { dispatched: false, reason: 'Database service is unavailable' }
  }

  try {
    const client = await resolveClient(clientId)
    const webhookUrl = client?.integrationSettings?.webhookUrl || client?.webhookUrl || ''

    if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
      return { dispatched: false, reason: 'No valid webhook URL configured for client' }
    }

    const secret = await getTenantWebhookSecret(client, clientId)
    const sanitizedPayload = sanitizeWebhookPayload(payload)
    const postId = payload?.id || payload?.customId || null
    const eventIdentity = options.eventIdentity || `${clientId}:${event}:${postId || 'generic'}:${payload?.updatedAt || Date.now()}`

    // Deduplication: prevent duplicate webhook creation if identical event was created in the last 15s
    if (options.eventIdentity) {
      if (isDbConnected()) {
        const existing = await WebhookDeliveryLog.findOne({
          eventIdentity,
          createdAt: { $gte: new Date(Date.now() - 15000) },
        }).lean()
        if (existing) {
          return { dispatched: existing.status === 'delivered', deliveryId: existing.deliveryId, deduplicated: true }
        }
      } else if (isTestOffline && store.webhookDeliveries) {
        const existing = store.webhookDeliveries.find(
          (d) => d.eventIdentity === eventIdentity && Date.now() - new Date(d.createdAt).getTime() < 15000
        )
        if (existing) {
          return { dispatched: existing.status === 'delivered', deliveryId: existing.deliveryId, deduplicated: true }
        }
      }
    }

    const deliveryId = crypto.randomUUID()
    const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS
    const leaseToken = crypto.randomUUID()

    const initialRecord = {
      deliveryId,
      clientId,
      event,
      postId,
      eventIdentity,
      targetUrl: webhookUrl,
      payload: sanitizedPayload,
      attemptCount: 0,
      maxAttempts,
      status: 'processing',
      nextRetryAt: new Date(),
      lockedAt: new Date(),
      lockedBy: 'dispatcher-init',
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + DEFAULT_LEASE_DURATION_MS),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    let persistedDelivery = null
    if (isDbConnected()) {
      persistedDelivery = await WebhookDeliveryLog.create(initialRecord)
    } else if (isTestOffline) {
      store.webhookDeliveries = store.webhookDeliveries || []
      store.webhookDeliveries.unshift(initialRecord)
      persistedDelivery = initialRecord
    } else {
      return { dispatched: false, reason: 'Database service is unavailable' }
    }

    // Execute first delivery attempt with leaseToken
    return await executeDeliveryAttempt(persistedDelivery, secret, 'dispatcher-init', leaseToken)
  } catch (err) {
    return {
      dispatched: false,
      error: err.message,
    }
  }
}

/**
 * Worker Processor: Claims and executes pending webhook retries with lease locks.
 * Recovers expired leases from crashed workers automatically.
 */
export async function processPendingWebhookRetries(batchSize = 10, workerId = `worker-${process.pid}`) {
  const isTestOffline = process.env.NODE_ENV === 'test' && !isDbConnected()
  if (!isDbConnected() && !isTestOffline) {
    return { processedCount: 0, reason: 'Database service is unavailable' }
  }

  const now = new Date()
  let processedCount = 0
  let successfulCount = 0
  let failedCount = 0
  let retriedCount = 0

  if (isDbConnected()) {
    // 1. Find candidates due for retry OR whose processing lease has expired
    const candidates = await WebhookDeliveryLog.find({
      $or: [
        { status: 'pending', nextRetryAt: { $lte: now } },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    })
      .sort({ nextRetryAt: 1 })
      .limit(batchSize)
      .lean()

    for (const candidate of candidates) {
      // 2. Atomically claim lease with unique leaseToken via unified claimDeliveryLease
      const claimResult = await claimDeliveryLease(candidate.deliveryId, workerId)
      if (!claimResult.claimed) continue // Lost atomic race to another worker (e.g. immediate dispatcher or peer node)

      processedCount++
      const claimed = claimResult.delivery
      const client = await resolveClient(claimed.clientId)
      const secret = await getTenantWebhookSecret(client, claimed.clientId)
      const result = await executeDeliveryAttempt(claimed, secret, workerId, claimResult.leaseToken)

      if (result.status === 'delivered') successfulCount++
      else if (result.status === 'failed') failedCount++
      else if (!result.fenced) retriedCount++
    }
  } else if (isTestOffline && store.webhookDeliveries) {
    // Memory store fallback for test isolation
    const due = store.webhookDeliveries.filter(
      (d) =>
        (d.status === 'pending' && (!d.nextRetryAt || new Date(d.nextRetryAt).getTime() <= now.getTime())) ||
        (d.status === 'processing' && (!d.leaseExpiresAt || new Date(d.leaseExpiresAt).getTime() <= now.getTime()))
    ).slice(0, batchSize)

    for (const item of due) {
      const claimResult = await claimDeliveryLease(item.deliveryId, workerId)
      if (!claimResult.claimed) continue

      processedCount++
      const claimed = claimResult.delivery
      const client = await resolveClient(claimed.clientId)
      const secret = await getTenantWebhookSecret(client, claimed.clientId)
      const result = await executeDeliveryAttempt(claimed, secret, workerId, claimResult.leaseToken)

      if (result.status === 'delivered') successfulCount++
      else if (result.status === 'failed') failedCount++
      else if (!result.fenced) retriedCount++
    }
  }

  return { processedCount, successfulCount, failedCount, retriedCount }
}

/**
 * Manually retries a webhook delivery for a tenant.
 */
export async function retryWebhookDelivery(deliveryId, clientId, workerId = 'manual-retry') {
  if (!deliveryId || !clientId) {
    return { success: false, error: 'invalid_params', message: 'deliveryId and clientId are required' }
  }

  const isTestOffline = process.env.NODE_ENV === 'test' && !isDbConnected()
  if (!isDbConnected() && !isTestOffline) {
    return { success: false, error: 'db_unavailable', message: 'Database service is unavailable' }
  }

  let deliveryDoc = null
  const now = new Date()

  if (isDbConnected()) {
    deliveryDoc = await WebhookDeliveryLog.findOne({ deliveryId, clientId })
  } else if (isTestOffline && store.webhookDeliveries) {
    deliveryDoc = store.webhookDeliveries.find((d) => d.deliveryId === deliveryId && d.clientId === clientId)
  }

  if (!deliveryDoc) {
    return { success: false, error: 'not_found', message: 'Webhook delivery log not found' }
  }

  // Check if active lease
  const leaseExpiresAt = deliveryDoc.leaseExpiresAt ? new Date(deliveryDoc.leaseExpiresAt) : null
  if (deliveryDoc.status === 'processing' && leaseExpiresAt && leaseExpiresAt.getTime() > now.getTime()) {
    return { success: false, error: 'locked', message: 'Webhook delivery is currently being processed by an active worker lease' }
  }

  // Atomically claim lease using unified claimDeliveryLease
  const claimResult = await claimDeliveryLease(deliveryId, workerId, { allowNonProcessing: true, clientId })
  if (!claimResult.claimed) {
    return { success: false, error: 'locked', message: 'Could not acquire lock for webhook retry' }
  }

  const targetDelivery = claimResult.delivery
  const client = await resolveClient(clientId)
  const secret = await getTenantWebhookSecret(client, clientId)
  const result = await executeDeliveryAttempt(targetDelivery, secret, workerId, claimResult.leaseToken)

  return {
    success: result.dispatched,
    ...result,
  }
}

/**
 * Stages a durable webhook event in the outbox (WebhookDeliveryLog).
 * Supports optional Mongoose ClientSession for atomic transactions.
 */
export async function stageWebhookOutbox(clientId, event, payload = {}, options = {}, session = null) {
  if (!clientId) return { staged: false, reason: 'No clientId provided' }

  const isTestOffline = process.env.NODE_ENV === 'test' && !isDbConnected()
  if (!isDbConnected() && !isTestOffline) {
    if (session) {
      throw new Error('Database service is unavailable for transactional outbox staging')
    }
    return { staged: false, reason: 'Database service is unavailable' }
  }

  try {
    const client = await resolveClient(clientId, session)
    const webhookUrl = client?.integrationSettings?.webhookUrl || client?.webhookUrl || ''

    if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
      return { staged: false, reason: 'No valid webhook URL configured for client' }
    }

    const secret = await getTenantWebhookSecret(client, clientId)
    const sanitizedPayload = sanitizeWebhookPayload(payload)
    const postId = payload?.id || payload?.customId || null
    const eventIdentity = options.eventIdentity || `${clientId}:${event}:${postId || 'generic'}:${payload?.updatedAt || Date.now()}`

    const deliveryId = crypto.randomUUID()
    const maxAttempts = options.maxAttempts || DEFAULT_MAX_ATTEMPTS

    const record = {
      deliveryId,
      clientId,
      event,
      postId,
      eventIdentity,
      targetUrl: webhookUrl,
      payload: sanitizedPayload,
      attemptCount: 0,
      maxAttempts,
      status: 'pending',
      nextRetryAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    let persisted = null
    if (isDbConnected()) {
      const createOpts = session ? { session } : {}
      const [created] = await WebhookDeliveryLog.create([record], createOpts)
      persisted = created
    } else if (isTestOffline) {
      store.webhookDeliveries = store.webhookDeliveries || []
      store.webhookDeliveries.unshift(record)
      persisted = record
    }

    return { staged: true, delivery: persisted, secret }
  } catch (err) {
    if (session) {
      // Re-throw so enclosing withOptionalTransaction() cleanly rolls back the entire transaction
      throw err
    }
    return { staged: false, error: err.message }
  }
}

let retryDaemonInterval = null

/**
 * Starts periodic background retry daemon on server boot.
 */
export function startWebhookRetryDaemon(intervalMs = 30000) {
  if (retryDaemonInterval) return () => {}

  retryDaemonInterval = setInterval(() => {
    processPendingWebhookRetries(10).catch(() => {})
  }, intervalMs)

  if (retryDaemonInterval.unref) retryDaemonInterval.unref()

  return () => {
    if (retryDaemonInterval) {
      clearInterval(retryDaemonInterval)
      retryDaemonInterval = null
    }
  }
}

export default {
  dispatchWebhook,
  calculateNextRetry,
  getTenantWebhookSecret,
  sanitizeWebhookPayload,
  executeDeliveryAttempt,
  claimDeliveryLease,
  dispatchImmediateOutboxDelivery,
  processPendingWebhookRetries,
  retryWebhookDelivery,
  stageWebhookOutbox,
  startWebhookRetryDaemon,
}
