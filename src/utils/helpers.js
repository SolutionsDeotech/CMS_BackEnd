export function slugify(text) {
  if (!text) return ''
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatPostDate(date = new Date()) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function calculateReadTime(text = '') {
  if (!text) return '1 min read'
  const plainText = text.replace(/<[^>]*>/g, '')
  const words = plainText.trim().split(/\s+/).length
  const wordsPerMinute = 200
  const minutes = Math.max(1, Math.ceil(words / wordsPerMinute))
  return `${minutes} min read`
}

export function generateOTP(length = 6) {
  let otp = ''
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10)
  }
  return otp
}

export function paginate(array, page = 1, limit = 10) {
  const p = Math.max(1, parseInt(page, 10) || 1)
  const l = Math.max(1, parseInt(limit, 10) || 10)
  const startIndex = (p - 1) * l
  const endIndex = startIndex + l
  const total = array.length
  const totalPages = Math.ceil(total / l)

  return {
    data: array.slice(startIndex, endIndex),
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages,
      hasNextPage: endIndex < total,
      hasPrevPage: startIndex > 0,
    },
  }
}

export function sendSuccess(res, data = null, message = 'Success', statusCode = 200, meta = null) {
  const response = {
    success: true,
    message,
    data,
  }
  if (meta) {
    response.meta = meta
  }
  return res.status(statusCode).json(response)
}

export function isUserPrimaryAdmin(user) {
  if (!user) return false
  return Boolean(user.isPrimaryAdmin)
}

/**
 * Normalizes various scheduled date representations into a clean UTC Date object.
 * Supports:
 * - ISO-8601 strings (e.g. 2026-11-20T14:30:00.000Z, 2026-11-20T9:30:00Z)
 * - Frontend UTC strings (e.g. "2026-11-20 at 14:30 UTC" or "2026-11-20 at 9:30 UTC")
 * - Date-only strings (e.g. "2026-11-20")
 * - Millisecond timestamps (number or numeric string)
 * - Date instances
 */
export function normalizeScheduledDate(input) {
  if (!input) return null
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input
  }
  if (typeof input === 'number') {
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }

  let str = String(input).trim()
  if (!str) return null

  // Handle timestamp numeric strings
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str)
    const d = new Date(str.length === 10 ? num * 1000 : num)
    return isNaN(d.getTime()) ? null : d
  }

  // Handle frontend format: "YYYY-MM-DD at HH:mm UTC" or "YYYY-MM-DD at H:mm"
  if (str.includes(' at ')) {
    const parts = str.split(' at ')
    const datePart = parts[0].trim()
    let timePart = parts[1].replace(/\s*UTC\s*$/i, '').trim()
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
    if (timeMatch) {
      const h = timeMatch[1].padStart(2, '0')
      const m = timeMatch[2].padStart(2, '0')
      const s = (timeMatch[3] || '00').padStart(2, '0')
      timePart = `${h}:${m}:${s}`
    }
    str = `${datePart}T${timePart}Z`
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    str += 'T00:00:00.000Z'
  } else if (/T\d{1}:\d{2}/.test(str)) {
    str = str.replace(/T(\d{1}):(\d{2})/, (_m, h, min) => `T${h.padStart(2, '0')}:${min}`)
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Validates a scheduled date.
 * Rejects invalid formats and past dates (allowing an optional grace window for network latency).
 */
export function validateScheduledDate(dateInput, options = {}) {
  const date = normalizeScheduledDate(dateInput)
  if (!date) {
    return {
      valid: false,
      error: 'Invalid scheduled date format. Please provide a valid date/time.',
      date: null,
    }
  }

  const now = Date.now()
  const gracePeriodMs = options.gracePeriodMs !== undefined ? options.gracePeriodMs : 30000 // 30s grace
  if (date.getTime() < now - gracePeriodMs) {
    return {
      valid: false,
      error: 'Scheduled date must be in the future.',
      date: null,
    }
  }

  return {
    valid: true,
    error: null,
    date,
  }
}
