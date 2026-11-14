import { Router } from 'express'
import { verifyCronSecret } from '../middleware/cronAuth.js'
import { processDueScheduledPosts } from '../services/scheduledPostService.js'
import asyncHandler from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/helpers.js'

const router = Router()

/**
 * POST /api/v1/internal/scheduled/run
 * Internal cron endpoint to trigger scheduled blog post publishing.
 * Protected by X-Cron-Key and CRON_SECRET using timingSafeEqual.
 */
router.post(
  '/scheduled/run',
  verifyCronSecret,
  asyncHandler(async (req, res) => {
    const result = await processDueScheduledPosts(50, 'external-cron')
    return sendSuccess(res, result, 'Internal scheduled posts sweep completed successfully')
  })
)

export default router

