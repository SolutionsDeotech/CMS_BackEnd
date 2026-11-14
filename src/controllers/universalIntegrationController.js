import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import Client from '../models/Client.js'
import Post from '../models/Post.js'
import WebhookDeliveryLog from '../models/WebhookDeliveryLog.js'
import { isDbConnected } from '../config/db.js'
import store from '../services/store.js'
import { dispatchWebhook, retryWebhookDelivery } from '../services/webhookService.js'
import crypto from 'node:crypto'

/**
 * Universal Embed Script generator.
 * Serves a zero-dependency vanilla JS client that any website can drop in.
 */
export const getEmbedScript = asyncHandler(async (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const scriptContent = `/**
 * Deotech CMS - Universal Blog Embed Component v1.0
 * Compatible with any website: WordPress, Shopify, Webflow, PHP, .NET, Node.js, static HTML
 */
(function() {
  'use strict';

  var API_BASE = '${process.env.BACKEND_URL || 'https://cms-backend-3fdr.onrender.com'}/api/v1';

  function initDeotechBlog() {
    var container = document.getElementById('deotech-blog-feed') || document.querySelector('[data-deotech-blog]');
    if (!container) return;

    var clientId = container.getAttribute('data-client-id') || container.getAttribute('data-client') || '';
    var basePath = container.getAttribute('data-base-path') || '/blog';
    basePath = basePath.replace(/\\/+$/, '');

    if (!clientId) {
      container.innerHTML = '<div style="padding:20px;color:#b91c1c;background:#fef2f2;border:1px solid #f87171;border-radius:8px;font-family:sans-serif;">Deotech CMS Error: data-client-id is missing on container element.</div>';
      return;
    }

    var currentPostSlug = getSlugFromUrl(basePath);

    loadBlogData(clientId, currentPostSlug, container, basePath);

    window.addEventListener('popstate', function() {
      var slug = getSlugFromUrl(basePath);
      loadBlogData(clientId, slug, container, basePath);
    });
  }

  function getSlugFromUrl(basePath) {
    var path = window.location.pathname.replace(/\\/+$/, '');
    if (path.indexOf(basePath) === 0 && path.length > basePath.length) {
      var sub = path.substring(basePath.length).replace(/^\\/+/, '');
      return sub.split('/')[0] || null;
    }
    var params = new URLSearchParams(window.location.search);
    return params.get('article') || params.get('post') || null;
  }

  function loadBlogData(clientId, slug, container, basePath) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:40px;font-family:sans-serif;color:#6b7280;"><svg style="animation:spin 1s linear infinite;width:24px;height:24px;margin-right:8px;" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity:0.25;"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>Loading articles...</div><style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>';

    Promise.all([
      fetch(API_BASE + '/clients/' + encodeURIComponent(clientId) + '/theme').then(function(r){ return r.json(); }).catch(function(){ return {}; }),
      slug
        ? fetch(API_BASE + '/posts/' + encodeURIComponent(slug) + '?clientId=' + encodeURIComponent(clientId)).then(function(r){ return r.json(); })
        : fetch(API_BASE + '/posts?clientId=' + encodeURIComponent(clientId) + '&status=published&limit=50').then(function(r){ return r.json(); })
    ]).then(function(results) {
      var theme = (results[0] && results[0].data) || {};
      var postData = results[1] || {};

      var primaryColor = theme.primaryColor || '#6b0d0d';
      var textColor = theme.textColor || '#1f2937';
      var fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';
      var cardRadius = theme.cardRadius || '12px';

      if (slug) {
        if (!postData.success || !postData.data) {
          container.innerHTML = '<div style="padding:30px;text-align:center;font-family:'+fontFamily+';"><h3 style="color:'+textColor+';">Article Not Found</h3><p style="color:#6b7280;font-size:14px;">The requested article is not available.</p><a href="'+basePath+'" style="display:inline-block;margin-top:12px;padding:8px 16px;background:'+primaryColor+';color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;" onclick="window.history.pushState({}, \\'\\', \\''+basePath+'\\'); window.dispatchEvent(new Event(\\'popstate\\')); return false;">← Return to Blog</a></div>';
          return;
        }
        renderSinglePost(container, postData.data, theme, basePath);
      } else {
        var posts = (postData.success && Array.isArray(postData.data)) ? postData.data : [];
        renderPostGrid(container, posts, theme, basePath);
      }
    }).catch(function(err) {
      container.innerHTML = '<div style="padding:20px;color:#b91c1c;background:#fef2f2;border-radius:8px;font-family:sans-serif;">Unable to load blog feed. Please check connectivity.</div>';
    });
  }

  function renderPostGrid(container, posts, theme, basePath) {
    var primaryColor = theme.primaryColor || '#6b0d0d';
    var textColor = theme.textColor || '#1f2937';
    var fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';
    var cardRadius = theme.cardRadius || '12px';

    var html = '<div style="font-family:' + fontFamily + ';color:' + textColor + ';max-width:1200px;margin:0 auto;padding:16px 0;">';

    if (posts.length === 0) {
      html += '<div style="text-align:center;padding:60px 20px;background:#f9fafb;border-radius:' + cardRadius + ';border:1px solid #e5e7eb;"><p style="font-size:16px;color:#4b5563;margin:0 0 6px 0;font-weight:600;">No articles published yet</p><p style="font-size:13px;color:#9ca3af;margin:0;">Articles published in your Deotech CMS will appear here instantly.</p></div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:24px;">';
      posts.forEach(function(post) {
        var postUrl = basePath + '/' + encodeURIComponent(post.slug || post.id);
        var imgHtml = post.featuredImage
          ? '<img src="' + post.featuredImage + '" alt="' + (post.title || '') + '" style="width:100%;height:190px;object-fit:cover;border-top-left-radius:' + cardRadius + ';border-top-right-radius:' + cardRadius + ';" />'
          : '<div style="width:100%;height:190px;background:' + primaryColor + '15;border-top-left-radius:' + cardRadius + ';border-top-right-radius:' + cardRadius + ';display:flex;align-items:center;justify-content:center;color:' + primaryColor + ';font-size:28px;">📰</div>';

        html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:' + cardRadius + ';overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);display:flex;flex-direction:column;transition:transform 0.2s, box-shadow 0.2s;">';
        html += imgHtml;
        html += '<div style="padding:18px;display:flex;flex-direction:column;flex:1;">';
        if (post.category) {
          html += '<span style="display:inline-block;background:' + primaryColor + '15;color:' + primaryColor + ';font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:8px;align-self:flex-start;">' + post.category + '</span>';
        }
        html += '<h3 style="margin:0 0 8px 0;font-size:18px;font-weight:700;line-height:1.3;"><a href="' + postUrl + '" data-slug="' + (post.slug || post.id) + '" style="color:' + textColor + ';text-decoration:none;" class="deotech-post-link">' + post.title + '</a></h3>';
        html += '<p style="margin:0 0 16px 0;font-size:13px;color:#6b7280;line-height:1.5;flex:1;">' + (post.excerpt || '') + '</p>';
        html += '<div style="border-top:1px solid #f3f4f6;padding-top:12px;display:flex;align-items:center;justify-content:between;font-size:12px;color:#9ca3af;">';
        html += '<span>' + (post.author || 'Editorial Team') + '</span>';
        html += '<span>' + (post.date || 'Recently') + '</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    var links = container.querySelectorAll('.deotech-post-link');
    links.forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var targetSlug = link.getAttribute('data-slug');
        var targetUrl = link.getAttribute('href');
        window.history.pushState({}, '', targetUrl);
        loadBlogData(container.getAttribute('data-client-id') || '', targetSlug, container, basePath);
      });
    });
  }

  function renderSinglePost(container, post, theme, basePath) {
    var primaryColor = theme.primaryColor || '#6b0d0d';
    var textColor = theme.textColor || '#1f2937';
    var fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';

    var html = '<div style="font-family:' + fontFamily + ';color:' + textColor + ';max-width:860px;margin:0 auto;padding:20px 0;">';
    html += '<a href="' + basePath + '" id="deotech-back-link" style="display:inline-flex;align-items:center;color:' + primaryColor + ';text-decoration:none;font-size:13px;font-weight:600;margin-bottom:20px;">← Back to All Articles</a>';

    if (post.category) {
      html += '<div><span style="background:' + primaryColor + '15;color:' + primaryColor + ';font-size:12px;font-weight:700;padding:3px 10px;border-radius:9999px;">' + post.category + '</span></div>';
    }

    html += '<h1 style="margin:12px 0 16px 0;font-size:32px;font-weight:800;line-height:1.25;">' + post.title + '</h1>';
    html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:24px;font-size:13px;color:#6b7280;">';
    html += '<span>By <strong>' + (post.author || 'Author') + '</strong></span>';
    html += '<span>•</span><span>' + (post.date || 'Published recently') + '</span>';
    if (post.readTime) html += '<span>•</span><span>' + post.readTime + '</span>';
    html += '</div>';

    if (post.featuredImage) {
      html += '<img src="' + post.featuredImage + '" alt="' + post.title + '" style="width:100%;max-height:450px;object-fit:cover;border-radius:12px;margin-bottom:24px;" />';
    }

    html += '<div style="font-size:16px;line-height:1.8;color:' + textColor + ';" class="deotech-post-body">' + (post.content || '') + '</div>';

    html += '<div style="margin-top:40px;padding-top:24px;border-top:1px solid #e5e7eb;">';
    html += '<a href="' + basePath + '" id="deotech-back-link-bottom" style="display:inline-block;padding:10px 20px;background:' + primaryColor + ';color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;font-weight:600;">← Back to Articles</a>';
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    var backLinks = [container.querySelector('#deotech-back-link'), container.querySelector('#deotech-back-link-bottom')];
    backLinks.forEach(function(btn) {
      if (btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          window.history.pushState({}, '', basePath);
          loadBlogData(container.getAttribute('data-client-id') || '', null, container, basePath);
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeotechBlog);
  } else {
    initDeotechBlog();
  }
})();
`

  res.send(scriptContent)
})

