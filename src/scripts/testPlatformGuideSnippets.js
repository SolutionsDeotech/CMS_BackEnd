/**
 * Comprehensive Unit Tests for Platform-wise Integration Guide Snippets
 *
 * ======================================================================
 * TEST CLASSIFICATION:
 * ----------------------------------------------------------------------
 * Category A: Direct Runtime Execution (JavaScript / Node.js)
 *   - Test 2: Next.js Webhook HMAC-SHA256 Cryptographic Verification
 *             (Executes actual Node.js crypto.createHmac and crypto.timingSafeEqual)
 *   - Test 8: Next.js 13/14 and 15 Params Resolution & Metadata Contract
 *             (Executes actual async Promise resolution and synchronous parameter handling)
 *   - Test 9: Next.js API Response Resilience & Sanitization Contract
 *             (Executes actual payload parsing, status-code checks, and malformed body protection)
 *
 * Category B: Architectural Logic Simulations (Evaluated in Node.js test harness)
 *   - Test 1: Cloudflare Worker Strict Path Boundary Matching Simulation
 *   - Test 3: Java Spring Boot Context Path & Root Normalization Simulation
 *   - Test 4: .NET Core Minimal API Optional Slug Handling Simulation
 *   - Test 5: Vanilla PHP Strict Route Boundary & PATH_INFO Elimination Simulation
 *   - Test 6: Django Python re.escape URL Regex Boundary Simulation
 *   - Test 7: Laravel Framework Http Proxy Route Simulation
 * ======================================================================
 */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('======================================================================')
console.log('🧪 RUNNING COMPREHENSIVE PLATFORM INTEGRATION SNIPPET TESTS')
console.log('======================================================================\n')

const cmsBase = 'https://cms.com/api/v1/sites/id/blog'

// ====================================================================
// CATEGORY B: ARCHITECTURAL LOGIC SIMULATION
// --------------------------------------------------------------------
// 1. Cloudflare Worker Path Matching Simulation
// ====================================================================
console.log('[Category B - Simulation] Test 1: Cloudflare Worker Strict Path Boundary Matching')
function evaluateCloudflareRoute(urlStr, blogPath) {
  const url = new URL(urlStr)
  const BLOG_PREFIX = blogPath.replace(/\/+$/, '')
  const pathname = url.pathname

  const isBlogRoute = pathname === BLOG_PREFIX || pathname.startsWith(BLOG_PREFIX + '/')

  if (isBlogRoute) {
    const subPath = pathname === BLOG_PREFIX ? '' : pathname.slice(BLOG_PREFIX.length)
    return { proxied: true, subPath, search: url.search, targetPath: '/api/v1/sites/test/blog' + subPath + url.search }
  }

  return { proxied: false }
}

const cfRoot = evaluateCloudflareRoute('https://example.com/blog', '/blog')
assert.equal(cfRoot.proxied, true, 'Root /blog must be proxied')
assert.equal(cfRoot.subPath, '', 'Root /blog must have empty subPath')

const cfNested = evaluateCloudflareRoute('https://example.com/blog/my-first-post?utm=1', '/blog')
assert.equal(cfNested.proxied, true, 'Nested /blog/my-first-post must be proxied')
assert.equal(cfNested.subPath, '/my-first-post', 'Nested subpath must be /my-first-post')
assert.equal(cfNested.search, '?utm=1', 'Query string must be preserved')

assert.equal(evaluateCloudflareRoute('https://example.com/blogging-tips', '/blog').proxied, false, '/blogging-tips must NOT be proxied')
assert.equal(evaluateCloudflareRoute('https://example.com/blog-faq', '/blog').proxied, false, '/blog-faq must NOT be proxied')
assert.equal(evaluateCloudflareRoute('https://example.com/blogger', '/blog').proxied, false, '/blogger must NOT be proxied')
console.log('  ✅ [PASS] Cloudflare Worker proxies only /blog and /blog/* while ignoring /blogging, /blog-faq\n')

