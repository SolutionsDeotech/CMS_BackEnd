import crypto from 'node:crypto'
import Post from '../models/Post.js'
import { isDbConnected } from '../config/db.js'
import store from './store.js'
import logger from '../utils/logger.js'
import { formatPostDate, normalizeScheduledDate, validateScheduledDate } from '../utils/helpers.js'
import { stageWebhookOutbox, dispatchImmediateOutboxDelivery } from './webhookService.js'
import { withOptionalTransaction } from '../controllers/postsController.js'

export { normalizeScheduledDate, validateScheduledDate }

export const DEFAULT_SCHEDULE_LEASE_DURATION_MS = 60000 // 60 seconds lease
export const DEFAULT_SCHEDULE_INTERVAL_MS = 30000 // 30 seconds check

/**
 * Atomically claims a scheduled post for publishing using a unique lease token.
 * Prevents multiple workers or daemons from claiming or publishing the same post.
 */
export async function claimScheduledPost(postId, workerId = 'scheduler-worker', leaseDurationMs = DEFAULT_SCHEDULE_LEASE_DURATION_MS) {
  const now = new Date()
  const leaseToken = crypto.randomUUID()

  if (isDbConnected()) {
    const claimFilter = {
      _id: postId,
      status: 'scheduled',
      scheduledDate: { $lte: now },
      $or: [
        { 'publishingLock.leaseToken': null },
        { 'publishingLock.leaseExpiresAt': { $lte: now } },
      ],
    }
    const claimUpdate = {
      $set: {
        'publishingLock.lockedAt': now,
        'publishingLock.lockedBy': workerId,
        'publishingLock.leaseToken': leaseToken,
        'publishingLock.leaseExpiresAt': new Date(Date.now() + leaseDurationMs),
      },
    }

    const claimed = await Post.findOneAndUpdate(claimFilter, claimUpdate, { new: true })
    if (!claimed) {
      return { claimed: false, post: null, leaseToken: null, reason: 'Post not due or already claimed by another worker' }
    }
    return { claimed: true, post: claimed, leaseToken }
  } else if (process.env.NODE_ENV === 'test' && store.posts) {
    // Memory store fallback for test isolation
    const pId = String(postId)
    const idx = store.posts.findIndex((p) => String(p.id) === pId || p.customId === pId || String(p._id) === pId)
    if (idx === -1) {
      return { claimed: false, post: null, leaseToken: null, reason: 'Post not found' }
    }
    const p = store.posts[idx]
    if (p.status !== 'scheduled') {
      return { claimed: false, post: null, leaseToken: null, reason: 'Post is not scheduled' }
    }
    const dueTime = new Date(p.scheduledDate).getTime()
    if (isNaN(dueTime) || dueTime > now.getTime()) {
      return { claimed: false, post: null, leaseToken: null, reason: 'Post not due yet' }
    }
    if (p.publishingLock?.leaseToken && p.publishingLock?.leaseExpiresAt) {
      if (new Date(p.publishingLock.leaseExpiresAt).getTime() > now.getTime()) {
        return { claimed: false, post: null, leaseToken: null, reason: 'Active unexpired lease exists' }
      }
    }

    p.publishingLock = {
      lockedAt: now.toISOString(),
      lockedBy: workerId,
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + leaseDurationMs).toISOString(),
    }
    return { claimed: true, post: p, leaseToken }
  }

  return { claimed: false, post: null, leaseToken: null, reason: 'Database unavailable' }
}

/**
 * Publishes an atomically claimed scheduled post.
 * Uses a single database transaction wherever supported to update post status to 'published'
 * and insert the 'post.published' webhook event in the transactional outbox.
 */
export async function publishClaimedScheduledPost(claimedPost, leaseToken, workerId = 'scheduler-worker') {
  const now = new Date()
  let publishedPost = null
  let outboxStage = null

  if (isDbConnected()) {
    await withOptionalTransaction(async (session) => {
      const updateOptions = session ? { session, new: true, runValidators: true } : { new: true, runValidators: true }

      const filter = {
        _id: claimedPost._id,
        status: 'scheduled',
        'publishingLock.leaseToken': leaseToken, // Fencing check!
      }
      const update = {
        $set: {
          status: 'published',
          publishedAt: now,
          date: formatPostDate(now),
          'publishingLock.lockedAt': null,
          'publishingLock.lockedBy': null,
          'publishingLock.leaseToken': null,
          'publishingLock.leaseExpiresAt': null,
        },
      }

      publishedPost = await Post.findOneAndUpdate(filter, update, updateOptions)
      if (!publishedPost) {
        return
      }

      // Stage webhook outbox event atomically in the transaction session
      const targetClientId = publishedPost.clientId
      if (targetClientId) {
        const postId = String(publishedPost.id || publishedPost._id || publishedPost.customId)
        outboxStage = await stageWebhookOutbox(
          targetClientId,
          'post.published',
          {
            id: postId,
            slug: publishedPost.slug,
            title: publishedPost.title,
            status: 'published',
            previousStatus: 'scheduled',
            publishedAt: publishedPost.publishedAt,
          },
          {
            postId,
            eventIdentity: `${targetClientId}:post.published:${postId}:${now.getTime()}`,
          },
          session
        )
      }
    })
  } else if (process.env.NODE_ENV === 'test' && store.posts) {
    const pId = claimedPost.id || claimedPost._id
    const idx = store.posts.findIndex((p) => String(p.id) === String(pId) || p.customId === pId)
    if (idx !== -1 && store.posts[idx].status === 'scheduled') {
      const post = store.posts[idx]
      if (post.publishingLock?.leaseToken === leaseToken) {
        post.status = 'published'
        post.publishedAt = now.toISOString()
        post.date = formatPostDate(now)
        post.publishingLock = { lockedAt: null, lockedBy: null, leaseToken: null, leaseExpiresAt: null }
        post.updatedAt = now.toISOString()
        publishedPost = post

        if (post.clientId) {
          const postId = String(post.id || post._id || post.customId)
          outboxStage = await stageWebhookOutbox(
            post.clientId,
            'post.published',
            {
              id: postId,
              slug: post.slug,
              title: post.title,
              status: 'published',
              previousStatus: 'scheduled',
              publishedAt: post.publishedAt,
            },
            {
              postId,
              eventIdentity: `${post.clientId}:post.published:${postId}:${now.getTime()}`,
            },
            null
          )
        }
      }
    }
  }

  if (!publishedPost) {
    return { published: false, fenced: true, reason: 'Post already published or worker lease stolen' }
  }

  // After transaction commits: immediately dispatch the webhook
  if (outboxStage?.staged && outboxStage?.delivery) {
    dispatchImmediateOutboxDelivery(outboxStage.delivery, outboxStage.secret, 'publisher-scheduled').catch(() => {})
  }

  return {
    published: true,
    post: publishedPost,
    outboxStaged: Boolean(outboxStage?.staged),
    deliveryId: outboxStage?.delivery?.deliveryId || null,
  }
}

