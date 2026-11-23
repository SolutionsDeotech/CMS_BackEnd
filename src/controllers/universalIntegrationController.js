import asyncHandler from '../utils/asyncHandler.js'
import AppError from '../utils/AppError.js'
import { sendSuccess } from '../utils/helpers.js'
import Client from '../models/Client.js'
import Post from '../models/Post.js'
import WebhookDeliveryLog from '../models/WebhookDeliveryLog.js'
import { isDbConnected } from '../config/db.js'
import store from '../services/store.js'
import { dispatchWebhook, retryWebhookDelivery } from '../services/webhookService.js'
import { getBlogSetupSetting } from '../services/blogSetupSettings.js'
import { safeFetchHtml, validateUrlForSSRF } from '../utils/ssrfValidator.js'
import { resolveClientAliases } from './postsController.js'
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
 * Deotech CMS - Universal Blog Embed Component v2.0
 * Compatible with any website: WordPress, Shopify, Webflow, PHP, .NET, Node.js, static HTML
 */
(function() {
  'use strict';

  var API_BASE = '${process.env.BACKEND_URL || 'https://cms-backend-3fdr.onrender.com'}/api/v1';

  // Synchronous capture of currentScript at script evaluation time
  var currentScriptEl = document.currentScript;
  var scriptClientId = currentScriptEl
    ? (currentScriptEl.getAttribute('data-client-id') ||
       currentScriptEl.getAttribute('data-client') ||
       (function() {
         try {
           var src = currentScriptEl.src || '';
           var q = src.indexOf('?');
           if (q !== -1) {
             var params = new URLSearchParams(src.slice(q));
             return params.get('client') || params.get('clientId');
           }
         } catch(e) {}
         return null;
       })())
    : null;

  var scriptBasePath = currentScriptEl
    ? (currentScriptEl.getAttribute('data-base-path') ||
       (function() {
         try {
           var src = currentScriptEl.src || '';
           var q = src.indexOf('?');
           if (q !== -1) {
             var params = new URLSearchParams(src.slice(q));
             return params.get('basePath') || params.get('path');
           }
         } catch(e) {}
         return null;
       })())
    : null;

  function normalizePath(p) {
    if (!p || p === '/') return '/';
    var clean = String(p).trim().replace(/\\\\+/g, '/').replace(/\\/+$/, '');
    if (!clean.startsWith('/')) clean = '/' + clean;
    return clean || '/';
  }

  function resolveBasePath(container) {
    // 1. Highest Priority: Explicit data-base-path on container
    var explicit = container.getAttribute('data-base-path');
    if (explicit && explicit.trim() && explicit.trim().toLowerCase() !== 'auto') {
      return normalizePath(explicit.trim());
    }

    // 2. Synchronously captured script attribute/param
    if (scriptBasePath && scriptBasePath.trim() && scriptBasePath.trim().toLowerCase() !== 'auto') {
      return normalizePath(scriptBasePath.trim());
    }

    // 3. Optional fallback attribute
    var fallback = container.getAttribute('data-fallback-path') || container.getAttribute('data-blog-path');
    if (fallback && fallback.trim()) {
      return normalizePath(fallback.trim());
    }

    // 4. Safe Current Pathname Inspection
    var currentPath = normalizePath(window.location.pathname || '/');

    // Dedicated blog path heuristic (matches /blog, /blogs, /news, /insights, /articles, /journal, /stories, /posts, /updates, /press)
    var isDedicatedBlog = /(?:^|\\/)(?:blog|blogs|news|insights|articles|journal|stories|posts|updates|press)(?:\\.[a-z0-9]+)?$/i.test(currentPath);
    if (isDedicatedBlog) {
      return currentPath;
    }

    // If query parameters indicate query routing on this page
    var search = window.location.search || '';
    if (search.indexOf('article=') !== -1 || search.indexOf('post=') !== -1 || container.getAttribute('data-routing') === 'query') {
      return currentPath;
    }

    // Safe anchor fallback: anchor to current page path so existing host routes are never broken
    return currentPath;
  }

  function resolveRoutingMode(container, basePath) {
    var explicit = container.getAttribute('data-routing');
    if (explicit === 'query') return 'query';
    if (explicit === 'path') return 'path';

    // 1. If basePath is root '/', default to 'query' routing mode to prevent route collision with host website
    if (basePath === '/') {
      return 'query';
    }

    var search = window.location.search || '';
    if (search.indexOf('article=') !== -1 || search.indexOf('post=') !== -1) {
      return 'query';
    }

    // Clean URL path mode is the default for dedicated paths (/blog, /news, /insights, etc.)
    return 'path';
  }

  function getSlugFromUrl(basePath, routingMode) {
    var search = window.location.search || '';
    var params = new URLSearchParams(search);
    var qSlug = params.get('article') || params.get('post') || params.get('p') || params.get('slug');

    if (routingMode === 'query') {
      return qSlug ? decodeURIComponent(qSlug) : null;
    }

    if (qSlug) {
      return decodeURIComponent(qSlug);
    }

    var pathname = normalizePath(window.location.pathname || '/');
    var cleanBase = normalizePath(basePath || '/');

    if (cleanBase === '/') {
      var segs = pathname.split('/').filter(Boolean);
      if (segs.length === 1) {
        var candidate = decodeURIComponent(segs[0]).toLowerCase();
        var reservedRoutes = ['about', 'services', 'contact', 'pricing', 'team', 'faq', 'terms', 'privacy', 'login', 'signup', 'dashboard', 'admin', 'api', 'cart', 'checkout', 'home', 'careers', 'features', 'product', 'products', 'help', 'support', 'status'];
        if (reservedRoutes.indexOf(candidate) !== -1) {
          return null;
        }
        return decodeURIComponent(segs[0]);
      }
      return null;
    }

    if (pathname === cleanBase) {
      return null;
    }

    // Strict segment boundary check: pathname must start with cleanBase + '/'
    if (pathname.indexOf(cleanBase + '/') === 0) {
      var sub = pathname.slice(cleanBase.length + 1);
      var candidate = sub.split('/')[0];
      return candidate ? decodeURIComponent(candidate) : null;
    }

    return null;
  }

  function buildPostUrl(basePath, slug, routingMode) {
    var encoded = encodeURIComponent(slug);
    if (routingMode === 'query') {
      try {
        var url = new URL(window.location.href);
        url.searchParams.set('article', slug);
        return url.pathname + url.search;
      } catch(e) {
        var sep = basePath.indexOf('?') === -1 ? '?' : '&';
        return basePath + sep + 'article=' + encoded;
      }
    }
    var cleanBase = basePath === '/' ? '' : basePath;
    return cleanBase + '/' + encoded;
  }

  function buildBaseUrl(basePath, routingMode) {
    if (routingMode === 'query') {
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete('article');
        url.searchParams.delete('post');
        url.searchParams.delete('p');
        url.searchParams.delete('slug');
        var res = url.pathname + (url.search ? url.search : '');
        return res || basePath;
      } catch(e) {
        return basePath;
      }
    }
    return basePath;
  }

  function reportBrowserVerification(targetClientId, containerEl, count, detectedBasePath, detectedRouting) {
    try {
      var beaconUrl = API_BASE + '/clients/' + encodeURIComponent(targetClientId) + '/integration/beacon';
      var payload = JSON.stringify({
        url: window.location.href,
        origin: window.location.origin,
        containerId: (containerEl && containerEl.id) ? containerEl.id : 'deotech-blog-feed',
        detectedBasePath: detectedBasePath,
        routingMode: detectedRouting,
        renderedCount: count,
        status: 'success',
        timestamp: Date.now()
      });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(beaconUrl, blob);
      } else {
        fetch(beaconUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          mode: 'cors'
        }).catch(function() {});
      }
    } catch (e) {}
  }

  function renderLoadingSkeleton(container, theme) {
    var cardRadius = (theme && theme.cardRadius) || '12px';
    var html = '<div style="max-width:1200px;margin:0 auto;padding:16px 0;font-family:system-ui,-apple-system,sans-serif;">' +
      '<style>' +
      '@keyframes deotechPulse{0%,100%{opacity:1}50%{opacity:.4}}' +
      '.deotech-skel{background:#f3f4f6;animation:deotechPulse 1.4s ease-in-out infinite;border-radius:4px;}' +
      '</style>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:24px;">';
    for (var i = 0; i < 3; i++) {
      html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:' + cardRadius + ';overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">' +
        '<div class="deotech-skel" style="width:100%;height:180px;border-radius:0;"></div>' +
        '<div style="padding:18px;">' +
        '<div class="deotech-skel" style="width:70px;height:14px;border-radius:9999px;margin-bottom:12px;"></div>' +
        '<div class="deotech-skel" style="width:85%;height:18px;margin-bottom:8px;"></div>' +
        '<div class="deotech-skel" style="width:55%;height:18px;margin-bottom:14px;"></div>' +
        '<div class="deotech-skel" style="width:100%;height:13px;margin-bottom:6px;"></div>' +
        '<div class="deotech-skel" style="width:75%;height:13px;"></div>' +
        '</div></div>';
    }
    html += '</div></div>';
    container.innerHTML = html;
  }

  function loadBlogData(clientId, slug, container, basePath, routingMode) {
    renderLoadingSkeleton(container, container._deotechTheme || {});

    Promise.all([
      fetch(API_BASE + '/clients/' + encodeURIComponent(clientId) + '/theme').then(function(r){ return r.json(); }).catch(function(){ return {}; }),
      slug
        ? fetch(API_BASE + '/posts/' + encodeURIComponent(slug) + '?clientId=' + encodeURIComponent(clientId)).then(function(r){ return r.json(); })
        : fetch(API_BASE + '/posts?clientId=' + encodeURIComponent(clientId) + '&status=published&limit=50').then(function(r){ return r.json(); })
    ]).then(function(results) {
      var theme = (results[0] && results[0].data) || {};
      container._deotechTheme = theme;
      var postData = results[1] || {};

      var primaryColor = theme.primaryColor || '#6b0d0d';
      var textColor = theme.textColor || '#1f2937';
      var fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';

      if (slug) {
        if (!postData.success || !postData.data) {
          // If mounted on root '/' in explicit clean-path mode and article was not found, this is an ambiguous website route:
          // Safely fall back to rendering the post grid instead of trapping the page in an "Article Not Found" box!
          if (basePath === '/' && routingMode === 'path') {
            fetch(API_BASE + '/posts?clientId=' + encodeURIComponent(clientId) + '&status=published&limit=50')
              .then(function(r){ return r.json(); })
              .then(function(listData) {
                var list = (listData && listData.success && Array.isArray(listData.data)) ? listData.data : [];
                renderPostGrid(container, list, theme, basePath, routingMode, clientId);
              })
              .catch(function() {
                renderPostGrid(container, [], theme, basePath, routingMode, clientId);
              });
            return;
          }

          var backUrl = buildBaseUrl(basePath, routingMode);
          container.innerHTML = '<div style="padding:30px;text-align:center;font-family:'+fontFamily+';"><h3 style="color:'+textColor+';">Article Not Found</h3><p style="color:#6b7280;font-size:14px;">The requested article is not available.</p><a href="'+backUrl+'" id="deotech-not-found-back" style="display:inline-block;margin-top:12px;padding:8px 16px;background:'+primaryColor+';color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;">← Return to Blog</a></div>';
          var notFoundBack = container.querySelector('#deotech-not-found-back');
          if (notFoundBack) {
            notFoundBack.addEventListener('click', function(e) {
              e.preventDefault();
              window.history.pushState({}, '', backUrl);
              loadBlogData(clientId, null, container, basePath, routingMode);
            });
          }
          return;
        }
        renderSinglePost(container, postData.data, theme, basePath, routingMode, clientId);
        reportBrowserVerification(clientId, container, 1, basePath, routingMode);
      } else {
        var posts = (postData.success && Array.isArray(postData.data)) ? postData.data : [];
        renderPostGrid(container, posts, theme, basePath, routingMode, clientId);
        reportBrowserVerification(clientId, container, posts.length, basePath, routingMode);
      }
    }).catch(function(err) {
      container.innerHTML = '<div style="padding:20px;color:#b91c1c;background:#fef2f2;border:1px solid #f87171;border-radius:8px;font-family:sans-serif;font-size:13px;">Unable to load blog feed. Please check connectivity.</div>';
    });
  }

  function renderPostGrid(container, posts, theme, basePath, routingMode, clientId) {
    var primaryColor = theme.primaryColor || '#6b0d0d';
    var textColor = theme.textColor || '#1f2937';
    var fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';
    var cardRadius = theme.cardRadius || '12px';

    // Restore original document title if changed during single post view
    if (container._origDocTitle) {
      document.title = container._origDocTitle;
    }

    var html = '<div style="font-family:' + fontFamily + ';color:' + textColor + ';max-width:1200px;margin:0 auto;padding:16px 0;">';

    if (posts.length === 0) {
      html += '<div style="text-align:center;padding:60px 20px;background:#f9fafb;border-radius:' + cardRadius + ';border:1px solid #e5e7eb;"><p style="font-size:16px;color:#4b5563;margin:0 0 6px 0;font-weight:600;">No articles published yet</p><p style="font-size:13px;color:#9ca3af;margin:0;">Articles published in your Deotech CMS will appear here instantly.</p></div>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:24px;">';
      posts.forEach(function(post) {
        var postUrl = buildPostUrl(basePath, post.slug || post.id, routingMode);
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
        html += '<div style="border-top:1px solid #f3f4f6;padding-top:12px;display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#9ca3af;">';
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
        loadBlogData(clientId, targetSlug, container, basePath, routingMode);
      });
    });
  }

  function renderSinglePost(container, post, theme, basePath, routingMode, clientId) {
    var primaryColor = theme.primaryColor || '#6b0d0d';
    var textColor = theme.textColor || '#1f2937';
    var fontFamily = theme.fontFamily || 'system-ui, -apple-system, sans-serif';
    var backUrl = buildBaseUrl(basePath, routingMode);

    if (!container._origDocTitle) {
      container._origDocTitle = document.title;
    }
    if (post.title) {
      document.title = post.title + ' | ' + container._origDocTitle;
    }

    try {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch(e) {}

    var html = '<div style="font-family:' + fontFamily + ';color:' + textColor + ';max-width:860px;margin:0 auto;padding:20px 0;">';
    html += '<a href="' + backUrl + '" id="deotech-back-link" style="display:inline-flex;align-items:center;color:' + primaryColor + ';text-decoration:none;font-size:13px;font-weight:600;margin-bottom:20px;">← Back to All Articles</a>';

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
    html += '<a href="' + backUrl + '" id="deotech-back-link-bottom" style="display:inline-block;padding:10px 20px;background:' + primaryColor + ';color:#fff;text-decoration:none;border-radius:9999px;font-size:13px;font-weight:600;">← Back to Articles</a>';
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;

    var backLinks = [container.querySelector('#deotech-back-link'), container.querySelector('#deotech-back-link-bottom')];
    backLinks.forEach(function(btn) {
      if (btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          window.history.pushState({}, '', backUrl);
          loadBlogData(clientId, null, container, basePath, routingMode);
        });
      }
    });
  }

  function initSingleContainer(container, isMultiple) {
    if (container._deotechInitialized) return;
    container._deotechInitialized = true;

    var containerClientId = container.getAttribute('data-client-id') || container.getAttribute('data-client');
    var clientId = containerClientId;

    // Strict multi-container isolation: If multiple containers exist, do not fall back to script/global clientId
    if (!clientId && !isMultiple) {
      clientId = scriptClientId || window.DEOTECH_CMS_CLIENT_ID || '';
    }

    if (!clientId) {
      container.innerHTML = '<div style="padding:16px;color:#b91c1c;background:#fef2f2;border:1px solid #f87171;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;"><strong>Deotech CMS Error:</strong> <code>data-client-id</code> is missing on container element.</div>';
      return;
    }

    var basePath = resolveBasePath(container);
    var routingMode = resolveRoutingMode(container, basePath);

    window.addEventListener('popstate', function() {
      var slug = getSlugFromUrl(basePath, routingMode);
      loadBlogData(clientId, slug, container, basePath, routingMode);
    });

    var initialSlug = getSlugFromUrl(basePath, routingMode);
    loadBlogData(clientId, initialSlug, container, basePath, routingMode);
  }

  function initDeotechBlog() {
    var containers = document.querySelectorAll('#deotech-blog-feed, [data-deotech-blog], .deotech-blog-feed');
    if (!containers || containers.length === 0) return;

    var isMultiple = containers.length > 1;
    for (var i = 0; i < containers.length; i++) {
      initSingleContainer(containers[i], isMultiple);
    }
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

  // Load configured tracking and analytics IDs
  const seoConfig = client.onboarding?.seo || {}
  const intConfig = await getBlogSetupSetting('integration-settings', client.customId || String(client._id || client.id || ''), {}).catch(() => ({}))
  const gaId = (seoConfig.gaMeasurementId || intConfig.googleAnalytics?.measurementId || '').trim()
  const gscTag = (seoConfig.gscVerificationTag || intConfig.googleSearchConsole?.verificationTag || '').trim()
  const gtmId = (seoConfig.gtmContainerId || intConfig.googleTagManager?.containerId || '').trim()
  const pixelId = (seoConfig.metaPixelId || intConfig.metaPixel?.pixelId || '').trim()

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}">
  <link rel="canonical" href="${canonicalUrl}">
  ${gscTag ? (gscTag.includes('<meta') ? gscTag : `<meta name="google-site-verification" content="${escapeHtml(gscTag.replace(/^google-site-verification=/i, ''))}">`) : ''}

  <!-- OpenGraph & Social Metadata -->
  <meta property="og:type" content="${activePost ? 'article' : 'website'}">
  <meta property="og:title" content="${escapeHtml(pageTitle)}">
  <meta property="og:description" content="${escapeHtml(metaDescription)}">
  <meta property="og:url" content="${canonicalUrl}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  <meta name="twitter:card" content="summary_large_image">

  ${gaId ? `<!-- Google Analytics 4 (GA4) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(gaId)}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${escapeHtml(gaId)}');
  </script>` : ''}

  ${gtmId ? `<!-- Google Tag Manager (GTM) -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','${escapeHtml(gtmId)}');</script>` : ''}

  ${pixelId ? `<!-- Meta Pixel Code -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${escapeHtml(pixelId)}');
  fbq('track', 'PageView');
  </script>` : ''}

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
 * Supported canonical integration methods and their allowed aliases.
 */