/**
 * Safely normalizes and decodes a configured blog path.
 * Handles plain paths, nested paths, percent-encoded traversal (%2e%2e),
 * backslashes, repeated slashes, and malformed encoding without crashing.
 */
export function normalizeBlogPath(raw) {
  let pathStr = String(raw || '').trim()
  if (!pathStr) return '/blog'
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(pathStr)
      if (decoded === pathStr) break
      pathStr = decoded
    } catch {
      break
    }
  }
  pathStr = pathStr.replace(/\\+/g, '/')
  const segments = pathStr.split('/').filter(Boolean)
  const safeSegments = []
  for (const seg of segments) {
    const trimmed = seg.trim()
    if (!trimmed || trimmed === '.' || trimmed === '..' || /^\.+$/.test(trimmed)) {
      continue
    }
    const cleanSeg = trimmed.replace(/[\x00-\x1f\x7f]/g, '')
    if (cleanSeg) safeSegments.push(cleanSeg)
  }
  return safeSegments.length > 0 ? `/${safeSegments.join('/')}` : '/blog'
}

/**
 * Edge SSR Blog Page Renderer.
 * Designed to be served directly or fetched by Reverse Proxies (Nginx, Apache, Cloudflare, .NET, PHP, Java)
 * for 100% native server-side Google SEO without client-side execution.
 */
