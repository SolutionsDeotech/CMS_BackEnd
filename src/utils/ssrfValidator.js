import dns from 'node:dns/promises'
import net from 'node:net'
import { URL } from 'node:url'

/**
 * Checks if an IPv4 address is within private, loopback, link-local, multicast, or reserved ranges.
 */
export function isPrivateOrReservedIPv4(ip) {
  if (typeof ip !== 'string') return true
  const parts = ip.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true
  }

  const [a, b] = parts

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (Link-local / Cloud Metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && parts[2] === 0) return true
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && parts[2] === 2) return true
  // 192.88.99.0/24 (6to4 Relay Anycast)
  if (a === 192 && b === 88 && parts[2] === 99) return true
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true
  // 198.18.0.0/15 (Network benchmark tests)
  if (a === 198 && (b === 18 || b === 19)) return true
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && parts[2] === 100) return true
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && parts[2] === 113) return true
  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true
  // 240.0.0.0/4 (Reserved for future use)
  if (a >= 240) return true

  return false
}

/**
 * Checks if an IPv6 address is within private, loopback, link-local, or documentation ranges.
 */
export function isPrivateOrReservedIPv6(ip) {
  if (typeof ip !== 'string') return true
  const lower = ip.toLowerCase().trim()

  // Unspecified ::
  if (lower === '::') return true
  // Loopback ::1
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (lower.startsWith('::ffff:')) {
    const v4Part = lower.replace('::ffff:', '')
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIPv4(v4Part)
    }
  }

  // Unique local addresses (fc00::/7 -> starts with fc or fd)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower) || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true
  }

  // Link-local addresses (fe80::/10 -> starts with fe8, fe9, fea, feb)
  if (/^fe[89ab][0-9a-f]:/i.test(lower) || lower.startsWith('fe80:')) {
    return true
  }

  // Multicast (ff00::/8)
  if (lower.startsWith('ff')) {
    return true
  }

  // Discard prefix (100::/64)
  if (lower.startsWith('100::')) return true

  return false
}

/**
 * Validates a target URL against SSRF attacks.
 * Resolves DNS to ensure no private/reserved IP is returned.
 *
 * @param {string} rawUrl - The URL to validate.
 * @param {object} options - Options (e.g. allowLocalInTest: true).
 * @returns {Promise<{ valid: boolean, error?: string, code?: string, ip?: string, resolvedUrl?: URL }>}
 */
export async function validateUrlForSSRF(rawUrl, options = {}) {
  let parsedUrl
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return { valid: false, error: 'Invalid URL format', code: 'ERR_INVALID_URL' }
  }

  // Only allow http: and https: protocols
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      error: `Forbidden protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are permitted.`,
      code: 'ERR_FORBIDDEN_PROTOCOL',
    }
  }

  const hostname = parsedUrl.hostname.toLowerCase()

  // Disallow explicit local/internal names
  const forbiddenHosts = ['localhost', 'broadcasthost', 'localdomain']
  if (
    forbiddenHosts.includes(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.intranet') ||
    hostname.endsWith('.onion') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid')
  ) {
    if (!options.allowLocalInTest) {
      return {
        valid: false,
        error: `SSRF Blocked: Host "${hostname}" is an internal or local reserved domain.`,
        code: 'ERR_SSRF_BLOCKED',
      }
    }
  }

  // Check if hostname is an IP literal
  const ipType = net.isIP(hostname)
  if (ipType === 4) {
    if (isPrivateOrReservedIPv4(hostname) && !options.allowLocalInTest) {
      return {
        valid: false,
        error: `SSRF Blocked: IPv4 address "${hostname}" is within a private, loopback, or reserved network range.`,
        code: 'ERR_SSRF_BLOCKED',
        ip: hostname,
      }
    }
    return { valid: true, ip: hostname, resolvedUrl: parsedUrl }
  } else if (ipType === 6) {
    if (isPrivateOrReservedIPv6(hostname) && !options.allowLocalInTest) {
      return {
        valid: false,
        error: `SSRF Blocked: IPv6 address "${hostname}" is within a private, loopback, or reserved network range.`,
        code: 'ERR_SSRF_BLOCKED',
        ip: hostname,
      }
    }
    return { valid: true, ip: hostname, resolvedUrl: parsedUrl }
  }

  // Perform DNS resolution
  try {
    const addresses = await dns.lookup(hostname, { all: true })
    if (!addresses || addresses.length === 0) {
      return {
        valid: false,
        error: `DNS resolution failed: Hostname "${hostname}" could not be resolved.`,
        code: 'ERR_DNS_RESOLUTION_FAILED',
      }
    }

    for (const record of addresses) {
      const { address, family } = record
      if (family === 4 && isPrivateOrReservedIPv4(address)) {
        if (!options.allowLocalInTest) {
          return {
            valid: false,
            error: `SSRF Blocked: Hostname resolved to private or reserved IP: ${address}`,
            code: 'ERR_SSRF_BLOCKED',
            ip: address,
          }
        }
      } else if (family === 6 && isPrivateOrReservedIPv6(address)) {
        if (!options.allowLocalInTest) {
          return {
            valid: false,
            error: `SSRF Blocked: Hostname resolved to private or reserved IPv6: ${address}`,
            code: 'ERR_SSRF_BLOCKED',
            ip: address,
          }
        }
      }
    }

    return { valid: true, ip: addresses[0].address, resolvedUrl: parsedUrl }
  } catch (err) {
    return {
      valid: false,
      error: `DNS Lookup error for "${hostname}": ${err.message}`,
      code: 'ERR_DNS_LOOKUP_ERROR',
    }
  }
}