// ====================================================================
// CATEGORY A: DIRECT RUNTIME EXECUTION (NODE.JS)
// --------------------------------------------------------------------
// 2. Next.js Webhook HMAC-SHA256 Verification Test
// ====================================================================
console.log('[Category A - Direct Execution] Test 2: Next.js Webhook HMAC-SHA256 Verification')
function verifyNextjsWebhook(secret, signatureHeader, rawBody) {
  if (!secret) {
    return { status: 500, error: 'Server webhook secret not configured' }
  }

  const expectedPrefix = 'sha256='
  if (!signatureHeader || !signatureHeader.startsWith(expectedPrefix)) {
    return { status: 401, error: 'Missing or invalid signature header' }
  }

  const providedHex = signatureHeader.slice(expectedPrefix.length).trim()
  const hexRegex = /^[0-9a-fA-F]{64}$/
  if (!hexRegex.test(providedHex)) {
    return { status: 401, error: 'Invalid webhook signature format' }
  }

  try {
    const computedHex = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')

    const providedBuffer = Buffer.from(providedHex, 'hex')
    const computedBuffer = Buffer.from(computedHex, 'hex')

    if (providedBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(providedBuffer, computedBuffer)) {
      return { status: 401, error: 'Invalid webhook signature' }
    }

    return { status: 200, revalidated: true }
  } catch (err) {
    return { status: 401, error: 'Signature verification failed' }
  }
}

const secretKey = 'super_secret_webhook_key_123'
const samplePayload = JSON.stringify({ event: 'post.published', postId: 'post-1' })
const validHash = crypto.createHmac('sha256', secretKey).update(samplePayload).digest('hex')

assert.equal(verifyNextjsWebhook('', `sha256=${validHash}`, samplePayload).status, 500, 'Missing secret must return 500')
assert.equal(verifyNextjsWebhook(secretKey, `invalid_format_${validHash}`, samplePayload).status, 401, 'Invalid signature header prefix must return 401')
assert.equal(verifyNextjsWebhook(secretKey, '', samplePayload).status, 401, 'Empty signature header must return 401')
assert.equal(verifyNextjsWebhook(secretKey, `sha256=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`, samplePayload).status, 401, 'Non-hex signature must return 401')
assert.equal(verifyNextjsWebhook(secretKey, `sha256=1234abcd`, samplePayload).status, 401, 'Short hex signature must return 401')
assert.equal(verifyNextjsWebhook(secretKey, `sha256=123`, samplePayload).status, 401, 'Odd length hex signature must return 401')
assert.equal(verifyNextjsWebhook(secretKey, `sha256=${'0'.repeat(64)}`, samplePayload).status, 401, 'Wrong HMAC hash must fail with 401')
assert.equal(verifyNextjsWebhook(secretKey, `sha256=${validHash}`, samplePayload + 'tampered').status, 401, 'Tampered payload must fail with 401')
assert.equal(verifyNextjsWebhook(secretKey, `sha256=${validHash}`, samplePayload).status, 200, 'Valid signature must succeed with 200')
console.log('  ✅ [PASS] Next.js Webhook rejects missing secret (500), bad header (401), non-hex (401), short/odd-hex (401), tampered body (401), and approves valid HMAC (200)\n')

// ====================================================================
// CATEGORY B: ARCHITECTURAL LOGIC SIMULATION
// --------------------------------------------------------------------
// 3. Java Route Boundary & Root Normalization Simulation
// ====================================================================
console.log('[Category B - Simulation] Test 3: Java Route Boundary & Root Normalization')
function evaluateJavaProxy(requestURI, contextPath, queryString, blogPrefix, cmsUrl) {
  const path = (contextPath && contextPath.length > 0 && requestURI.startsWith(contextPath))
    ? requestURI.substring(contextPath.length)
    : requestURI

  // Strict segment boundary check relative to context path
  if (!path.equals ? (path !== blogPrefix && !path.startsWith(blogPrefix + '/')) : (!path.equals(blogPrefix) && !path.startsWith(blogPrefix + '/'))) {
    return { status: 404, url: null }
  }

  // Consistent root normalization: both /blog and /blog/ yield empty subPath
  const subPath = (path === blogPrefix || path === blogPrefix + '/') ? '' : path.substring(blogPrefix.length)
  let targetUrl = cmsUrl + (subPath.startsWith('/') ? subPath : (subPath === '' ? '' : '/' + subPath))

  if (queryString && queryString.trim().length > 0) {
    targetUrl += '?' + queryString.trim()
  }

  return { status: 200, url: targetUrl }
}