export const renderEdgeSSRBlog = asyncHandler(async (req, res, next) => {
  const { clientId, slug } = req.params

  if (!clientId) {
    return next(new AppError('clientId is required for hosted blog rendering', 400))
  }

  let client = null
  let posts = []
  let activePost = null

  if (isDbConnected()) {
    client = await Client.findOne({
      $or: [{ customId: clientId }, { websiteUrl: clientId }],
    }).lean()
    if (!client && clientId.match(/^[0-9a-fA-F]{24}$/)) {
      client = await Client.findById(clientId).lean()
    }

    if (slug) {
      activePost = await Post.findOne({
        clientId: client?.customId || clientId,
        status: 'published',
        $or: [{ slug }, { customId: slug }],
      }).lean()
    } else {
      posts = await Post.find({
        clientId: client?.customId || clientId,
        status: 'published',
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
    }
  } else {
    client = store.clients?.find(
      (c) => c.customId === clientId || c.id === clientId || c.websiteUrl === clientId
    )
    if (slug) {
      activePost = store.posts?.find(
        (p) =>
          (p.clientId === clientId || p.clientId === client?.customId) &&
          p.status === 'published' &&
          (p.slug === slug || p.id === slug || p.customId === slug)
      )
    } else {
      posts = (store.posts || []).filter(
        (p) => (p.clientId === clientId || p.clientId === client?.customId) && p.status === 'published'
      )
    }
  }

  if (!client) {
    return next(new AppError(`Client organization not found: ${clientId}`, 404))
  }

  const theme = client.theme || {}
  const siteName = client.websiteName || 'Publication'
  const primaryColor = theme.primaryColor || '#6b0d0d'
  const textColor = theme.textColor || '#1f2937'
  const bodyBg = theme.bodyBg || '#f9fafb'
  const fontFamily = theme.fontFamily || 'Inter, system-ui, sans-serif'
  const headingFont = theme.headingFont || 'Outfit, system-ui, sans-serif'
  const cardRadius = theme.cardRadius || '14px'

  const clientOrigin = client.websiteUrl ? client.websiteUrl.replace(/\/+$/, '') : ''
  
  // Normalize configured blog path safely with fallback to default /blog
  const rawBlogPath = client.integrationSettings?.blogPath || client.blogPath || '/blog'
  const cleanBlogPath = normalizeBlogPath(rawBlogPath)

  const blogBaseUrl = `${clientOrigin}${cleanBlogPath}`

  let pageTitle = `${siteName} Blog - Insights & Perspectives`
  let metaDescription = `Explore the latest news, guides, and engineering perspectives from ${siteName}.`
  let canonicalUrl = blogBaseUrl
  let ogImage = ''

  if (activePost) {
    pageTitle = `${activePost.title} | ${siteName}`
    metaDescription = activePost.excerpt || activePost.title
    canonicalUrl = `${blogBaseUrl}/${activePost.slug}`
    ogImage = activePost.featuredImage || ''
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <link rel="canonical" href="${canonicalUrl}">

  <!-- OpenGraph & Social Metadata -->
  <meta property="og:type" content="${activePost ? 'article' : 'website'}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:url" content="${canonicalUrl}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  <meta name="twitter:card" content="summary_large_image">

  ${
    activePost
      ? `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "${escapeJson(activePost.title)}",
    "description": "${escapeJson(activePost.excerpt || '')}",
    "datePublished": "${activePost.createdAt || ''}",
    "author": {
      "@type": "Person",
      "name": "${escapeJson(activePost.author || siteName)}"
    }
  }
  </script>`
      : ''
  }

  <style>
    :root {
      --primary: ${primaryColor};
      --text: ${textColor};
      --bg: ${bodyBg};
      --font-body: ${fontFamily};
      --font-heading: ${headingFont};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      line-height: 1.6;
    }
    header {
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      padding: 16px 24px;
    }
    .header-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-family: var(--font-heading);
      font-weight: 800;
      font-size: 20px;
      color: var(--primary);
      text-decoration: none;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: ${cardRadius};
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      transition: transform 0.15s ease;
    }
    .card:hover { transform: translateY(-2px); }
    .card img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }
    .card-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      background: ${primaryColor}18;
      color: var(--primary);
      border-radius: 9999px;
      align-self: flex-start;
      margin-bottom: 10px;
    }
    .card-title {
      font-family: var(--font-heading);
      font-size: 19px;
      font-weight: 700;
      margin: 0 0 10px 0;
      line-height: 1.35;
    }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-excerpt {
      font-size: 13.5px;
      color: #6b7280;
      margin: 0 0 16px 0;
      flex: 1;
    }
    .card-footer {
      border-top: 1px solid #f3f4f6;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #9ca3af;
    }
    /* Single Article */
    .article-wrap {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 40px;
    }
    .back-btn {
      color: var(--primary);
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      display: inline-block;
      margin-bottom: 20px;
    }
    .article-title {
      font-family: var(--font-heading);
      font-size: 36px;
      font-weight: 800;
      line-height: 1.25;
      margin: 12px 0 16px 0;
    }
    .article-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-top: 1px solid #f3f4f6;
      border-bottom: 1px solid #f3f4f6;
      margin-bottom: 24px;
      font-size: 13px;
      color: #6b7280;
    }
    .article-img {
      width: 100%;
      max-height: 480px;
      object-fit: cover;
      border-radius: 12px;
      margin-bottom: 28px;
    }
    .article-content {
      font-size: 17px;
      line-height: 1.85;
      color: var(--text);
    }
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="${clientOrigin || '#'}" class="brand">${escapeHtml(siteName)}</a>
      <a href="${blogBaseUrl}" style="color:var(--primary);text-decoration:none;font-weight:600;font-size:14px;">All Articles</a>
    </div>
  </header>

  <main class="container">
    ${
      activePost
        ? `<div class="article-wrap">
            <a href="${blogBaseUrl}" class="back-btn">← Back to Blog Home</a>
            ${activePost.category ? `<div><span class="badge">${escapeHtml(activePost.category)}</span></div>` : ''}
            <h1 class="article-title">${escapeHtml(activePost.title)}</h1>
            <div class="article-meta">
              <span>By <strong>${escapeHtml(activePost.author || 'Editorial Team')}</strong></span>
              <span>•</span>
              <span>${escapeHtml(activePost.date || 'Recently published')}</span>
              ${activePost.readTime ? `<span>•</span><span>${escapeHtml(activePost.readTime)}</span>` : ''}
            </div>
            ${activePost.featuredImage ? `<img src="${activePost.featuredImage}" alt="${escapeHtml(activePost.title)}" class="article-img" />` : ''}
            <div class="article-content">${activePost.content || ''}</div>
          </div>`
        : `<div style="text-align:center;margin-bottom:40px;">
            <h1 style="font-family:var(--font-heading);font-size:36px;font-weight:800;margin:0 0 10px 0;">${escapeHtml(siteName)} Blog</h1>
            <p style="color:#6b7280;font-size:15px;max-width:600px;margin:0 auto;">Insights, perspectives, and editorial analysis published by our team.</p>
          </div>
          ${
            posts.length === 0
              ? `<div style="text-align:center;padding:80px 20px;background:#ffffff;border:1px solid #e5e7eb;border-radius:${cardRadius};">
                  <h3 style="margin:0 0 8px 0;font-weight:700;">No articles published yet</h3>
                  <p style="color:#9ca3af;font-size:14px;margin:0;">Articles will appear here once published from the CMS.</p>
                </div>`
              : `<div class="grid">
                  ${posts
                    .map(
                      (p) => `
                    <article class="card">
                      ${p.featuredImage ? `<img src="${p.featuredImage}" alt="${escapeHtml(p.title)}" />` : `<div style="height:190px;background:${primaryColor}15;display:flex;align-items:center;justify-content:center;font-size:32px;">📰</div>`}
                      <div class="card-body">
                        ${p.category ? `<span class="badge">${escapeHtml(p.category)}</span>` : ''}
                        <h3 class="card-title"><a href="${blogBaseUrl}/${p.slug || p.id}">${escapeHtml(p.title)}</a></h3>
                        <p class="card-excerpt">${escapeHtml(p.excerpt || '')}</p>
                        <div class="card-footer">
                          <span>${escapeHtml(p.author || 'Editorial Team')}</span>
                          <span>${escapeHtml(p.date || 'Recently')}</span>
                        </div>
                      </div>
                    </article>
                  `
                    )
                    .join('')}
                </div>`
          }`
    }
  </main>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
  res.send(html)
})

