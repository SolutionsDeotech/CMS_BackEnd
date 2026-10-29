import { Router } from 'express'
import { swaggerDocument } from '../config/swaggerSpec.js'

export const swaggerRouter = Router()

// Serve raw OpenAPI JSON specification
swaggerRouter.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.json(swaggerDocument)
})

// Serve interactive Swagger UI HTML directly with modern CDN assets
swaggerRouter.get('/docs', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Deotech CMS API - Swagger UI Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.11.0/favicon-32x32.png" sizes="32x32" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin: 0;
      background: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .topbar {
      display: none !important;
    }
    .custom-header {
      background: #6b0d0d;
      color: #ffffff;
      padding: 18px 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    }
    .custom-header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .custom-header .badge {
      background: rgba(255,255,255,0.2);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }
    .custom-header a {
      color: #ffffff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      background: rgba(255,255,255,0.15);
      transition: background 0.2s;
    }
    .custom-header a:hover {
      background: rgba(255,255,255,0.25);
    }
  </style>
</head>
<body>
  <div class="custom-header">
    <h1>
      <span>⚡ Deotech Solutions</span>
      <span class="badge">Enterprise CMS REST API v1.0</span>
    </h1>
    <div style="display: flex; gap: 12px;">
      <a href="/api/v1/openapi.json" target="_blank">📄 Raw OpenAPI JSON</a>
      <a href="/api/v1/health" target="_blank">🩺 Health Probe</a>
    </div>
  </div>

  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/v1/openapi.json",
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
        tryItOutEnabled: true
      });
    };
  </script>
</body>
</html>`
  res.setHeader('Content-Type', 'text/html')
  res.send(html)
})