/**
 * Safely fetches an HTTP resource with SSRF protection, redirect validation,
 * request timeout, and response body size limit.
 *
 * @param {string} initialUrl - The URL to fetch.
 * @param {object} options - Fetch options.
 * @returns {Promise<{ status: number, statusText: string, headers: Headers, text: string, finalUrl: string, latencyMs: number }>}
 */
export async function safeFetchHtml(initialUrl, options = {}) {
  const timeoutMs = options.timeoutMs || 7000
  const maxRedirects = options.maxRedirects || 3
  const maxBytes = options.maxBytes || 512 * 1024 // 512KB

  let currentUrl = initialUrl
  let redirectCount = 0
  const startTime = Date.now()

  while (redirectCount <= maxRedirects) {
    // 1. SSRF Validation for currentUrl
    const validation = await validateUrlForSSRF(currentUrl, options)
    if (!validation.valid) {
      const err = new Error(validation.error)
      err.code = validation.code
      err.ip = validation.ip
      throw err
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Deotech-CMS-Verification-Bot/1.0 (+https://cms-backend-3fdr.onrender.com)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'manual', // Manual redirect handling for per-hop SSRF validation
        signal: controller.signal,
      })

      clearTimeout(timer)

      // Handle Redirects
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) {
          throw new Error('Redirect response received without a Location header')
        }
        redirectCount++
        if (redirectCount > maxRedirects) {
          const err = new Error(`Too many redirects: exceeded maximum of ${maxRedirects}`)
          err.code = 'ERR_TOO_MANY_REDIRECTS'
          throw err
        }
        currentUrl = new URL(location, currentUrl).href
        continue
      }

      // Read response body with size limit
      const reader = response.body?.getReader()
      let chunks = []
      let bytesRead = 0

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            const remaining = maxBytes - bytesRead
            if (value.length > remaining) {
              chunks.push(value.slice(0, remaining))
              bytesRead += remaining
              await reader.cancel()
              break
            } else {
              chunks.push(value)
              bytesRead += value.length
              if (bytesRead >= maxBytes) {
                await reader.cancel()
                break
              }
            }
          }
        }
      }

      const totalBuffer = Buffer.concat(chunks)
      const text = totalBuffer.toString('utf-8')
      const latencyMs = Date.now() - startTime

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        text,
        finalUrl: currentUrl,
        latencyMs,
      }
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') {
        const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms`)
        timeoutErr.code = 'ERR_REQUEST_TIMEOUT'
        throw timeoutErr
      }
      throw err
    }
  }

  const err = new Error(`Exceeded maximum redirects (${maxRedirects})`)
  err.code = 'ERR_TOO_MANY_REDIRECTS'
  throw err
}

export default {
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateUrlForSSRF,
  safeFetchHtml,
}