/**
 * Helper to resolve and authorize client access for webhook delivery endpoints
 */
async function resolveAndAuthorizeClient(req, clientIdParam) {
  let client = null
  if (isDbConnected()) {
    client = await Client.findOne({
      $or: [
        { customId: clientIdParam },
        { _id: clientIdParam && clientIdParam.match(/^[0-9a-fA-F]{24}$/) ? clientIdParam : null },
      ],
    })
  } else {
    client = store.clients?.find((c) => c.customId === clientIdParam || c.id === clientIdParam)
  }

  if (!client) {
    throw new AppError(`Client not found with id: ${clientIdParam}`, 404)
  }

  const resolvedClientId = client.customId || client.id || clientIdParam
  const user = req.user
  const isGlobalAdmin =
    Boolean(user?.isPrimaryAdmin) ||
    ['Admin', 'Super Admin', 'SuperAdmin'].includes(user?.role) ||
    ['Admin', 'Super Admin', 'SuperAdmin'].includes(user?.userType)

  if (!isGlobalAdmin) {
    if (!user) {
      throw new AppError('Authentication required to access integration settings', 401)
    }
    const userTenant = user?.clientId
    const clientMatches =
      userTenant &&
      (userTenant === resolvedClientId ||
        userTenant === String(client._id) ||
        userTenant === client.customId ||
        userTenant === client.id)

    if (!clientMatches) {
      throw new AppError(
        'Tenant Isolation: You are not authorized to access integration records for another client.',
        403,
        { code: 'TENANT_ISOLATION_VIOLATION' }
      )
    }
  }

  return { client, resolvedClientId }
}