/**
 * Finds and processes all scheduled posts that are due for publishing.
 * Designed to recover overdue posts safely when a sleeping container wakes or restarts.
 */
export async function processDueScheduledPosts(batchSize = 10, workerId = `scheduler-${process.pid}`) {
  const isTestOffline = process.env.NODE_ENV === 'test' && !isDbConnected()
  if (!isDbConnected() && !isTestOffline) {
    return { processedCount: 0, publishedCount: 0, reason: 'Database service is unavailable' }
  }

  const now = new Date()
  let processedCount = 0
  let publishedCount = 0
  let failedCount = 0

  if (isDbConnected()) {
    const candidates = await Post.find({
      status: 'scheduled',
      scheduledDate: { $lte: now },
      $or: [
        { 'publishingLock.leaseToken': null },
        { 'publishingLock.leaseExpiresAt': { $lte: now } },
      ],
    })
      .sort({ scheduledDate: 1 })
      .limit(batchSize)
      .lean()

    for (const candidate of candidates) {
      const claim = await claimScheduledPost(candidate._id, workerId)
      if (!claim.claimed) continue

      processedCount++
      try {
        const result = await publishClaimedScheduledPost(claim.post, claim.leaseToken, workerId)
        if (result.published) {
          publishedCount++
        } else {
          failedCount++
        }
      } catch (err) {
        logger.error(`[Scheduler] Failed to publish post ${candidate._id}: ${err.message}`)
        failedCount++
      }
    }
  } else if (isTestOffline && store.posts) {
    const due = store.posts
      .filter((p) => {
        if (p.status !== 'scheduled') return false
        if (!p.scheduledDate) return false
        const dueTime = new Date(p.scheduledDate).getTime()
        if (isNaN(dueTime) || dueTime > now.getTime()) return false
        if (p.publishingLock?.leaseToken && p.publishingLock?.leaseExpiresAt) {
          if (new Date(p.publishingLock.leaseExpiresAt).getTime() > now.getTime()) {
            return false
          }
        }
        return true
      })
      .slice(0, batchSize)

    for (const item of due) {
      const claim = await claimScheduledPost(item.id || item._id, workerId)
      if (!claim.claimed) continue

      processedCount++
      try {
        const result = await publishClaimedScheduledPost(claim.post, claim.leaseToken, workerId)
        if (result.published) {
          publishedCount++
        } else {
          failedCount++
        }
      } catch (err) {
        failedCount++
      }
    }
  }

  return { processedCount, publishedCount, failedCount }
}

let scheduledDaemonInterval = null

/**
 * Starts periodic scheduled blog post publisher daemon on server boot.
 * Executes an immediate check on startup to process overdue posts if the service was asleep.
 */
export function startScheduledPostDaemon(intervalMs = DEFAULT_SCHEDULE_INTERVAL_MS) {
  if (scheduledDaemonInterval) return () => {}

  // Run immediately on boot to publish overdue posts immediately
  processDueScheduledPosts(10, `scheduler-boot-${process.pid}`).catch((err) => {
    logger.warn(`[Scheduler] Startup overdue check error: ${err.message}`)
  })

  scheduledDaemonInterval = setInterval(() => {
    processDueScheduledPosts(10, `scheduler-${process.pid}`).catch((err) => {
      logger.warn(`[Scheduler] Periodic check error: ${err.message}`)
    })
  }, intervalMs)

  if (scheduledDaemonInterval.unref) scheduledDaemonInterval.unref()

  return () => {
    if (scheduledDaemonInterval) {
      clearInterval(scheduledDaemonInterval)
      scheduledDaemonInterval = null
    }
  }
}

export default {
  normalizeScheduledDate,
  validateScheduledDate,
  claimScheduledPost,
  publishClaimedScheduledPost,
  processDueScheduledPosts,
  startScheduledPostDaemon,
}