export const SUPPORTED_INTEGRATION_METHODS = {
  'headless-api': ['headless-api', 'headless', 'api', 'rest-api', 'direct-api'],
  'hosted': ['hosted', 'ssr', 'reverse-proxy', 'proxy'],
  'embed': ['embed', 'zero-code', 'wordpress'],
}

/**
 * Validates a method string against supported canonical methods and aliases.
 * Returns the canonical method ('headless-api', 'hosted', 'embed') or null if empty/omitted, or false if invalid.
 */
export function parseIntegrationMethod(rawMethod) {
  if (rawMethod === undefined || rawMethod === null) return null
  const m = String(rawMethod).trim().toLowerCase()
  if (!m) return null
  for (const [canonical, aliases] of Object.entries(SUPPORTED_INTEGRATION_METHODS)) {
    if (aliases.includes(m)) {
      return canonical
    }
  }
  return false
}

/**
 * Normalizes user-specified or saved integration method strings into standard identifiers:
 * - 'headless-api' (Direct REST API)
 * - 'embed' (Universal Drop-in Script)
 * - 'hosted' (Edge Reverse Proxy / SSR)
 */
export function normalizeIntegrationMethod(rawMethod) {
  const parsed = parseIntegrationMethod(rawMethod)
  if (parsed) return parsed
  return 'embed'
}