/**
 * Format sanitized integration settings, redacting all sensitive credentials
 */
function formatSanitizedIntegration(client) {
  const raw = client?.integrationSettings || {}
  const effectiveBlogPath = normalizeBlogPath(raw.blogPath || client?.blogPath || '/blog')
  const hasWebhookSecret = Boolean(raw.webhookSecret && String(raw.webhookSecret).trim())
  const maskedSecret = hasWebhookSecret
    ? `${String(raw.webhookSecret).slice(0, 8)}••••••••••••`
    : ''
  const hasApiKey = Boolean(raw.apiKey && String(raw.apiKey).trim())
  const maskedApiKey = hasApiKey
    ? `${String(raw.apiKey).slice(0, 6)}••••••••••••`
    : ''

  return {
    method: raw.method || 'embed',
    blogPath: effectiveBlogPath,
    webhookUrl: raw.webhookUrl || '',
    hasWebhookSecret,
    webhookSecretMasked: maskedSecret,
    hasApiKey,
    apiKeyMasked: maskedApiKey,
  }
}

/**
 * Retrieve Integration settings & snippets for Client Admin
 */
export const getClientIntegration = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { client, resolvedClientId } = await resolveAndAuthorizeClient(req, id)

  const domain = client.websiteUrl ? client.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : 'yourcompany.com'
  const backendHost = process.env.BACKEND_URL || 'https://cms-backend-3fdr.onrender.com'

  const effectiveBlogPath = normalizeBlogPath(client.integrationSettings?.blogPath || client.blogPath || '/blog')
  const apachePath = effectiveBlogPath.replace(/^\/+/, '') || 'blog'

  const integration = formatSanitizedIntegration(client)

  const snippets = {
    embed: `<!-- Drop-in anywhere inside your blog page -->\n<div id="deotech-blog-feed" data-client-id="${resolvedClientId}" data-base-path="${effectiveBlogPath}"></div>\n<script src="${backendHost}/embed/v1/blog.js" async></script>`,
    wordpress: `// In WordPress: Add this custom shortcode in your active theme's functions.php\nadd_shortcode('deotech_blog', function() {\n    return '<div id="deotech-blog-feed" data-client-id="${resolvedClientId}" data-base-path="${effectiveBlogPath}"></div>'\n         . '<script src="${backendHost}/embed/v1/blog.js" async></script>';\n});\n\n// Or in Gutenberg / Elementor: Insert a "Custom HTML" block with:\n// <div id="deotech-blog-feed" data-client-id="${resolvedClientId}" data-base-path="${effectiveBlogPath}"></div>\n// <script src="${backendHost}/embed/v1/blog.js" async></script>`,
    php: `<?php\n// PHP / Laravel Proxy (Full Server-Side Rendering with 100% SEO)\n// Option 1: Vanilla PHP (blog.php)\n$blogPath = $_SERVER['PATH_INFO'] ?? '';\n$ssrUrl = "${backendHost}/api/v1/sites/${resolvedClientId}/blog" . $blogPath;\n$ch = curl_init($ssrUrl);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\ncurl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);\n$html = curl_exec($ch);\ncurl_close($ch);\nheader('Content-Type: text/html; charset=utf-8');\necho $html;\n\n// Option 2: Laravel (routes/web.php)\n// Route::any('${effectiveBlogPath}/{any?}', function ($any = '') {\n//     $response = Http::get("${backendHost}/api/v1/sites/${resolvedClientId}/blog/" . $any);\n//     return response($response->body(), $response->status())->header('Content-Type', 'text/html');\n// })->where('any', '.*');\n?>`,
    nodejs: `// Node.js Express / NestJS Reverse Proxy\nimport express from 'express';\nimport { createProxyMiddleware } from 'http-proxy-middleware';\n\nconst app = express();\n\n// Reverse-proxy all blog traffic to Deotech CMS Server-Side Engine\napp.use('${effectiveBlogPath}', createProxyMiddleware({\n  target: '${backendHost}/api/v1/sites/${resolvedClientId}/blog',\n  changeOrigin: true,\n  pathRewrite: { '^${effectiveBlogPath}': '' }\n}));`,
    python: `# Python (FastAPI Reverse Proxy)\n# Requires: pip install httpx fastapi uvicorn\nimport httpx\nfrom fastapi import FastAPI, Response\n\napp = FastAPI()\n\n# 1. Blog Root Listing\n@app.get("${effectiveBlogPath}")\nasync def blog_root():\n    async with httpx.AsyncClient() as client:\n        resp = await client.get("${backendHost}/api/v1/sites/${resolvedClientId}/blog")\n        return Response(content=resp.text, media_type="text/html", status_code=resp.status_code)\n\n# 2. Individual Article Slug\n@app.get("${effectiveBlogPath}/{path:path}")\nasync def blog_article(path: str):\n    async with httpx.AsyncClient() as client:\n        resp = await client.get(f"${backendHost}/api/v1/sites/${resolvedClientId}/blog/{path}")\n        return Response(content=resp.text, media_type="text/html", status_code=resp.status_code)`,
    dotnet: `// ASP.NET Core (.NET 7/8/9) - Program.cs\n// Ensure AddHttpClient() is registered in builder services:\nvar builder = WebApplication.CreateBuilder(args);\nbuilder.Services.AddHttpClient();\nvar app = builder.Build();\n\napp.MapGet("${effectiveBlogPath}/{**slug}", async (string? slug, IHttpClientFactory httpFactory) => {\n    var client = httpFactory.CreateClient();\n    var cmsUrl = $"${backendHost}/api/v1/sites/${resolvedClientId}/blog/{slug ?? ""}";\n    var response = await client.GetAsync(cmsUrl);\n    var htmlContent = await response.Content.ReadAsStringAsync();\n    return Results.Content(htmlContent, "text/html");\n});\n\napp.Run();`,
    java: `// Java Spring Boot - BlogProxyController.java\npackage com.example.controller;\n\nimport org.springframework.http.MediaType;\nimport org.springframework.http.ResponseEntity;\nimport org.springframework.web.bind.annotation.*;\nimport org.springframework.web.client.RestTemplate;\nimport jakarta.servlet.http.HttpServletRequest;\n\n@RestController\npublic class BlogProxyController {\n    private final RestTemplate rest = new RestTemplate();\n\n    @GetMapping(value = {"${effectiveBlogPath}", "${effectiveBlogPath}/**"}, produces = MediaType.TEXT_HTML_VALUE)\n    public ResponseEntity<String> renderBlog(HttpServletRequest request) {\n        String subPath = request.getRequestURI().replace("${effectiveBlogPath}", "");\n        String targetUrl = "${backendHost}/api/v1/sites/${resolvedClientId}/blog" + subPath;\n        return rest.getForEntity(targetUrl, String.class);\n    }\n}`,
    nginx: `# Add inside server block for ${domain}\nlocation ${effectiveBlogPath} {\n    proxy_pass ${backendHost}/api/v1/sites/${resolvedClientId}/blog;\n    proxy_ssl_server_name on;\n    proxy_set_header Host $host;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_set_header X-Forwarded-Proto $scheme;\n}`,
    apache: `# Add to Apache root .htaccess on ${domain}\nRewriteEngine On\nSSLProxyEngine On\nRewriteRule ^${apachePath}(/.*)?$ ${backendHost}/api/v1/sites/${resolvedClientId}/blog$1 [P,L]`,
    cloudflare: `// Cloudflare Worker Script\nexport default {\n  async fetch(request) {\n    const url = new URL(request.url);\n    if (url.pathname.startsWith('${effectiveBlogPath}')) {\n      const proxyUrl = new URL('${backendHost}/api/v1/sites/${resolvedClientId}/blog' + url.pathname.replace('${effectiveBlogPath}', ''));\n      return fetch(proxyUrl, request);\n    }\n    return fetch(request);\n  }\n};`,
    nextjs: `// Next.js (App Router) - app/blog/page.jsx\nexport default async function BlogIndex() {\n  const res = await fetch('${backendHost}/api/v1/posts?clientId=${resolvedClientId}&status=published', {\n    next: { tags: ['cms-posts'] }\n  });\n  const json = await res.json();\n  const posts = json.data || [];\n\n  return (\n    <div className="max-w-6xl mx-auto py-10 px-4">\n      <h1 className="text-3xl font-bold mb-6">Our Blog</h1>\n      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">\n        {posts.map((post) => (\n          <article key={post.id} className="border rounded-xl p-5 shadow-sm">\n            <h2 className="text-xl font-bold">{post.title}</h2>\n            <p className="text-gray-600 mt-2">{post.excerpt}</p>\n          </article>\n        ))}\n      </div>\n    </div>\n  );\n}\n\n// Instant Revalidation: app/api/revalidate-blog/route.js\nimport { revalidateTag } from 'next/cache';\nexport async function POST(request) {\n  revalidateTag('cms-posts');\n  return Response.json({ revalidated: true, now: Date.now() });\n}`,
    headless: `// REST API Endpoint\nGET ${backendHost}/api/v1/posts?clientId=${resolvedClientId}&status=published&page=1&limit=9`,
  }

  return sendSuccess(res, { integration, snippets, clientId: resolvedClientId, domain }, 'Client integration details retrieved')
})

