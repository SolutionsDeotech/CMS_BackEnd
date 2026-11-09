import { Router } from 'express'
import { swaggerDocument } from '../config/swaggerSpec.js'

export const swaggerRouter = Router()

// Serve raw formatted OpenAPI JSON specification
swaggerRouter.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.send(JSON.stringify(swaggerDocument, null, 2))
})

// Serve interactive Swagger UI HTML directly with modern CDN assets & relaxed CSP
swaggerRouter.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' https: http: 'unsafe-inline' 'unsafe-eval' data: blob:; script-src 'self' https: 'unsafe-inline' 'unsafe-eval'; style-src 'self' https: 'unsafe-inline'; font-src 'self' https: data:; img-src 'self' https: http: data: blob:; connect-src 'self' https: http:;"
  )

  const specJsonString = JSON.stringify(swaggerDocument).replace(/<\/script>/gi, '<\\/script>')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deotech CMS REST API - Interactive Swagger UI</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css" />
  <link rel="icon" type="image/png" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/favicon-32x32.png" sizes="32x32" />
  <style>
    html {
      box-sizing: border-box;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1e293b;
    }
    .topbar {
      display: none !important;
    }
    .custom-header {
      background: #6b0d0d;
      color: #ffffff;
      padding: 16px 28px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      box-shadow: 0 4px 12px rgba(107, 13, 13, 0.18);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .custom-header h1 {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .badge {
      background: rgba(255,255,255,0.22);
      border: 1px solid rgba(255,255,255,0.3);
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .header-btn {
      color: #ffffff;
      text-decoration: none;
      font-size: 12.5px;
      font-weight: 600;
      padding: 7px 14px;
      border-radius: 9999px;
      background: rgba(255,255,255,0.16);
      border: 1px solid rgba(255,255,255,0.28);
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .header-btn:hover {
      background: #ffffff;
      color: #6b0d0d;
      border-color: #ffffff;
      transform: translateY(-1px);
    }
    .swagger-ui .wrapper {
      max-width: 1360px;
      margin: 0 auto;
      padding: 0 20px;
    }
    .swagger-ui .info {
      margin: 24px 0;
    }
    .swagger-ui .info .title {
      font-size: 26px;
      color: #6b0d0d;
    }
    .swagger-ui .scheme-container {
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      border-radius: 12px;
      margin-bottom: 24px;
      padding: 16px 20px;
      border: 1px solid #e2e8f0;
    }
    .swagger-ui .opblock {
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .swagger-ui .opblock .opblock-summary {
      padding: 10px 16px;
    }
    .swagger-ui .btn.authorize {
      color: #0f766e;
      border-color: #0f766e;
      border-radius: 9999px;
      font-weight: 600;
    }
    .swagger-ui .btn.authorize svg {
      fill: #0f766e;
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <div class="header-left">
      <h1>
        <span>⚡ Deotech Solutions</span>
        <span style="font-weight:400; opacity:0.85;">Enterprise CMS API</span>
      </h1>
      <span class="badge">OpenAPI 3.0</span>
      <span class="badge">15 Modules</span>
    </div>
    <div class="header-actions">
      <a href="/api/v1/openapi.json" target="_blank" class="header-btn" title="View formatted JSON specification">
        📄 Raw OpenAPI JSON
      </a>
      <a href="/api/v1/health" target="_blank" class="header-btn" title="Inspect system health status">
        🩺 Health Probe
      </a>
      <button type="button" class="header-btn" id="downloadSpecBtn" title="Download openapi.json file">
        📥 Download Spec
      </button>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js"></script>
  <script>
    // Fallback loader if primary CDN fails
    function initSwagger() {
      if (typeof SwaggerUIBundle === 'undefined') {
        const script1 = document.createElement('script');
        script1.src = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js';
        script1.onload = () => {
          const script2 = document.createElement('script');
          script2.src = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js';
          script2.onload = startUi;
          document.body.appendChild(script2);
        };
        document.body.appendChild(script1);
      } else {
        startUi();
      }
    }

    const swaggerSpec = ${specJsonString};

    function startUi() {
      window.ui = SwaggerUIBundle({
        spec: swaggerSpec,
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list",
        filter: true,
        displayRequestDuration: true,
        showExtensions: true,
        showCommonExtensions: true,
        tryItOutEnabled: true,
        persistAuthorization: true
      });
    }

    document.getElementById('downloadSpecBtn').addEventListener('click', function() {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(swaggerSpec, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "openapi.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });

    window.onload = initSwagger;
  </script>
</body>
</html>`
  res.send(html)
})
