/**
 * OpenAPI 3.0.0 Specification for Deotech Solutions Enterprise Multi-Tenant CMS
 */
export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Deotech Solutions Enterprise Multi-Tenant CMS RESTful API',
    version: '1.0.0',
    description:
      'Comprehensive RESTful API documentation for the multi-tenant Content Management System (CMS). Supports Post Publishing, Workflow & Moderation, Pages, Media Library, Multi-Tenant Client Theming, Onboarding, Taxonomy, Newsletter, SEO, Analytics, and System Settings.',
    contact: {
      name: 'Deotech Solutions API Engineering',
      email: 'api-support@deotech.com',
      url: 'https://deotech.com',
    },
    license: {
      name: 'Proprietary / ISC',
    },
  },
  servers: [
    {
      url: 'http://localhost:5000/api/v1',
      description: 'Local Development Server',
    },
    {
      url: '/api/v1',
      description: 'Current Host Relative URL',
    },
  ],
  tags: [
    { name: 'System & Health', description: 'System status, health probes, and OpenAPI specification' },
    { name: 'Authentication & Account', description: 'User login, registration, password lifecycle, and profile management' },
    { name: 'Blog Posts', description: 'CRUD operations, workflow status changes, filtering, and statistical overviews' },
    { name: 'Comments & Moderation', description: 'Reader comments, admin replies, like toggles, and notification feeds' },
    { name: 'Taxonomies', description: 'Hierarchical Categories and Content Tags management' },
    { name: 'Media Library', description: 'Multipart file uploads, asset metadata tracking, and batch deletions' },
    { name: 'Pages', description: 'Core institutional and service page builder structure management' },
    { name: 'Multi-Tenant Clients & Theming', description: 'Client onboarding, branding tokens, and live automated theme detection' },
    { name: 'Analytics & SEO', description: 'Audience metrics, traffic source breakdown, Google Search Console, and SEO audit' },
    { name: 'Operations & Settings', description: 'HTTP redirection routing, audit trail activity logs, and newsletter subscribers' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System & Health'],
        summary: 'Health check probe',
        description: 'Returns server uptime, health status, and service metadata.',
        responses: {
          200: {
            description: 'Server is healthy and responding',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'healthy' },
                    uptime: { type: 'number', example: 1243.5 },
                    timestamp: { type: 'string', example: '2026-10-21T14:15:00.000Z' },
                    service: { type: 'string', example: 'Deotech CMS Backend API' },
                    version: { type: 'string', example: '1.0.0' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['System & Health'],
        summary: 'Download raw OpenAPI v3.0 JSON specification',
        description: 'Returns the full OpenAPI specification JSON object directly.',
        responses: {
          200: {
            description: 'OpenAPI specification document',
          },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Authentication & Account'],
        summary: 'Register new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Rohan Sharma' },
                  email: { type: 'string', format: 'email', example: 'rohan@deotech.com' },
                  password: { type: 'string', format: 'password', example: 'SecurePassword123!' },
                  role: { type: 'string', enum: ['super_admin', 'client_admin', 'editor', 'writer'], default: 'writer' },
                  clientId: { type: 'string', example: 'cli-1' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User successfully created' },
          400: { description: 'Validation error or email already in use' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication & Account'],
        summary: 'Authenticate user and obtain JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'superadmin@deotech.com' },
                  password: { type: 'string', example: 'Admin123!' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                        user: {
                          type: 'object',
                          properties: {
                            id: { type: 'string', example: 'usr-1' },
                            name: { type: 'string', example: 'Chief Administrator' },
                            email: { type: 'string', example: 'superadmin@deotech.com' },
                            role: { type: 'string', example: 'super_admin' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Invalid email or password' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication & Account'],
        summary: 'Get current authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Current profile data retrieved' },
          401: { description: 'Missing or expired bearer token' },
        },
      },
    },
    '/auth/profile': {
      put: {
        tags: ['Authentication & Account'],
        summary: 'Update current user profile info',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Rohan Sharma' },
                  bio: { type: 'string', example: 'Lead Cloud Architect & Principal Technical Contributor.' },
                  avatar: { type: 'string', example: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated successfully' },
        },
      },
    },
    '/posts': {
      get: {
        tags: ['Blog Posts'],
        summary: 'List blog posts',
        description: 'Fetch paginated blog posts with support for search, status, category, tag, author, and client filtering.',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, description: 'Filter by multi-tenant client ID' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'published', 'draft', 'pending_review', 'scheduled', 'archived', 'trash'] }, description: 'Filter by editorial status' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by category name' },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Keyword search in title, excerpt, and content' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Array of blog post objects',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/BlogPost' } },
                    pagination: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Blog Posts'],
        summary: 'Create a new blog post',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BlogPostInput' },
            },
          },
        },
        responses: {
          201: { description: 'Post created successfully' },
          400: { description: 'Validation error in post payload' },
        },
      },
    },
    '/posts/stats/overview': {
      get: {
        tags: ['Blog Posts'],
        summary: 'Get blog posts statistics overview',
        description: 'Returns real-time totals of all posts, published posts, drafts, pending reviews, scheduled, and trash queues.',
        responses: {
          200: {
            description: 'Aggregated blog statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        totalCount: { type: 'integer', example: 7 },
                        publishedCount: { type: 'integer', example: 4 },
                        draftCount: { type: 'integer', example: 2 },
                        pendingReviewCount: { type: 'integer', example: 1 },
                        scheduledCount: { type: 'integer', example: 0 },
                        archivedCount: { type: 'integer', example: 0 },
                        trashCount: { type: 'integer', example: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/posts/{idOrSlug}': {
      get: {
        tags: ['Blog Posts'],
        summary: 'Get single blog post by ID or Slug',
        parameters: [
          { name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
        ],
        responses: {
          200: { description: 'Blog post retrieved' },
          404: { description: 'Post not found' },
        },
      },
      put: {
        tags: ['Blog Posts'],
        summary: 'Update existing blog post',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BlogPostInput' },
            },
          },
        },
        responses: {
          200: { description: 'Post updated successfully' },
          404: { description: 'Post not found' },
        },
      },
      delete: {
        tags: ['Blog Posts'],
        summary: 'Delete or purge blog post',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
        ],
        responses: {
          200: { description: 'Post deleted successfully' },
        },
      },
    },
    '/posts/{id}/status': {
      patch: {
        tags: ['Blog Posts'],
        summary: 'Quick status change (e.g. publish, convert to draft, archive)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['published', 'draft', 'pending_review', 'scheduled', 'archived', 'trash'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Status updated' },
        },
      },
    },
    '/comments': {
      get: {
        tags: ['Comments & Moderation'],
        summary: 'List reader comments',
        parameters: [
          { name: 'postId', in: 'query', schema: { type: 'string' }, description: 'Filter by specific post ID' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'approved', 'pending', 'rejected', 'spam'] } },
        ],
        responses: {
          200: { description: 'Array of comments with threaded replies' },
        },
      },
      post: {
        tags: ['Comments & Moderation'],
        summary: 'Submit new reader comment',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['postId', 'authorName', 'content'],
                properties: {
                  postId: { type: 'string', example: 'post-101' },
                  postTitle: { type: 'string', example: 'The Architecture of Next-Gen Edge Compute' },
                  authorName: { type: 'string', example: 'Aarav Mehta' },
                  authorEmail: { type: 'string', format: 'email', example: 'aarav@example.com' },
                  content: { type: 'string', example: 'Incredible breakdown on edge caching nodes!' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Comment recorded' },
        },
      },
    },
    '/comments/{id}/reply': {
      post: {
        tags: ['Comments & Moderation'],
        summary: 'Post administrative reply to a comment thread',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'com-1' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  authorName: { type: 'string', example: 'Client Admin' },
                  content: { type: 'string', example: 'Thanks for reading! We will post a follow-up benchmark soon.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Reply posted' },
        },
      },
    },
    '/comments/{id}/like': {
      patch: {
        tags: ['Comments & Moderation'],
        summary: 'Increment or toggle helpful like on comment',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'com-1' },
        ],
        responses: {
          200: { description: 'Like count updated' },
        },
      },
    },
    '/comments/{id}': {
      delete: {
        tags: ['Comments & Moderation'],
        summary: 'Delete or purge comment',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'com-1' },
        ],
        responses: {
          200: { description: 'Comment deleted' },
        },
      },
    },
    '/categories': {
      get: {
        tags: ['Taxonomies'],
        summary: 'List content categories',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-1' },
        ],
        responses: {
          200: { description: 'Array of categories' },
        },
      },
      post: {
        tags: ['Taxonomies'],
        summary: 'Create category',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Cloud Architecture' },
                  slug: { type: 'string', example: 'cloud-architecture' },
                  description: { type: 'string', example: 'Cloud and distributed systems deep dives' },
                  clientId: { type: 'string', example: 'cli-1' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Category created' },
        },
      },
    },
    '/tags': {
      get: {
        tags: ['Taxonomies'],
        summary: 'List content tags',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-1' },
        ],
        responses: {
          200: { description: 'Array of tags' },
        },
      },
      post: {
        tags: ['Taxonomies'],
        summary: 'Create tag',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Edge Compute' },
                  clientId: { type: 'string', example: 'cli-1' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Tag created' },
        },
      },
    },
    '/media': {
      get: {
        tags: ['Media Library'],
        summary: 'List uploaded media assets',
        responses: {
          200: { description: 'Media asset list' },
        },
      },
    },
    '/media/upload': {
      post: {
        tags: ['Media Library'],
        summary: 'Upload media file (Images, Documents, SVGs)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  folder: { type: 'string', default: 'uploads' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'File uploaded successfully' },
        },
      },
    },
    '/media/delete-batch': {
      post: {
        tags: ['Media Library'],
        summary: 'Batch delete multiple media assets',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids'],
                properties: {
                  ids: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Selected media files deleted' },
        },
      },
    },
    '/pages': {
      get: {
        tags: ['Pages'],
        summary: 'List core and child service pages',
        parameters: [
          { name: 'parent', in: 'query', schema: { type: 'string' }, description: 'Filter child pages (e.g. Services)' },
        ],
        responses: {
          200: { description: 'Array of page structures' },
        },
      },
      post: {
        tags: ['Pages'],
        summary: 'Create custom page',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'Visa Guidance Service' },
                  slug: { type: 'string', example: 'visa-guidance' },
                  parent: { type: 'string', example: 'Services' },
                  sections: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Page created' },
        },
      },
    },
    '/pages/{slugOrId}': {
      get: {
        tags: ['Pages'],
        summary: 'Get single page details',
        parameters: [
          { name: 'slugOrId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Page details retrieved' },
        },
      },
      put: {
        tags: ['Pages'],
        summary: 'Update page sections, metadata, or layout settings',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'slugOrId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  sections: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Page updated successfully' },
        },
      },
    },
    '/clients': {
      get: {
        tags: ['Multi-Tenant Clients & Theming'],
        summary: 'List onboarded enterprise clients',
        responses: {
          200: { description: 'Array of client enterprises' },
        },
      },
      post: {
        tags: ['Multi-Tenant Clients & Theming'],
        summary: 'Register and onboard a new client enterprise',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'websiteUrl'],
                properties: {
                  name: { type: 'string', example: 'Apex Global Financial' },
                  clientName: { type: 'string', example: 'Apex Global' },
                  websiteUrl: { type: 'string', example: 'https://apexfinancial.com' },
                  industry: { type: 'string', example: 'Financial Services' },
                  plan: { type: 'string', example: 'Enterprise' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Client onboarded successfully' },
        },
      },
    },
    '/clients/{id}/theme': {
      get: {
        tags: ['Multi-Tenant Clients & Theming'],
        summary: 'Get brand theme design tokens and configuration for client',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-1' },
        ],
        responses: {
          200: { description: 'Theme tokens and visual styling' },
        },
      },
      put: {
        tags: ['Multi-Tenant Clients & Theming'],
        summary: 'Update brand tokens (colors, typography, header, footer)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-1' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  primaryColor: { type: 'string', example: '#6b0d0d' },
                  accentColor: { type: 'string', example: '#f26522' },
                  fontFamily: { type: 'string', example: 'Inter, sans-serif' },
                  headerBg: { type: 'string', example: '#ffffff' },
                  footerBg: { type: 'string', example: '#0f172a' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Theme updated' },
        },
      },
    },
    '/clients/{id}/theme/detect': {
      post: {
        tags: ['Multi-Tenant Clients & Theming'],
        summary: 'Detect brand tokens automatically by analyzing live client website URL',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-1' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', example: 'https://apexfinancial.com' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Scraped and detected CSS styling tokens',
          },
        },
      },
    },
    '/analytics/overview': {
      get: {
        tags: ['Analytics & SEO'],
        summary: 'Get aggregated audience overview and time-series visits',
        parameters: [
          { name: 'range', in: 'query', schema: { type: 'string', enum: ['last7Days', 'last30Days', 'last90Days'] }, default: 'last30Days' },
        ],
        responses: {
          200: { description: 'Views, visitors, read times, and chart data points' },
        },
      },
    },
    '/analytics/traffic-sources': {
      get: {
        tags: ['Analytics & SEO'],
        summary: 'Get traffic acquisition channel breakdown',
        responses: {
          200: { description: 'Sources breakdown (Google search, direct, social, referrals)' },
        },
      },
    },
    '/analytics/devices': {
      get: {
        tags: ['Analytics & SEO'],
        summary: 'Get user device split (Desktop, Mobile, Tablet)',
        responses: {
          200: { description: 'Device percentages' },
        },
      },
    },
    '/seo/performance': {
      get: {
        tags: ['Analytics & SEO'],
        summary: 'Google Search Console telemetry and top keyword rankings',
        responses: {
          200: { description: 'Clicks, impressions, CTR, and search queries' },
        },
      },
    },
    '/seo/health': {
      get: {
        tags: ['Analytics & SEO'],
        summary: 'Audit checklist and SEO health diagnostics',
        responses: {
          200: { description: 'Health score and detected SEO issues' },
        },
      },
    },
    '/activity': {
      get: {
        tags: ['Operations & Settings'],
        summary: 'Audit log of admin and author activities',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-1' },
        ],
        responses: {
          200: { description: 'Activity events stream' },
        },
      },
    },
    '/redirects': {
      get: {
        tags: ['Operations & Settings'],
        summary: 'List active HTTP 301/302 URL redirection rules',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-1' },
        ],
        responses: {
          200: { description: 'Forwarding rules' },
        },
      },
      post: {
        tags: ['Operations & Settings'],
        summary: 'Create forwarding redirect rule',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sourceUrl', 'targetUrl'],
                properties: {
                  sourceUrl: { type: 'string', example: '/old-link' },
                  targetUrl: { type: 'string', example: '/blog/new-article' },
                  statusCode: { type: 'integer', enum: [301, 302], default: 301 },
                  clientId: { type: 'string', example: 'cli-1' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Redirect rule active' },
        },
      },
    },
    '/redirects/{id}': {
      delete: {
        tags: ['Operations & Settings'],
        summary: 'Delete redirect rule',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Redirect deleted' },
        },
      },
    },
    '/newsletter/subscribe': {
      post: {
        tags: ['Operations & Settings'],
        summary: 'Subscribe reader email to publication newsletter',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'reader@domain.com' },
                  source: { type: 'string', default: 'Blog Footer' },
                  clientId: { type: 'string', example: 'cli-1' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Subscribed' },
        },
      },
    },
    '/newsletter/subscribers': {
      get: {
        tags: ['Operations & Settings'],
        summary: 'List newsletter subscribers',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'List of subscribers' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Bearer token obtained from POST /api/v1/auth/login',
      },
    },
    schemas: {
      BlogPost: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'post-101' },
          title: { type: 'string', example: 'The Architecture of Next-Gen Edge Compute' },
          slug: { type: 'string', example: 'architecture-next-gen-edge-compute' },
          excerpt: { type: 'string', example: 'Comprehensive architectural teardown of decentralized edge runtimes.' },
          content: { type: 'string', example: '<p>Deep technical walkthrough of modern edge compute.</p>' },
          author: { type: 'string', example: 'Rohan Sharma' },
          authorRole: { type: 'string', example: 'Lead Cloud Architect' },
          category: { type: 'string', example: 'Technology & AI' },
          tags: { type: 'array', items: { type: 'string' }, example: ['Edge Compute', 'Serverless'] },
          featuredImage: { type: 'string', example: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5' },
          status: { type: 'string', enum: ['published', 'draft', 'pending_review', 'scheduled', 'archived', 'trash'], example: 'published' },
          date: { type: 'string', example: 'Oct 15, 2026' },
          readTime: { type: 'string', example: '8 min read' },
          featured: { type: 'boolean', example: true },
          views: { type: 'string', example: '4.2K' },
          clientId: { type: 'string', example: 'cli-1' },
        },
      },
      BlogPostInput: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', example: 'Modern Reactive State Architecture in 2026' },
          slug: { type: 'string', example: 'reactive-state-architecture-2026' },
          excerpt: { type: 'string', example: 'A practical guide to distributed state nodes.' },
          content: { type: 'string', example: '<h2>Reactive Patterns</h2><p>Overview of signal driven updates.</p>' },
          category: { type: 'string', example: 'Web Development' },
          tags: { type: 'array', items: { type: 'string' }, example: ['React', 'Architecture'] },
          author: { type: 'string', example: 'Rohan Sharma' },
          status: { type: 'string', enum: ['published', 'draft', 'pending_review', 'scheduled'], default: 'draft' },
          featuredImage: { type: 'string', example: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b' },
          clientId: { type: 'string', default: 'cli-1' },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 7 },
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          totalPages: { type: 'integer', example: 1 },
        },
      },
    },
  },
}