/**
 * Update Integration settings (Webhook URL, Secret, Method, Path)
 */
export const updateClientIntegration = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { client, resolvedClientId } = await resolveAndAuthorizeClient(req, id)
  const { method, blogPath, webhookUrl, webhookSecret } = req.body

  const safeBlogPath = normalizeBlogPath(blogPath || client.integrationSettings?.blogPath || '/blog')

  const updates = {
    'integrationSettings.method': method || client.integrationSettings?.method || 'embed',
    'integrationSettings.blogPath': safeBlogPath,
  }
  if (webhookUrl !== undefined) {
    updates['integrationSettings.webhookUrl'] = webhookUrl
  }
  if (webhookSecret && typeof webhookSecret === 'string' && webhookSecret.trim()) {
    updates['integrationSettings.webhookSecret'] = webhookSecret.trim()
  }

  let updatedClient = null
  if (isDbConnected()) {
    updatedClient = await Client.findByIdAndUpdate(
      client._id,
      { $set: updates },
      { new: true }
    )
  } else {
    if (!client.integrationSettings) client.integrationSettings = {}
    client.integrationSettings.method = updates['integrationSettings.method']
    client.integrationSettings.blogPath = updates['integrationSettings.blogPath']
    if (webhookUrl !== undefined) client.integrationSettings.webhookUrl = webhookUrl
    if (webhookSecret && typeof webhookSecret === 'string' && webhookSecret.trim()) {
      client.integrationSettings.webhookSecret = webhookSecret.trim()
    }
    updatedClient = client
  }

  const sanitizedIntegration = formatSanitizedIntegration(updatedClient || client)
  return sendSuccess(res, sanitizedIntegration, 'Integration settings updated successfully')
})