// Case A: Root deployment (contextPath = "")
const javaRoot = evaluateJavaProxy('/blog', '', '', '/blog', cmsBase)
assert.equal(javaRoot.status, 200, 'Root /blog must be accepted')
assert.equal(javaRoot.url, cmsBase, 'Root /blog must map directly to CMS base without trailing slash')

const javaRootSlash = evaluateJavaProxy('/blog/', '', '', '/blog', cmsBase)
assert.equal(javaRootSlash.status, 200, 'Root /blog/ must be accepted')
assert.equal(javaRootSlash.url, cmsBase, 'Root /blog/ must be normalized consistently to CMS base without trailing slash')

const javaPost = evaluateJavaProxy('/blog/my-first-post', '', '', '/blog', cmsBase)
assert.equal(javaPost.status, 200, '/blog/my-first-post must be accepted')
assert.equal(javaPost.url, cmsBase + '/my-first-post', 'Slug path must match')

// Slug containing the word "blog"
const javaSlugWithBlog = evaluateJavaProxy('/blog/my-blog-story', '', '', '/blog', cmsBase)
assert.equal(javaSlugWithBlog.status, 200, 'Slug with blog keyword must be accepted')
assert.equal(javaSlugWithBlog.url, cmsBase + '/my-blog-story', 'Slug containing "blog" must NOT be corrupted')

// Query parameters
const javaWithQuery = evaluateJavaProxy('/blog/my-post', '', 'page=1&sort=desc', '/blog', cmsBase)
assert.equal(javaWithQuery.status, 200, 'Post with query params must be accepted')
assert.equal(javaWithQuery.url, cmsBase + '/my-post?page=1&sort=desc', 'Query parameters must be appended')

// Boundary rejections at root deployment
assert.equal(evaluateJavaProxy('/blogging', '', '', '/blog', cmsBase).status, 404, '/blogging must return 404')
assert.equal(evaluateJavaProxy('/blog-faq', '', '', '/blog', cmsBase).status, 404, '/blog-faq must return 404')
assert.equal(evaluateJavaProxy('/blogger', '', '', '/blog', cmsBase).status, 404, '/blogger must return 404')

// Case B: Non-root context path deployment (contextPath = "/myapp")
const javaCtxRoot = evaluateJavaProxy('/myapp/blog', '/myapp', '', '/blog', cmsBase)
assert.equal(javaCtxRoot.status, 200, 'Non-root context /myapp/blog must be accepted')
assert.equal(javaCtxRoot.url, cmsBase, 'Mapped URL must strip context path and target CMS base')

const javaCtxRootSlash = evaluateJavaProxy('/myapp/blog/', '/myapp', '', '/blog', cmsBase)
assert.equal(javaCtxRootSlash.status, 200, 'Non-root context /myapp/blog/ must be accepted')
assert.equal(javaCtxRootSlash.url, cmsBase, 'Non-root context /myapp/blog/ must normalize consistently to CMS base')

const javaCtxPost = evaluateJavaProxy('/myapp/blog/spring-boot-guide', '/myapp', 'ref=home', '/blog', cmsBase)
assert.equal(javaCtxPost.status, 200, 'Non-root context /myapp/blog/post must be accepted')
assert.equal(javaCtxPost.url, cmsBase + '/spring-boot-guide?ref=home', 'Target URL must preserve slug and query')

assert.equal(evaluateJavaProxy('/myapp/blogging', '/myapp', '', '/blog', cmsBase).status, 404, '/myapp/blogging must return 404')
assert.equal(evaluateJavaProxy('/myapp/blog-faq', '/myapp', '', '/blog', cmsBase).status, 404, '/myapp/blog-faq must return 404')
console.log('  ✅ [PASS] Java Controller handles root & non-root context paths, normalizes /blog and /blog/ consistently, rejects /blogging with 404, and preserves slugs & queries\n')