/**
 * Resolves the active integration method for a client by inspecting:
 * 1. Explicit requested method in request body (if valid)
 * 2. client.integrationSettings?.method
 * 3. client.onboarding?.wizard?.integrationMethod
 * 4. global onboarding-websites setting in MongoDB
 * Defaults to 'embed' if not configured.
 */
export async function resolveClientIntegrationMethod(client, requestedMethod = null) {
  if (requestedMethod !== null && requestedMethod !== undefined && String(requestedMethod).trim()) {
    const parsed = parseIntegrationMethod(requestedMethod)
    if (parsed) return parsed
  }
  if (client?.integrationSettings?.method) {
    const parsed = parseIntegrationMethod(client.integrationSettings.method)
    if (parsed) return parsed
  }
  if (client?.onboarding?.wizard?.integrationMethod) {
    const parsed = parseIntegrationMethod(client.onboarding.wizard.integrationMethod)
    if (parsed) return parsed
  }
  try {
    const onboardingWebsites = await getBlogSetupSetting('onboarding-websites', 'global', {})
    const key = client?.customId || String(client?._id || client?.id || '')
    if (onboardingWebsites?.[key]?.wizard?.integrationMethod) {
      const parsed = parseIntegrationMethod(onboardingWebsites[key].wizard.integrationMethod)
      if (parsed) return parsed
    }
  } catch {}
  return 'embed'
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

  const method = normalizeIntegrationMethod(
    raw.method || client?.onboarding?.wizard?.integrationMethod || 'embed'
  )

  return {
    method,
    blogPath: effectiveBlogPath,
    webhookUrl: raw.webhookUrl || '',
    hasWebhookSecret,
    webhookSecretMasked: maskedSecret,
    hasApiKey,
    apiKeyMasked: maskedApiKey,
    verification: raw.verification || null,
    browserVerification: raw.browserVerification || null,
    connectionStatus: raw.connectionStatus || 'not_configured',
    lastVerifiedAt: raw.lastVerifiedAt || null,
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
 * Endpoint: PUT /api/v1/clients/:id/integration
 * STRICT SEPARATION: This is the ONLY endpoint responsible for permanently saving integrationSettings.method.
 */
export const updateClientIntegration = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { client, resolvedClientId } = await resolveAndAuthorizeClient(req, id)
  const { method, blogPath, webhookUrl, webhookSecret } = req.body

  const safeBlogPath = normalizeBlogPath(blogPath || client.integrationSettings?.blogPath || '/blog')
  const currentMethod = await resolveClientIntegrationMethod(client)

  let safeMethod = currentMethod
  if (method !== undefined && method !== null && String(method).trim()) {
    const parsedMethod = parseIntegrationMethod(method)
    if (!parsedMethod) {
      return next(
        new AppError(
          `Invalid integration method '${method}'. Supported methods: 'headless-api', 'embed', 'hosted'.`,
          400
        )
      )
    }
    safeMethod = parsedMethod
  }

  const updates = {
    'integrationSettings.method': safeMethod,
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
    client.integrationSettings.method = safeMethod
    client.integrationSettings.blogPath = safeBlogPath
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

/**
 * Records live browser-side verification beacon sent by embed script.
 * Called when blog feed or single post successfully mounts in visitor's browser.
 */
export const recordClientVerificationBeacon = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  let client = null

  if (isDbConnected()) {
    client = await Client.findOne({
      $or: [
        { customId: id },
        { websiteUrl: id },
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
      ],
    })
  } else {
    client = store.clients?.find(
      (c) => c.customId === id || c.id === id || c.websiteUrl === id || String(c._id) === id
    )
  }

  if (!client) {
    return next(new AppError(`Client not found with id: ${id}`, 404))
  }

  const { url = '', origin = '', containerId = 'deotech-blog-feed', renderedCount = 0, detectedBasePath = '', routingMode = '' } = req.body || {}

  // Validate beacon origin against client's registered domain to prevent spoofing
  const incomingOrigin = String(origin || req.headers?.origin || '').trim().toLowerCase()
  const cleanIncomingHost = incomingOrigin.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split(':')[0]

  const registeredUrl = (client.websiteUrl || '').trim().toLowerCase()
  const cleanRegisteredHost = registeredUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split(':')[0]

  const isLocalHost = cleanIncomingHost === 'localhost' || cleanIncomingHost === '127.0.0.1' || cleanIncomingHost.startsWith('127.')
  const isRegisteredMatch = cleanIncomingHost && cleanIncomingHost === cleanRegisteredHost
  const isAllowedOrigin = Array.isArray(client.integrationSettings?.allowedOrigins) &&
    client.integrationSettings.allowedOrigins.some((ao) => {
      const cleanAo = String(ao).toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split(':')[0]
      return cleanAo === cleanIncomingHost
    })

  if (!isRegisteredMatch && !isAllowedOrigin && !(process.env.NODE_ENV !== 'production' && isLocalHost)) {
    return next(new AppError('Unauthorized beacon origin: Origin does not match client registered domain', 403, {
      code: 'BEACON_ORIGIN_MISMATCH',
    }))
  }

  const nowIso = new Date().toISOString()

  const browserVerification = {
    verified: true,
    lastBeaconAt: nowIso,
    url: String(url).slice(0, 500),
    origin: String(origin).slice(0, 200),
    containerId: String(containerId).slice(0, 100),
    detectedBasePath: String(detectedBasePath || '').slice(0, 200),
    routingMode: String(routingMode || '').slice(0, 50),
    renderedCount: Number(renderedCount) || 0,
    status: 'success',
  }

  const prevVerification = client.integrationSettings?.verification || null
  const updates = {
    'integrationSettings.browserVerification': browserVerification,
  }

  // If server-side verification already passed, upgrade overall status to connected
  if (prevVerification && (prevVerification.overallStatus === 'partially_connected' || prevVerification.overallStatus === 'connected')) {
    updates['integrationSettings.connectionStatus'] = 'connected'
    updates['integrationSettings.verification.overallStatus'] = 'connected'
    if (updates['integrationSettings.verification.checks']?.browserVerification) {
      updates['integrationSettings.verification.checks.browserVerification.status'] = 'passed'
      updates['integrationSettings.verification.checks.browserVerification.lastReportedAt'] = nowIso
    }
  }

  if (isDbConnected()) {
    await Client.findByIdAndUpdate(client._id, { $set: updates })
  } else {
    if (!client.integrationSettings) client.integrationSettings = {}
    client.integrationSettings.browserVerification = browserVerification
    if (prevVerification) {
      prevVerification.overallStatus = 'connected'
      if (prevVerification.checks?.browserVerification) {
        prevVerification.checks.browserVerification.status = 'passed'
        prevVerification.checks.browserVerification.lastReportedAt = nowIso
      }
    }
    client.integrationSettings.connectionStatus = 'connected'
  }

  return sendSuccess(res, { recorded: true, timestamp: nowIso }, 'Browser verification beacon recorded', 200)
})

/**
 * Phase 1: Automated Live Website Connection Verification (Method-Aware)
 * Endpoint: POST /api/v1/clients/:id/integration/verify-live
 * STRICT SEPARATION: Diagnostic only. NEVER modifies integrationSettings.method.
 * Performs multi-layer audit based on the client's integration method:
 * - Direct REST API ('headless-api'): Checks domain reachability, CMS public API connectivity, and published content count.
 * - Drop-in Embed ('embed'): Checks domain reachability, embed script tag, blog container, CMS API, published content, and browser beacon.
 * - Edge Reverse Proxy ('hosted'): Checks domain reachability, SSR reverse-proxy signatures, CMS API, and published content.
 * Statuses: 'connected', 'partially_connected', 'failed', 'not_configured'.
 */
export const verifyLiveWebsiteIntegration = asyncHandler(async (req, res, next) => {
  const { id } = req.params
  const { client, resolvedClientId } = await resolveAndAuthorizeClient(req, id)

  const websiteUrl = (client.websiteUrl || '').trim()
  const nowIso = new Date().toISOString()

  // Validate requested method if explicitly provided
  if (req.body?.method !== undefined && req.body?.method !== null && String(req.body.method).trim()) {
    const parsedMethod = parseIntegrationMethod(req.body.method)
    if (!parsedMethod) {
      return next(
        new AppError(
          `Invalid integration method '${req.body.method}'. Supported methods: 'headless-api', 'embed', 'hosted'.`,
          400
        )
      )
    }
  }

  // Resolve integration method (diagnostic verification only; never saved as permanent method from this endpoint)
  const effectiveMethod = await resolveClientIntegrationMethod(client, req.body?.method)
  const methodLabel =
    effectiveMethod === 'headless-api'
      ? 'Direct REST API'
      : effectiveMethod === 'hosted'
      ? 'Edge Reverse-Proxy (SSR)'
      : 'Universal Drop-in Embed'

  const effectiveBlogPath = normalizeBlogPath(client.integrationSettings?.blogPath || client.blogPath || '/blog')

  // If websiteUrl is missing, return clear 'not_configured' status
  if (!websiteUrl) {
    const notConfiguredReport = {
      verifiedAt: nowIso,
      method: effectiveMethod,
      methodLabel,
      targetUrl: '',
      websiteUrl: '',
      blogPath: effectiveBlogPath,
      overallStatus: 'not_configured',
      checks: {
        domainReachable: {
          status: 'pending',
          httpStatus: null,
          latencyMs: null,
          message: 'Website URL is not configured.',
        },
        apiConnectivity: {
          status: 'pending',
          endpoint: `/api/v1/posts?clientId=${resolvedClientId}`,
          message: 'Awaiting website configuration.',
        },
        publishedContent: {
          status: 'pending',
          count: 0,
          message: 'Awaiting website configuration.',
        },
      },
      instructions: [
        'Please configure your registered Website URL in Client Settings before running verification.',
      ],
    }
    return sendSuccess(res, notConfiguredReport, 'Website connection verification: Not Configured', 200)
  }

  // Construct target verification URL
  let targetUrl
  try {
    const baseOrigin = websiteUrl.replace(/\/+$/, '')
    // For headless-api, probe baseOrigin; for embed and hosted, probe baseOrigin + blogPath
    targetUrl = effectiveMethod === 'headless-api' ? baseOrigin : `${baseOrigin}${effectiveBlogPath}`
    new URL(targetUrl) // validate URL syntax
  } catch (err) {
    return next(new AppError(`Invalid website or blog URL format: ${websiteUrl}${effectiveBlogPath}`, 400))
  }

  const checks = {
    domainReachable: {
      status: 'pending',
      httpStatus: null,
      latencyMs: null,
      message: 'Checking domain reachability...',
    },
    apiConnectivity: {
      status: 'pending',
      endpoint: `/api/v1/posts?clientId=${resolvedClientId}`,
      message: 'Checking public CMS API connectivity...',
    },
    publishedContent: {
      status: 'pending',
      count: 0,
      message: 'Checking published articles count...',
    },
  }

  const instructions = []
  let htmlBody = ''

  // 1. Domain Reachability & HTML Fetch with SSRF Guards
  try {
    const fetchResult = await safeFetchHtml(targetUrl, {
      timeoutMs: 7000,
      maxRedirects: 3,
      maxBytes: 512 * 1024,
      allowLocalInTest: true,
    })

    checks.domainReachable.httpStatus = fetchResult.status
    checks.domainReachable.latencyMs = fetchResult.latencyMs

    if (fetchResult.status >= 200 && fetchResult.status < 400) {
      checks.domainReachable.status = 'passed'
      checks.domainReachable.message = `Domain responded with HTTP ${fetchResult.status} (${fetchResult.latencyMs}ms).`
      htmlBody = fetchResult.text
    } else {
      checks.domainReachable.status = 'failed'
      checks.domainReachable.message = `Target URL returned HTTP status ${fetchResult.status} ${fetchResult.statusText || ''}.`
      instructions.push(`Your server at ${targetUrl} returned HTTP ${fetchResult.status}. Ensure the page exists and is publicly accessible without basic auth or firewalls.`)
    }
  } catch (err) {
    checks.domainReachable.status = 'failed'
    checks.domainReachable.code = err.code || 'ERR_FETCH_FAILED'
    checks.domainReachable.message = err.message || 'Could not reach target URL'

    if (err.code === 'ERR_SSRF_BLOCKED') {
      instructions.push(`SSRF Security Guard Blocked: The domain points to an internal or private IP address (${err.ip || 'private network'}). Real external websites must point to a public IP.`)
    } else if (err.code === 'ERR_REQUEST_TIMEOUT') {
      instructions.push(`Connection timed out after 7 seconds. Ensure your server is online, firewall allows incoming connections, and responds promptly.`)
    } else if (err.code === 'ERR_DNS_RESOLUTION_FAILED' || err.code === 'ERR_DNS_LOOKUP_ERROR') {
      instructions.push(`DNS lookup failed. Please verify that the domain name is registered and has active DNS records (A/AAAA/CNAME).`)
    } else {
      instructions.push(`Network connection failed: ${err.message}. Please verify the website URL.`)
    }
  }

  // 2. CMS Public API Connectivity & Published Content Check
  let publishedCount = 0
  try {
    const aliases = await resolveClientAliases(resolvedClientId)
    const filter = {
      status: 'published',
      clientId: aliases.length === 1 ? aliases[0] : { $in: aliases },
    }

    if (isDbConnected()) {
      publishedCount = await Post.countDocuments(filter)
    } else {
      publishedCount = (store.posts || []).filter(
        (p) => p.status === 'published' && aliases.includes(p.clientId)
      ).length
    }

    checks.apiConnectivity.status = 'passed'
    checks.apiConnectivity.message = 'Public CMS API endpoint is operational and reachable for this tenant.'

    checks.publishedContent.count = publishedCount
    if (publishedCount > 0) {
      checks.publishedContent.status = 'passed'
      checks.publishedContent.message = `${publishedCount} published article${publishedCount > 1 ? 's' : ''} available and ready to display.`
    } else {
      checks.publishedContent.status = 'warning'
      checks.publishedContent.message = '0 published articles found for this website.'
      instructions.push(`No published articles found. Create and publish at least one article in Content Management so visitors have articles to read on your blog.`)
    }
  } catch (err) {
    checks.apiConnectivity.status = 'failed'
    checks.apiConnectivity.message = `API Connectivity error: ${err.message}`
    checks.publishedContent.status = 'failed'
  }

  // 3. Method-Specific Checks & Overall Status Calculation
  let overallStatus = 'failed'

  if (effectiveMethod === 'headless-api') {
    // DIRECT REST API VERIFICATION
    checks.restApiVerified = {
      status: checks.apiConnectivity.status === 'passed' ? 'passed' : 'failed',
      endpoint: `/api/v1/posts?clientId=${resolvedClientId}`,
      message:
        checks.apiConnectivity.status === 'passed'
          ? 'Direct REST API operational: External website consumes content headlessly via JSON endpoints.'
          : 'Public CMS REST API failed to respond.',
    }
    checks.embedScriptDetected = {
      status: 'not_applicable',
      scriptDetected: null,
      message: 'Not required for Direct REST API (Client renders content using custom frontend).',
    }
    checks.containerDetected = {
      status: 'not_applicable',
      containerFound: null,
      containerId: null,
      message: 'Not required for Direct REST API (Layout managed entirely by client code).',
    }
    checks.browserVerification = {
      status: 'not_applicable',
      lastReportedAt: null,
      message: 'Browser embed beacon not required for Headless REST API mode.',
    }

    const isApiReady =
      checks.domainReachable.status === 'passed' &&
      checks.apiConnectivity.status === 'passed'

    if (isApiReady && checks.publishedContent.count > 0) {
      overallStatus = 'connected'
    } else if (isApiReady) {
      overallStatus = 'partially_connected'
      instructions.push('Publish at least one article in Content Management so your frontend has content to fetch and display.')
    } else {
      overallStatus = 'failed'
    }
  } else if (effectiveMethod === 'hosted') {
    // EDGE REVERSE PROXY (SSR) VERIFICATION
    const hasSsrSignature =
      Boolean(htmlBody) &&
      (/"@type":\s*"BlogPosting"/i.test(htmlBody) ||
        htmlBody.includes('deotech-post-body') ||
        htmlBody.includes('deotech-back-link') ||
        (htmlBody.includes('card') && htmlBody.includes(effectiveBlogPath)))

    checks.ssrRouteVerified = {
      status: hasSsrSignature ? 'passed' : 'failed',
      proxyTarget: `/api/v1/sites/${resolvedClientId}/blog`,
      message: hasSsrSignature
        ? 'Edge SSR reverse proxy verified: Server-rendered HTML returned from origin domain.'
        : 'Reverse proxy did not return expected Deotech SSR blog markup.',
    }
    checks.embedScriptDetected = {
      status: 'not_applicable',
      scriptDetected: null,
      message: 'Not required for SSR Reverse Proxy (100% server-side HTML rendering).',
    }
    checks.containerDetected = {
      status: hasSsrSignature ? 'passed' : 'failed',
      containerFound: hasSsrSignature,
      containerId: 'ssr-container',
      message: hasSsrSignature
        ? 'Server-side rendered blog container markup verified.'
        : 'Reverse proxy container markup not detected.',
    }
    checks.browserVerification = {
      status: 'not_applicable',
      lastReportedAt: null,
      message: 'Server-side rendered natively: No client-side browser beacon required.',
    }

    if (!hasSsrSignature && checks.domainReachable.status === 'passed') {
      instructions.push(`Configure your web server (Nginx, Apache, Cloudflare, PHP, Node.js) to reverse-proxy ${effectiveBlogPath} to ${process.env.BACKEND_URL || 'https://cms-backend-3fdr.onrender.com'}/api/v1/sites/${resolvedClientId}/blog`)
    }

    const isSsrReady =
      checks.domainReachable.status === 'passed' &&
      hasSsrSignature &&
      checks.apiConnectivity.status === 'passed'

    if (isSsrReady && checks.publishedContent.count > 0) {
      overallStatus = 'connected'
    } else if (isSsrReady) {
      overallStatus = 'partially_connected'
      instructions.push('Publish at least one article in Content Management so your blog has content to render.')
    } else {
      overallStatus = 'failed'
    }
  } else {
    // DROP-IN EMBED VERIFICATION ('embed')
    checks.embedScriptDetected = {
      status: 'pending',
      scriptDetected: false,
      message: 'Inspecting HTML for universal embed script...',
    }
    checks.containerDetected = {
      status: 'pending',
      containerFound: false,
      containerId: null,
      message: 'Inspecting HTML for blog container element...',
    }
    checks.browserVerification = {
      status: 'pending',
      lastReportedAt: null,
      message: 'Checking live browser execution status...',
    }

    if (checks.domainReachable.status === 'passed' && htmlBody) {
      const hasEmbedScript =
        /<script[^>]+src=["'][^"']*(?:embed\/v1\/blog\.js|embed\/blog\.js)[^"']*["']/i.test(htmlBody) ||
        /<script[^>]+src=["'][^"']*\/embed\/[^"']*blog\.js[^"']*["']/i.test(htmlBody) ||
        (htmlBody.includes('deotech-blog-feed') && htmlBody.includes('blog.js'))

      const hasContainerFeed =
        /<(?:div|main|section|article)[^>]+id=["']deotech-blog-feed["']/i.test(htmlBody)
      const hasDataBlog =
        /<(?:div|main|section|article)[^>]+data-deotech-blog/i.test(htmlBody)
      const hasClientAttr =
        new RegExp(`data-client-id=["']${resolvedClientId}["']`, 'i').test(htmlBody)

      if (hasEmbedScript) {
        checks.embedScriptDetected.status = 'passed'
        checks.embedScriptDetected.scriptDetected = true
        checks.embedScriptDetected.message = 'Universal embed script tag detected on page.'
      } else {
        checks.embedScriptDetected.status = 'failed'
        checks.embedScriptDetected.scriptDetected = false
        checks.embedScriptDetected.message = 'Universal embed script (<script src=".../blog.js">) was not found in page HTML.'
        instructions.push(`Add the embed script <script src="${process.env.BACKEND_URL || 'https://cms-backend-3fdr.onrender.com'}/embed/v1/blog.js" async></script> right before the closing </body> tag of your blog page.`)
      }

      if (hasContainerFeed || hasDataBlog || hasClientAttr) {
        checks.containerDetected.status = 'passed'
        checks.containerDetected.containerFound = true
        checks.containerDetected.containerId = hasContainerFeed ? 'deotech-blog-feed' : (hasDataBlog ? 'data-deotech-blog' : 'client-container')
        checks.containerDetected.message = `Blog container found (<div id="${checks.containerDetected.containerId}">).`
      } else {
        checks.containerDetected.status = 'failed'
        checks.containerDetected.containerFound = false
        checks.containerDetected.message = 'Blog container element (<div id="deotech-blog-feed">) was not found in page HTML.'
        instructions.push(`Add the container tag <div id="deotech-blog-feed" data-client-id="${resolvedClientId}" data-base-path="${effectiveBlogPath}"></div> where you want your blog feed to display.`)
      }
    } else {
      checks.embedScriptDetected.status = 'failed'
      checks.embedScriptDetected.message = 'Could not inspect HTML because domain was unreachable.'
      checks.containerDetected.status = 'failed'
      checks.containerDetected.message = 'Could not inspect HTML because domain was unreachable.'
    }

    // Browser-Side Verification Check
    const browserData = client.integrationSettings?.browserVerification || null
    if (browserData && browserData.verified) {
      checks.browserVerification.status = 'passed'
      checks.browserVerification.lastReportedAt = browserData.lastBeaconAt || browserData.timestamp || null
      checks.browserVerification.message = `Browser-side execution confirmed live (rendered ${browserData.renderedCount || 0} post(s) from ${browserData.origin || 'client website'}).`
    } else {
      checks.browserVerification.status = 'pending'
      checks.browserVerification.message = 'Waiting for live browser visit: Server HTML checks completed. Open your blog in a browser once to confirm client-side rendering.'
      if (checks.domainReachable.status === 'passed' && checks.embedScriptDetected.status === 'passed' && checks.containerDetected.status === 'passed') {
        instructions.push(`To complete full verification, visit your live blog page (${targetUrl}) in your browser once. The embed script will report live execution back to CMS.`)
      }
    }

    const isServerPassed =
      checks.domainReachable.status === 'passed' &&
      checks.embedScriptDetected.status === 'passed' &&
      checks.containerDetected.status === 'passed' &&
      checks.apiConnectivity.status === 'passed'

    if (isServerPassed && checks.browserVerification.status === 'passed') {
      overallStatus = 'connected'
    } else if (isServerPassed) {
      overallStatus = 'partially_connected'
    } else {
      overallStatus = 'failed'
    }
  }

  const verificationReport = {
    verifiedAt: nowIso,
    method: effectiveMethod,
    methodLabel,
    targetUrl,
    websiteUrl,
    blogPath: effectiveBlogPath,
    overallStatus,
    checks,
    instructions,
  }

  // Persist verification diagnostic report to client record (STRICT SEPARATION: NEVER write integrationSettings.method)
  try {
    const updateFields = {
      'integrationSettings.verification': verificationReport,
      'integrationSettings.lastVerifiedAt': nowIso,
      'integrationSettings.connectionStatus': overallStatus,
    }
    if (isDbConnected()) {
      await Client.findByIdAndUpdate(client._id, { $set: updateFields })
    } else {
      if (!client.integrationSettings) client.integrationSettings = {}
      client.integrationSettings.verification = verificationReport
      client.integrationSettings.lastVerifiedAt = nowIso
      client.integrationSettings.connectionStatus = overallStatus
    }
  } catch (err) {
    console.warn('Could not persist verification report:', err.message)
  }

  return sendSuccess(res, verificationReport, 'Website connection verification completed', 200)
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
  verifyLiveWebsiteIntegration,
  recordClientVerificationBeacon,
  getClientWebhookDeliveries,
  getClientWebhookDeliveryById,
  retryClientWebhookDelivery,
  SUPPORTED_INTEGRATION_METHODS,
  parseIntegrationMethod,
  normalizeIntegrationMethod,
  resolveClientIntegrationMethod,
}

