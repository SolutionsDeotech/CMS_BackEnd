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