// ====================================================================
// CATEGORY B: ARCHITECTURAL LOGIC SIMULATION
// --------------------------------------------------------------------
// 4. .NET Catch-all Slug Route Simulation
// ====================================================================
console.log('[Category B - Simulation] Test 4: .NET Optional Slug URL Construction')
function evaluateDotNetUrl(slug, queryString, blogBase) {
  const subPath = !slug || slug.trim() === '' ? '' : `/${slug.replace(/^\/+|\/+$/g, '')}`
  const query = queryString ? `?${queryString.replace(/^\?/, '')}` : ''
  return `${blogBase}${subPath}${query}`
}

assert.equal(evaluateDotNetUrl(null, '', cmsBase), cmsBase, 'Root blog must NOT have trailing slash')
assert.equal(evaluateDotNetUrl('my-post-slug', '', cmsBase), cmsBase + '/my-post-slug', 'Nested post slug must append /slug')
assert.equal(evaluateDotNetUrl('category/tech/ai', 'preview=true', cmsBase), cmsBase + '/category/tech/ai?preview=true', 'Deep nested slugs and query strings must be preserved')
console.log('  ✅ [PASS] .NET URL construction produces clean root paths without trailing slashes and handles deep slugs\n')

// ====================================================================
// CATEGORY B: ARCHITECTURAL LOGIC SIMULATION
// --------------------------------------------------------------------
// 5. Vanilla PHP Strict Route Boundary & PATH_INFO Elimination Simulation
// ====================================================================
console.log('[Category B - Simulation] Test 5: Vanilla PHP Route Boundary & PATH_INFO Elimination')
function evaluatePhpProxy(requestUri, unexpectedPathInfo, blogPrefix, cmsBase) {
  // REQUEST_URI path extraction (simulates parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH))
  const requestPath = requestUri ? requestUri.split('?')[0] : ''
  const isRoot = (requestPath === blogPrefix || requestPath === blogPrefix + '/')
  const isSubPath = (requestPath.indexOf(blogPrefix + '/') === 0)

  // Strict segment boundary check: NO blog.php bypass
  if (!isRoot && !isSubPath) {
    return { status: 404, url: null }
  }

  // Derive subpath strictly from validated REQUEST_URI path (PATH_INFO fallback removed completely)
  // unexpectedPathInfo is completely ignored
  const subPath = isRoot ? '' : requestPath.substring(blogPrefix.length)

  const queryIdx = requestUri.indexOf('?')
  const queryString = queryIdx !== -1 ? requestUri.substring(queryIdx) : ''
  const cmsUrl = cmsBase + subPath + queryString

  return { status: 200, url: cmsUrl, subPath }
}

// Case A: Root requests (both /blog and /blog/ normalized to root base)
const phpRoot = evaluatePhpProxy('/blog', '', '/blog', cmsBase)
assert.equal(phpRoot.status, 200, 'Root /blog must be accepted')
assert.equal(phpRoot.url, cmsBase, 'Root /blog URL matches CMS base without trailing slash')

const phpRootSlash = evaluatePhpProxy('/blog/', '', '/blog', cmsBase)
assert.equal(phpRootSlash.status, 200, 'Root /blog/ must be accepted')
assert.equal(phpRootSlash.url, cmsBase, 'Root /blog/ URL matches CMS base without trailing slash')

// Case B: Root requests with unexpected PATH_INFO values (PATH_INFO MUST BE IGNORED)
const phpWithEvilPathInfo1 = evaluatePhpProxy('/blog', '/evil/path', '/blog', cmsBase)
assert.equal(phpWithEvilPathInfo1.status, 200, 'Root request with PATH_INFO must be accepted as root')
assert.equal(phpWithEvilPathInfo1.url, cmsBase, 'Unexpected PATH_INFO must be ignored; target must remain clean CMS base')