/**
 * Test Webhook Ping
 */
export const testWebhookPing = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { client, resolvedClientId } = await resolveAndAuthorizeClient(req, id)
  const { webhookUrl } = req.body

  const targetUrl = webhookUrl || client?.integrationSettings?.webhookUrl

  if (!targetUrl) {
    return next(new AppError('No Webhook URL configured. Please enter a valid URL to test.', 400))
  }

  const result = await dispatchWebhook(resolvedClientId, 'test.ping', {
    message: 'Hello from Deotech CMS! Webhook integration test successful.',
    site: client?.websiteName || 'Deotech Solutions',
    timestamp: new Date().toISOString(),
  })

  return sendSuccess(res, result, result.dispatched ? 'Webhook test ping sent successfully' : 'Webhook test ping failed')
})

/**
 * Get paginated list of webhook delivery logs for a client
 */
export const getClientWebhookDeliveries = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { resolvedClientId } = await resolveAndAuthorizeClient(req, id)

  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20))
  const { status, event } = req.query

  let total = 0
  let deliveries = []

  if (isDbConnected()) {
    const filter = { clientId: resolvedClientId }
    if (status && status !== 'all') filter.status = status
    if (event && event !== 'all') filter.event = event

    total = await WebhookDeliveryLog.countDocuments(filter)
    deliveries = await WebhookDeliveryLog.find(filter)
      .select(
        'deliveryId clientId event postId targetUrl attemptCount maxAttempts status httpStatus errorMessage latencyMs nextRetryAt completedAt createdAt updatedAt'
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
  } else {
    store.webhookDeliveries = store.webhookDeliveries || []
    let list = store.webhookDeliveries.filter((d) => d.clientId === resolvedClientId)
    if (status && status !== 'all') list = list.filter((d) => d.status === status)
    if (event && event !== 'all') list = list.filter((d) => d.event === event)
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    total = list.length
    deliveries = list.slice((page - 1) * limit, page * limit)
  }

  const totalPages = Math.ceil(total / limit) || 1
  return sendSuccess(
    res,
    deliveries,
    'Webhook delivery logs retrieved successfully',
    200,
    {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    }
  )
})