const phpWithEvilPathInfo2 = evaluatePhpProxy('/blog', '/../../etc/passwd', '/blog', cmsBase)
assert.equal(phpWithEvilPathInfo2.status, 200, 'Root request with traversal in PATH_INFO must be accepted as root')
assert.equal(phpWithEvilPathInfo2.url, cmsBase, 'Traversal in PATH_INFO must be ignored; target must remain clean CMS base')

const phpWithEvilPathInfo3 = evaluatePhpProxy('/blog', '/admin/dashboard', '/blog', cmsBase)
assert.equal(phpWithEvilPathInfo3.status, 200, 'Root request with admin PATH_INFO must be accepted as root')
assert.equal(phpWithEvilPathInfo3.url, cmsBase, 'Admin PATH_INFO must be ignored; target must remain clean CMS base')

// Case C: Nested post slug
const phpPost = evaluatePhpProxy('/blog/my-post', '', '/blog', cmsBase)
assert.equal(phpPost.status, 200, '/blog/my-post must be accepted')
assert.equal(phpPost.url, cmsBase + '/my-post', 'Slug /my-post must be appended')

// Case D: Query parameters preserved
const phpQuery = evaluatePhpProxy('/blog/my-post?tag=news&page=2', '', '/blog', cmsBase)
assert.equal(phpQuery.status, 200, 'Query parameters must be accepted')
assert.equal(phpQuery.url, cmsBase + '/my-post?tag=news&page=2', 'Query string must be preserved')

// Case E: Direct blog.php access attempts (bypass attempts must return 404)
assert.equal(evaluatePhpProxy('/blog.php', '', '/blog', cmsBase).status, 404, 'Direct /blog.php must be rejected with 404')
assert.equal(evaluatePhpProxy('/scripts/blog.php', '', '/blog', cmsBase).status, 404, '/scripts/blog.php must be rejected with 404')
assert.equal(evaluatePhpProxy('/blog.php/secret', '/secret', '/blog', cmsBase).status, 404, '/blog.php/secret must be rejected with 404')

// Case F: Strict boundary rejection (/blogging, /blog-faq, /blogger, /blogs)
assert.equal(evaluatePhpProxy('/blogging', '', '/blog', cmsBase).status, 404, '/blogging must be rejected with 404')
assert.equal(evaluatePhpProxy('/blog-faq', '', '/blog', cmsBase).status, 404, '/blog-faq must be rejected with 404')
assert.equal(evaluatePhpProxy('/blogger', '', '/blog', cmsBase).status, 404, '/blogger must be rejected with 404')
assert.equal(evaluatePhpProxy('/blogs', '', '/blog', cmsBase).status, 404, '/blogs must be rejected with 404')

// Case G: cURL failure handling (HTTP 502 Bad Gateway)
function evaluatePhpCurlOutcome(html, httpCode, curlError) {
  if (html === false || httpCode === 0) {
    return {
      statusCode: 502,
      contentType: 'text/plain; charset=utf-8',
      output: `Deotech CMS Proxy Error (502 Bad Gateway): ${curlError || 'Unable to connect to CMS engine.'}`,
    }
  }
  return {
    statusCode: httpCode || 200,
    contentType: 'text/html; charset=utf-8',
    output: html,
  }
}

const phpFailure = evaluatePhpCurlOutcome(false, 0, 'Connection refused on port 443')
assert.equal(phpFailure.statusCode, 502, 'cURL failure must set HTTP 502')
assert.match(phpFailure.output, /502 Bad Gateway/, 'Error message must explain failure')
console.log('  ✅ [PASS] Vanilla PHP eliminates PATH_INFO fallback, ignores unexpected PATH_INFO values, rejects /blogging & direct script access with 404, and preserves queries\n')

// ====================================================================
// CATEGORY B: ARCHITECTURAL LOGIC SIMULATION
// --------------------------------------------------------------------
// 6. Django URL Regex Boundary & Python re.escape Simulation
// ====================================================================
console.log('[Category B - Simulation] Test 6: Django URL Regex Boundary & Python re.escape Escaping')
function escapeRegex(string) {
  // Simulates Python re.escape() behavior for regex special characters
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function evaluateDjangoRoute(pathWithoutLeadingSlash, queryString, apachePath, cmsBase) {
  // Python: BLOG_PREFIX = re.escape(apachePath)
  // Python: re_path(rf'^{BLOG_PREFIX}(?:/(?P<slug>.*))?/?$', blog_proxy, name='blog_proxy')
  const escapedPrefix = escapeRegex(apachePath)
  const jsRegex = new RegExp(`^${escapedPrefix}(?:/(.*))?/?$`)
  const match = pathWithoutLeadingSlash.match(jsRegex)

  if (!match) {
    return { status: 404, url: null }
  }

  const rawSlug = match[1] || ''
  const cleanSlug = rawSlug.replace(/^\/+|\/+$/g, '')
  const subPath = cleanSlug.length > 0 ? `/${cleanSlug}` : ''
  let targetUrl = `${cmsBase}${subPath}`

  if (queryString && queryString.trim().length > 0) {
    targetUrl += '?' + queryString.replace(/^\?/, '').trim()
  }

  return { status: 200, url: targetUrl, slug: cleanSlug }
}

// Case A: Standard blog path "blog"
const djRoot = evaluateDjangoRoute('blog', '', 'blog', cmsBase)
assert.equal(djRoot.status, 200, 'Root blog must match')
assert.equal(djRoot.url, cmsBase, 'Root blog target URL must have no trailing slash')

const djRootSlash = evaluateDjangoRoute('blog/', '', 'blog', cmsBase)
assert.equal(djRootSlash.status, 200, 'Root blog/ must match')
assert.equal(djRootSlash.url, cmsBase, 'Root blog/ target URL matches base')

const djPost = evaluateDjangoRoute('blog/my-first-post', '', 'blog', cmsBase)
assert.equal(djPost.status, 200, 'Nested slug must match')
assert.equal(djPost.url, cmsBase + '/my-first-post', 'Nested slug must be appended')

const djPostQuery = evaluateDjangoRoute('blog/my-first-post', 'preview=true&token=123', 'blog', cmsBase)
assert.equal(djPostQuery.status, 200, 'Slug with query must match')
assert.equal(djPostQuery.url, cmsBase + '/my-first-post?preview=true&token=123', 'Query string must be forwarded')

const djDeep = evaluateDjangoRoute('blog/category/tech/ai', 'page=2', 'blog', cmsBase)
assert.equal(djDeep.status, 200, 'Deep slug must match')
assert.equal(djDeep.url, cmsBase + '/category/tech/ai?page=2', 'Deep slug and query must be forwarded')

// Boundary rejections: /blogging, /blog-faq, /blogger, /blogs
assert.equal(evaluateDjangoRoute('blogging', '', 'blog', cmsBase).status, 404, 'blogging must NOT match Django pattern')
assert.equal(evaluateDjangoRoute('blog-faq', '', 'blog', cmsBase).status, 404, 'blog-faq must NOT match Django pattern')
assert.equal(evaluateDjangoRoute('blogger', '', 'blog', cmsBase).status, 404, 'blogger must NOT match Django pattern')
assert.equal(evaluateDjangoRoute('blogs', '', 'blog', cmsBase).status, 404, 'blogs must NOT match Django pattern')

// Case B: Regex-special blog path "blog.v2" (dot is escaped, so blog-v2 or blog1v2 do NOT match)
const djDotRoot = evaluateDjangoRoute('blog.v2', '', 'blog.v2', cmsBase)
assert.equal(djDotRoot.status, 200, 'Exact blog.v2 must match')
const djDotPost = evaluateDjangoRoute('blog.v2/article-1', '', 'blog.v2', cmsBase)
assert.equal(djDotPost.status, 200, 'Nested blog.v2/article-1 must match')
assert.equal(evaluateDjangoRoute('blog-v2', '', 'blog.v2', cmsBase).status, 404, 'blog-v2 must NOT match escaped blog.v2 (dot is literal)')
assert.equal(evaluateDjangoRoute('blog1v2', '', 'blog.v2', cmsBase).status, 404, 'blog1v2 must NOT match escaped blog.v2')
assert.equal(evaluateDjangoRoute('blog_v2', '', 'blog.v2', cmsBase).status, 404, 'blog_v2 must NOT match escaped blog.v2')

// Case C: Regex-special blog path "blog+news" (plus is escaped, so blogggnews does NOT match)
const djPlusRoot = evaluateDjangoRoute('blog+news', '', 'blog+news', cmsBase)
assert.equal(djPlusRoot.status, 200, 'Exact blog+news must match')
const djPlusPost = evaluateDjangoRoute('blog+news/tech', 'q=ai', 'blog+news', cmsBase)
assert.equal(djPlusPost.status, 200, 'Nested blog+news/tech must match')
assert.equal(djPlusPost.url, cmsBase + '/tech?q=ai', 'Query string preserved on blog+news')
assert.equal(evaluateDjangoRoute('blogggnews', '', 'blog+news', cmsBase).status, 404, 'blogggnews must NOT match escaped blog+news (plus is literal)')
assert.equal(evaluateDjangoRoute('blognews', '', 'blog+news', cmsBase).status, 404, 'blognews must NOT match escaped blog+news')
console.log('  ✅ [PASS] Django re.escape regex correctly escapes special characters (blog.v2, blog+news), matches roots and slugs, and rejects unrelated routes\n')

// ====================================================================
// CATEGORY B: ARCHITECTURAL LOGIC SIMULATION
// --------------------------------------------------------------------
// 7. Laravel Proxy Route Simulation
// ====================================================================
console.log('[Category B - Simulation] Test 7: Laravel Proxy Route Query String Forwarding')
function evaluateLaravelProxy(any, queryString, blogBase) {
  const subPath = (any || '').replace(/^\/+|\/+$/g, '')
  let cmsUrl = blogBase + (subPath !== '' ? `/${subPath}` : '')
  if (queryString && queryString.trim().length > 0) {
    cmsUrl += '?' + queryString.replace(/^\?/, '').trim()
  }
  return cmsUrl
}

assert.equal(evaluateLaravelProxy('', '', cmsBase), cmsBase, 'Root blog must NOT have trailing slash')
assert.equal(evaluateLaravelProxy('', 'page=2&sort=desc', cmsBase), cmsBase + '?page=2&sort=desc', 'Root blog with query params must preserve query')
assert.equal(evaluateLaravelProxy('my-first-post', '', cmsBase), cmsBase + '/my-first-post', 'Nested article slug must append /slug')
assert.equal(evaluateLaravelProxy('my-first-post', 'preview=true&token=xyz', cmsBase), cmsBase + '/my-first-post?preview=true&token=xyz', 'Nested article with query params must forward both slug and query')
assert.equal(evaluateLaravelProxy('category/tech/ai', 'page=1', cmsBase), cmsBase + '/category/tech/ai?page=1', 'Deep nested slugs and query strings must be preserved')
console.log('  ✅ [PASS] Laravel proxy preserves root path without trailing slash, forwards nested slugs, and preserves query parameters\n')

// ====================================================================
// CATEGORY A: DIRECT RUNTIME EXECUTION (NODE.JS)
// --------------------------------------------------------------------
// 8. Next.js 13/14 and 15 Params Resolution & Metadata Contract
// ====================================================================
console.log('[Category A - Direct Execution] Test 8: Next.js 13/14 and 15 Params Resolution & Metadata Contract')

// Test Next.js 15 Async Params Resolution
async function resolveNextjs15Params(paramsPromise) {
  const resolved = await paramsPromise
  return resolved?.slug
}

// Test Next.js 13/14 Synchronous Params Resolution
async function resolveNextjs13Params(paramsObject) {
  const resolved = await paramsObject
  return resolved?.slug
}

const slug15 = await resolveNextjs15Params(Promise.resolve({ slug: 'async-slug-next15' }))
assert.equal(slug15, 'async-slug-next15', 'Next.js 15 async Promise params must resolve cleanly')

const slug13 = await resolveNextjs13Params({ slug: 'sync-slug-next13' })
assert.equal(slug13, 'sync-slug-next13', 'Next.js 13/14 plain object params must resolve cleanly via await')

const slugEmpty = await resolveNextjs15Params(Promise.resolve({}))
assert.equal(slugEmpty, undefined, 'Missing slug resolves to undefined')

// Metadata Contract: No fabricated fallbacks
function renderNextjsMeta(post) {
  if (!post.author && !post.date && !post.publishedAt) {
    return null
  }
  const parts = []
  if (post.author) parts.push(`By ${post.author}`)
  if (post.date || post.publishedAt) {
    parts.push(post.date || new Date(post.publishedAt).toLocaleDateString())
  }
  return parts.join(' • ')
}

assert.equal(renderNextjsMeta({}), null, 'Empty metadata must render nothing (no fabricated fallbacks)')
assert.equal(renderNextjsMeta({ author: 'Sarah Connor' }), 'By Sarah Connor', 'Author only must render author without fabricated date')
assert.equal(renderNextjsMeta({ author: 'John Doe', date: 'Nov 24, 2026' }), 'By John Doe • Nov 24, 2026', 'Full metadata must render author and date')
console.log('  ✅ [PASS] Next.js params resolution supports both Next.js 15 (Promise) and 13/14 (object), with no fabricated fallbacks\n')

// ====================================================================
// CATEGORY A: DIRECT RUNTIME EXECUTION (NODE.JS)
// --------------------------------------------------------------------
// 9. Next.js API Response Resilience & Sanitization Contract
// ====================================================================
console.log('[Category A - Direct Execution] Test 9: Next.js API Response Resilience & Sanitization Contract')

// Simulate Next.js listing page response handling
function handleListingResponse(responseMock) {
  if (!responseMock.ok) {
    return { status: 'error', message: 'Unable to load blog articles at this time.' }
  }
  const json = responseMock.body || {}
  const posts = Array.isArray(json?.data) ? json.data : []
  if (posts.length === 0) {
    return { status: 'empty', message: 'No published articles available yet.' }
  }
  return { status: 'success', count: posts.length, posts }
}

// 1. Failed HTTP response (e.g. 500 / 404 from upstream)
const failedRes = handleListingResponse({ ok: false, status: 500, body: null })
assert.equal(failedRes.status, 'error', 'Unsuccessful HTTP response must return error state without throwing')
assert.equal(failedRes.message, 'Unable to load blog articles at this time.')

// 2. Malformed JSON body (null or object without array)
const malformedRes1 = handleListingResponse({ ok: true, status: 200, body: {} })
assert.equal(malformedRes1.status, 'empty', 'Malformed payload missing data must fall back to empty list cleanly')

const malformedRes2 = handleListingResponse({ ok: true, status: 200, body: { data: 'not-an-array' } })
assert.equal(malformedRes2.status, 'empty', 'Non-array data must fall back to empty list cleanly')

// 3. Valid JSON with posts
const validRes = handleListingResponse({ ok: true, status: 200, body: { data: [{ id: '1', title: 'Hello Post' }] } })
assert.equal(validRes.status, 'success', 'Valid payload must succeed')
assert.equal(validRes.count, 1)

// Simulate Next.js detail page response handling
function handleDetailResponse(responseMock) {
  if (!responseMock.ok) {
    return { status: 'not_found', message: 'Article Not Found' }
  }
  const json = responseMock.body || {}
  const post = json?.data
  if (!post) {
    return { status: 'not_found', message: 'Article Not Found' }
  }
  return { status: 'success', post }
}

assert.equal(handleDetailResponse({ ok: false, status: 404 }).status, 'not_found', 'HTTP 404 must return not_found')
assert.equal(handleDetailResponse({ ok: true, body: {} }).status, 'not_found', 'Missing post data must return not_found')
assert.equal(handleDetailResponse({ ok: true, body: { data: { title: 'Valid' } } }).status, 'success')

console.log('  ✅ [PASS] Next.js response handling guards against unsuccessful responses and malformed payloads without fabricated data\n')

console.log('======================================================================')
console.log('🎉 ALL 9 COMPREHENSIVE PLATFORM GUIDE TESTS PASSED (100% SUCCESS)')
console.log('======================================================================')