/**
 * Get single webhook delivery log by deliveryId
 */
export const getClientWebhookDeliveryById = asyncHandler(async (req, res, next) => {
  const { id, deliveryId } = req.params
  const { resolvedClientId } = await resolveAndAuthorizeClient(req, id)

  let delivery = null
  if (isDbConnected()) {
    delivery = await WebhookDeliveryLog.findOne({ deliveryId, clientId: resolvedClientId }).lean()
  } else {
    delivery = (store.webhookDeliveries || []).find(
      (d) => d.deliveryId === deliveryId && d.clientId === resolvedClientId
    )
  }

  if (!delivery) {
    return next(new AppError(`Webhook delivery log not found with id: ${deliveryId}`, 404))
  }

  return sendSuccess(res, delivery, 'Webhook delivery log retrieved successfully')
})

/**
 * Trigger immediate manual retry for a webhook delivery log
 */
export const retryClientWebhookDelivery = asyncHandler(async (req, res, next) => {
  const { id, deliveryId } = req.params
  const { resolvedClientId } = await resolveAndAuthorizeClient(req, id)

  const result = await retryWebhookDelivery(deliveryId, resolvedClientId)

  if (result.error === 'not_found') {
    return next(new AppError(`Webhook delivery log not found with id: ${deliveryId}`, 404))
  }
  if (result.error === 'locked') {
    return next(new AppError(result.message || 'Webhook delivery is currently being processed by a worker', 409))
  }

  return sendSuccess(
    res,
    result,
    result.dispatched ? 'Webhook delivery retried successfully' : 'Webhook retry executed and pending further processing',
    200
  )
})

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeJson(str) {
  if (!str) return ''
  return String(str).replace(/"/g, '\\"').replace(/\n/g, ' ')
}

export default {
  getEmbedScript,
  renderEdgeSSRBlog,
  getClientIntegration,
  updateClientIntegration,
  testWebhookPing,
  getClientWebhookDeliveries,
  getClientWebhookDeliveryById,
  retryClientWebhookDelivery,
}

