/**
 * OpenAPI 3.0.0 Specification for Deotech Solutions Enterprise Multi-Tenant CMS
 * Organized into 15 logical, structured modules with complete schema definitions.
 */
export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Deotech Solutions Enterprise Multi-Tenant CMS RESTful API',
    version: '1.0.0',
    description:
      'Comprehensive RESTful API documentation for the multi-tenant Content Management System (CMS). Supports Post Publishing, Workflow & Moderation, Pages, Media Library, Multi-Tenant Client Theming, Onboarding Wizard, Taxonomy, Newsletter, SEO, Analytics, and System Settings.',
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
    { name: '01. Authentication & Security', description: 'User login, registration, password lifecycle, sessions, and profile management' },
    { name: '02. User Roles & Permissions', description: 'Granular system roles, capabilities, and access permissions management' },
    { name: '03. Blog Posts & Publishing', description: 'CRUD operations, editorial workflow statuses, filtering, and statistical overviews' },
    { name: '04. Taxonomies (Categories & Tags)', description: 'Hierarchical categories and content tags management' },
    { name: '05. Comments & Moderation', description: 'Reader comments, admin replies, like toggles, and notification feeds' },
    { name: '06. Media Library & Assets', description: 'Multipart file uploads, asset metadata tracking, batch deletion, and compression' },
    { name: '07. Page Builder & Static Pages', description: 'Core institutional and modular block-based page management' },
    { name: '08. Website Onboarding Wizard', description: 'Multi-tenant website onboarding, domain verification, and DNS probes' },
    { name: '09. Multi-Tenant Clients & Theming', description: 'Client onboarding, branding tokens, live automated theme detection, and rollbacks' },
    { name: '10. SuperAdmin Template Builder', description: 'Master publication layout templates, drafts, version rollbacks, and publishing' },
    { name: '11. Blog Settings & Integrations', description: 'Blog home layout, comment policy rules, newsletter widgets, and third-party integrations' },
    { name: '12. Team, Writers & Author Profiles', description: 'Writers, author bios, team invitations, and granular role permissions' },
    { name: '13. Content Import, Export & Maintenance', description: 'Bulk JSON/CSV content import, publication export, and trash queue purge' },
    { name: '14. Analytics & SEO Reports', description: 'Audience metrics, traffic channels, Google Search Console performance, and SEO audit probes' },
    { name: '15. Operations, Redirects & Newsletter', description: 'HTTP 301/302 redirects, audit trail activity logs, and newsletter subscriber lifecycle' },
  ],
  paths: {
    // -------------------------------------------------------------------------
    // 01. Authentication & Security
    // -------------------------------------------------------------------------
    '/health': {
      get: {
        tags: ['01. Authentication & Security'],
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
                    persistence: { type: 'string', example: 'mongodb' },
                    uptime: { type: 'number', example: 1243.5 },
                    timestamp: { type: 'string', example: '2026-11-05T14:15:00.000Z' },
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
        tags: ['01. Authentication & Security'],
        summary: 'Download raw OpenAPI v3.0 JSON specification',
        description: 'Returns the full OpenAPI specification JSON object directly.',
        responses: {
          200: { description: 'OpenAPI specification document' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['01. Authentication & Security'],
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
                  role: { type: 'string', enum: ['super_admin', 'client_admin', 'editor', 'writer', 'Admin', 'Content Writer', 'Individual User'], default: 'writer' },
                  clientId: { type: 'string', example: 'cli-2' },
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
        tags: ['01. Authentication & Security'],
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
                        user: { $ref: '#/components/schemas/User' },
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
    '/auth/admin/login': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Admin-exclusive authentication endpoint',
        description: 'Authenticates administrators and super admins.',
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
          200: { description: 'Admin authentication successful' },
          401: { description: 'Invalid credentials or unauthorized' },
        },
      },
    },
    '/auth/user/login': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Standard user and client authentication endpoint',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'writer@deotech.com' },
                  password: { type: 'string', example: 'Writer123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'User authentication successful' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Logout current user session',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Request password reset OTP code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP sent to email address' },
          404: { description: 'Email not found' },
        },
      },
    },
    '/auth/verify-otp': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Verify password reset OTP code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  otp: { type: 'string', example: '482910' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP verified successfully' },
          400: { description: 'Invalid or expired OTP' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Set new password with verified OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp', 'newPassword'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  otp: { type: 'string', example: '482910' },
                  newPassword: { type: 'string', format: 'password', example: 'NewSecurePassword123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password reset successfully' },
          400: { description: 'Failed to reset password' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['01. Authentication & Security'],
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
        tags: ['01. Authentication & Security'],
        summary: 'Update profile information (name, bio, avatar)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Rohan Sharma' },
                  bio: { type: 'string', example: 'Lead Cloud Architect & Principal Contributor.' },
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
    '/auth/change-password': {
      put: {
        tags: ['01. Authentication & Security'],
        summary: 'Change password while authenticated',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string', format: 'password', example: 'OldPassword123!' },
                  newPassword: { type: 'string', format: 'password', example: 'NewPassword123!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed successfully' },
          400: { description: 'Invalid current password' },
        },
      },
    },
    '/auth/sessions': {
      get: {
        tags: ['01. Authentication & Security'],
        summary: 'List active user login sessions and devices',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Array of active sessions' },
        },
      },
    },
    '/auth/logout-all': {
      post: {
        tags: ['01. Authentication & Security'],
        summary: 'Revoke and logout from all active sessions',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All sessions invalidated' },
        },
      },
    },
    '/auth/sessions/{sessionId}': {
      delete: {
        tags: ['01. Authentication & Security'],
        summary: 'Revoke a specific login session',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Session revoked successfully' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 02. User Roles & Permissions
    // -------------------------------------------------------------------------
    '/roles': {
      get: {
        tags: ['02. User Roles & Permissions'],
        summary: 'List system roles and permission tiers',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Array of configured user roles' },
        },
      },
      post: {
        tags: ['02. User Roles & Permissions'],
        summary: 'Create custom admin role',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Regional Content Moderator' },
                  permission: { type: 'string', enum: ['Full Access', 'Limited Access', 'Can View Only'], default: 'Limited Access' },
                  permissions: {
                    type: 'object',
                    properties: {
                      canCreatePosts: { type: 'boolean', default: true },
                      canPublishPosts: { type: 'boolean', default: false },
                      canModerateComments: { type: 'boolean', default: true },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Role created' },
        },
      },
    },
    '/roles/{id}': {
      put: {
        tags: ['02. User Roles & Permissions'],
        summary: 'Update role details and permissions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Senior Moderator' },
                  permission: { type: 'string', example: 'Limited Access' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Role updated' },
        },
      },
      delete: {
        tags: ['02. User Roles & Permissions'],
        summary: 'Delete role',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Role deleted' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 03. Blog Posts & Publishing
    // -------------------------------------------------------------------------
    '/posts': {
      get: {
        tags: ['03. Blog Posts & Publishing'],
        summary: 'List blog posts with filtering and pagination',
        description: 'Fetch paginated blog posts with support for search, status, category, tag, author, and client filtering.',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, description: 'Filter by multi-tenant client ID' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'published', 'draft', 'pending_review', 'scheduled', 'archived', 'trash'] } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          { name: 'author', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Array of blog posts',
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
        tags: ['03. Blog Posts & Publishing'],
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
          400: { description: 'Validation error' },
        },
      },
    },
    '/posts/stats/overview': {
      get: {
        tags: ['03. Blog Posts & Publishing'],
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
        tags: ['03. Blog Posts & Publishing'],
        summary: 'Get single blog post by ID or Slug',
        parameters: [
          { name: 'idOrSlug', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
        ],
        responses: {
          200: { description: 'Blog post retrieved' },
          404: { description: 'Post not found' },
        },
      },
    },
    '/posts/{id}': {
      put: {
        tags: ['03. Blog Posts & Publishing'],
        summary: 'Update existing blog post',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
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
        tags: ['03. Blog Posts & Publishing'],
        summary: 'Delete or purge blog post',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'post-101' },
        ],
        responses: {
          200: { description: 'Post deleted successfully' },
        },
      },
    },
    '/posts/{id}/status': {
      patch: {
        tags: ['03. Blog Posts & Publishing'],
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

    // -------------------------------------------------------------------------
    // 04. Taxonomies (Categories & Tags)
    // -------------------------------------------------------------------------
    '/categories': {
      get: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'List categories',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'List of categories' },
        },
      },
      post: {
        tags: ['04. Taxonomies (Categories & Tags)'],
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
                  name: { type: 'string', example: 'Artificial Intelligence' },
                  slug: { type: 'string', example: 'artificial-intelligence' },
                  description: { type: 'string', example: 'Articles covering LLMs, neural networks, and ML ops.' },
                  parentId: { type: 'string', nullable: true },
                  clientId: { type: 'string', example: 'cli-2' },
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
    '/categories/{id}': {
      put: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'Update category',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Applied AI' },
                  description: { type: 'string', example: 'Real-world AI deployment cases' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Category updated' },
        },
      },
      delete: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'Delete category',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Category deleted' },
        },
      },
    },
    '/tags': {
      get: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'List content tags',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'List of tags' },
        },
      },
      post: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'Create content tag',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Kubernetes' },
                  slug: { type: 'string', example: 'kubernetes' },
                  clientId: { type: 'string', example: 'cli-2' },
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
    '/tags/{id}': {
      put: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'Update content tag',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'K8s & Cloud' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Tag updated' },
        },
      },
      delete: {
        tags: ['04. Taxonomies (Categories & Tags)'],
        summary: 'Delete content tag',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Tag deleted' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 05. Comments & Moderation
    // -------------------------------------------------------------------------
    '/comments': {
      get: {
        tags: ['05. Comments & Moderation'],
        summary: 'List reader comments',
        parameters: [
          { name: 'postId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'approved', 'pending', 'rejected', 'spam'] } },
        ],
        responses: {
          200: { description: 'Array of comments with threaded replies' },
        },
      },
      post: {
        tags: ['05. Comments & Moderation'],
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
    '/comments/notifications': {
      get: {
        tags: ['05. Comments & Moderation'],
        summary: 'List comment notifications',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Notification feed' },
        },
      },
    },
    '/comments/notifications/{id}/read': {
      patch: {
        tags: ['05. Comments & Moderation'],
        summary: 'Mark comment notification as read',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Notification marked as read' },
        },
      },
    },
    '/comments/{id}': {
      get: {
        tags: ['05. Comments & Moderation'],
        summary: 'Get single comment details',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Comment retrieved' },
        },
      },
      put: {
        tags: ['05. Comments & Moderation'],
        summary: 'Edit comment text',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', example: 'Updated comment content.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Comment content updated' },
        },
      },
      delete: {
        tags: ['05. Comments & Moderation'],
        summary: 'Delete comment',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Comment deleted' },
        },
      },
    },
    '/comments/{id}/like': {
      patch: {
        tags: ['05. Comments & Moderation'],
        summary: 'Toggle like on comment',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Likes count updated' },
        },
      },
    },
    '/comments/{id}/reply': {
      post: {
        tags: ['05. Comments & Moderation'],
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
                  content: { type: 'string', example: 'Thank you Aarav! More benchmarks arriving next week.' },
                  authorName: { type: 'string', example: 'Editorial Staff' },
                  authorRole: { type: 'string', example: 'Admin' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Reply attached to comment thread' },
        },
      },
    },
    '/comments/{id}/status': {
      patch: {
        tags: ['05. Comments & Moderation'],
        summary: 'Moderate comment status',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['approved', 'pending', 'spam', 'trash'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Comment status updated' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 06. Media Library & Assets
    // -------------------------------------------------------------------------
    '/media': {
      get: {
        tags: ['06. Media Library & Assets'],
        summary: 'List media files and assets',
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['all', 'image', 'video', 'document'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Paginated media assets list' },
        },
      },
    },
    '/media/upload': {
      post: {
        tags: ['06. Media Library & Assets'],
        summary: 'Upload multipart media asset (image, video, document)',
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
                  title: { type: 'string', example: 'NextGen Cloud Architecture Diagram' },
                  alt: { type: 'string', example: 'Edge nodes connectivity diagram' },
                  clientId: { type: 'string', example: 'cli-2' },
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
        tags: ['06. Media Library & Assets'],
        summary: 'Batch delete media assets',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ids'],
                properties: {
                  ids: { type: 'array', items: { type: 'string' }, example: ['med-101', 'med-102'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Assets deleted' },
        },
      },
    },
    '/media/{id}': {
      delete: {
        tags: ['06. Media Library & Assets'],
        summary: 'Delete single media asset',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Asset removed' },
        },
      },
    },
    '/media/{id}/rename': {
      patch: {
        tags: ['06. Media Library & Assets'],
        summary: 'Rename media asset title/filename',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'updated-architecture-schema.png' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Asset renamed' },
        },
      },
    },
    '/media/{id}/compress': {
      post: {
        tags: ['06. Media Library & Assets'],
        summary: 'Optimize / compress image asset',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  quality: { type: 'integer', default: 80, example: 75 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Asset compressed' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 07. Page Builder & Static Pages
    // -------------------------------------------------------------------------
    '/pages': {
      get: {
        tags: ['07. Page Builder & Static Pages'],
        summary: 'List custom pages',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['published', 'draft'] } },
        ],
        responses: {
          200: { description: 'Array of page schemas' },
        },
      },
      post: {
        tags: ['07. Page Builder & Static Pages'],
        summary: 'Create custom institutional page',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'slug'],
                properties: {
                  title: { type: 'string', example: 'Enterprise Security Whitepaper' },
                  slug: { type: 'string', example: 'enterprise-security' },
                  status: { type: 'string', enum: ['published', 'draft'], default: 'draft' },
                  content: { type: 'string', example: '<h1>Security at Deotech</h1><p>Full encryption at rest.</p>' },
                  metaTitle: { type: 'string', example: 'Enterprise Security | Deotech CMS' },
                  metaDescription: { type: 'string', example: 'Deep dive into our cryptographic isolation model.' },
                  clientId: { type: 'string', example: 'cli-2' },
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
        tags: ['07. Page Builder & Static Pages'],
        summary: 'Get page by slug or ID',
        parameters: [
          { name: 'slugOrId', in: 'path', required: true, schema: { type: 'string' }, example: 'privacy-policy' },
        ],
        responses: {
          200: { description: 'Page object' },
          404: { description: 'Page not found' },
        },
      },
      put: {
        tags: ['07. Page Builder & Static Pages'],
        summary: 'Update page content, layout blocks, or SEO metadata',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'slugOrId', in: 'path', required: true, schema: { type: 'string' }, example: 'privacy-policy' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Updated Privacy Policy 2026' },
                  content: { type: 'string', example: '<p>Revised compliance directives.</p>' },
                  status: { type: 'string', enum: ['published', 'draft'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Page updated' },
        },
      },
      delete: {
        tags: ['07. Page Builder & Static Pages'],
        summary: 'Delete page',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'slugOrId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Page deleted' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 08. Website Onboarding Wizard
    // -------------------------------------------------------------------------
    '/blog-setup/onboarding/websites': {
      get: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'List client websites in onboarding wizard',
        responses: {
          200: { description: 'Map or list of onboarding websites' },
        },
      },
      post: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Register website in onboarding wizard',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['domain', 'siteName'],
                properties: {
                  domain: { type: 'string', example: 'cloudscale.io' },
                  siteName: { type: 'string', example: 'CloudScale Technologies' },
                  blogPath: { type: 'string', default: '/blog' },
                  clientId: { type: 'string', example: 'cli-2' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Onboarding website initialized' },
        },
      },
    },
    '/blog-setup/onboarding/websites/{id}': {
      get: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Get onboarding website progress details',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Website wizard details' },
        },
      },
      put: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Update onboarding wizard progress',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  isCompleted: { type: 'boolean' },
                  currentStep: { type: 'integer', example: 3 },
                  wizard: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Wizard progress updated' },
        },
      },
    },
    '/blog-setup/onboarding/probe': {
      post: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Probe website reachability and SSL status',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['domain'],
                properties: {
                  domain: { type: 'string', example: 'example.com' },
                  protocol: { type: 'string', enum: ['https', 'http'], default: 'https' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Domain reachability probe result' },
        },
      },
    },
    '/blog-setup/onboarding/verify-domain': {
      post: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Verify domain ownership (DNS TXT or HTML Tag)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['domain', 'verificationMethod'],
                properties: {
                  domain: { type: 'string', example: 'example.com' },
                  verificationMethod: { type: 'string', enum: ['dns_txt', 'html_tag'], default: 'dns_txt' },
                  verificationToken: { type: 'string', example: 'deotech-verify-abcdef123' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Domain verification status' },
        },
      },
    },
    '/blog-setup/onboarding/validate-location': {
      post: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Validate blog path routing (e.g. /blog)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['domain', 'blogPath'],
                properties: {
                  domain: { type: 'string', example: 'example.com' },
                  blogPath: { type: 'string', example: '/blog' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Blog location path validated' },
        },
      },
    },
    '/blog-setup/onboarding/websites/{id}/invitations': {
      post: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Create Client Admin invitation for onboarding website',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'clientadmin@brand.com' },
                  role: { type: 'string', default: 'Client Admin' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Invitation created and dispatched' },
        },
      },
    },
    '/blog-setup/onboarding/websites/{id}/invitations/{invitationId}/resend': {
      post: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Resend Client Admin onboarding invitation',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'invitationId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Invitation resent' },
        },
      },
    },
    '/blog-setup/onboarding/websites/{id}/invitations/{invitationId}': {
      delete: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Revoke Client Admin onboarding invitation',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'invitationId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Invitation revoked' },
        },
      },
    },
    '/blog-setup/onboarding/websites/{id}/test-post': {
      put: {
        tags: ['08. Website Onboarding Wizard'],
        summary: 'Save/publish onboarding verification test post',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', example: 'Welcome to our New Tech Publication!' },
                  content: { type: 'string', example: '<p>Integration verified successfully.</p>' },
                  slug: { type: 'string', example: 'welcome-to-our-publication' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Verification test post published' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 09. Multi-Tenant Clients & Theming
    // -------------------------------------------------------------------------
    '/clients': {
      get: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'List registered client tenants',
        responses: {
          200: { description: 'Array of client organizations' },
        },
      },
      post: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Register new client tenant organization',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'domain'],
                properties: {
                  name: { type: 'string', example: 'FinTech Dynamics' },
                  domain: { type: 'string', example: 'fintechdynamics.com' },
                  plan: { type: 'string', enum: ['free', 'pro', 'enterprise'], default: 'pro' },
                  status: { type: 'string', enum: ['active', 'inactive', 'suspended'], default: 'active' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Client tenant provisioned' },
        },
      },
    },
    '/clients/{id}': {
      get: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Get client tenant details',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Client details' },
        },
      },
      put: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Update client configuration',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-2' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'FinTech Global' },
                  domain: { type: 'string', example: 'fintechglobal.com' },
                  status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Client updated' },
        },
      },
      delete: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Delete client tenant',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Client deleted' },
        },
      },
    },
    '/clients/{id}/theme': {
      get: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Get client brand design tokens & styling',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Theme token hierarchy (primary color, typography, button radius)' },
        },
      },
      put: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Update client theme styling tokens',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-2' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  primaryColor: { type: 'string', example: '#0f766e' },
                  secondaryColor: { type: 'string', example: '#134e4a' },
                  fontFamily: { type: 'string', example: 'Inter, sans-serif' },
                  borderRadius: { type: 'string', example: '8px' },
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
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Automated AI / CSS brand color extractor from URL',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, example: 'cli-2' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['websiteUrl'],
                properties: {
                  websiteUrl: { type: 'string', format: 'uri', example: 'https://stripe.com' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Extracted palette with dominant brand tokens' },
        },
      },
    },
    '/clients/{id}/theme/versions': {
      get: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'List theme version snapshots',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Array of historic theme versions' },
        },
      },
    },
    '/clients/{id}/theme/rollback/{version}': {
      post: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Rollback theme tokens to historic version',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'version', in: 'path', required: true, schema: { type: 'string' }, example: 'v1' },
        ],
        responses: {
          200: { description: 'Theme rolled back successfully' },
        },
      },
    },
    '/clients/{id}/theme/reset': {
      post: {
        tags: ['09. Multi-Tenant Clients & Theming'],
        summary: 'Reset theme to system defaults',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Theme reset' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 10. SuperAdmin Template Builder
    // -------------------------------------------------------------------------
    '/blog-setup/templates': {
      get: {
        tags: ['10. SuperAdmin Template Builder'],
        summary: 'Get active publication layout template',
        responses: {
          200: { description: 'Template layout blocks and styling' },
        },
      },
      put: {
        tags: ['10. SuperAdmin Template Builder'],
        summary: 'Save draft template layout',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  layout: { type: 'string', example: 'modern_grid' },
                  components: { type: 'object' },
                  styles: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Draft template saved' },
        },
      },
    },
    '/blog-setup/templates/publish': {
      post: {
        tags: ['10. SuperAdmin Template Builder'],
        summary: 'Publish draft template live to all tenant websites',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  versionNote: { type: 'string', example: 'Updated card shadows and typography' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Template published live' },
        },
      },
    },
    '/blog-setup/templates/versions': {
      get: {
        tags: ['10. SuperAdmin Template Builder'],
        summary: 'Get template version snapshot history',
        responses: {
          200: { description: 'Array of template versions' },
        },
      },
    },
    '/blog-setup/templates/rollback/{version}': {
      post: {
        tags: ['10. SuperAdmin Template Builder'],
        summary: 'Rollback template to historic version',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'version', in: 'path', required: true, schema: { type: 'string' }, example: 'v2' },
        ],
        responses: {
          200: { description: 'Template restored to version' },
        },
      },
    },
    '/blog-setup/templates/reset': {
      post: {
        tags: ['10. SuperAdmin Template Builder'],
        summary: 'Reset template to factory defaults',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Template reset' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 11. Blog Settings & Integrations
    // -------------------------------------------------------------------------
    '/blog-setup/settings/home': {
      get: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Get blog home layout and widget settings',
        responses: {
          200: { description: 'Blog home configurations' },
        },
      },
      put: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Update blog home settings (hero banner, featured posts)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  heroTitle: { type: 'string', example: 'Stories & Engineering Insights' },
                  featuredPostIds: { type: 'array', items: { type: 'string' } },
                  sidebarWidgets: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Blog home updated' },
        },
      },
    },
    '/blog-setup/settings/comments': {
      get: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Get comment policies and moderation settings',
        responses: {
          200: { description: 'Comment settings' },
        },
      },
      put: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Update comment policies (approval required, spam keywords)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  requireApproval: { type: 'boolean', default: true },
                  allowGuestComments: { type: 'boolean', default: false },
                  blockedKeywords: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Comment policies saved' },
        },
      },
    },
    '/blog-setup/settings/newsletter': {
      get: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Get newsletter widget settings',
        responses: {
          200: { description: 'Newsletter settings' },
        },
      },
      put: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Update newsletter widget configuration',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  heading: { type: 'string', example: 'Subscribe to Our Weekly Tech Brief' },
                  buttonText: { type: 'string', example: 'Subscribe' },
                  successMessage: { type: 'string', example: 'Welcome aboard!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Newsletter settings saved' },
        },
      },
    },
    '/blog-setup/settings/integrations': {
      get: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'List connected integrations (GA4, GSC, Slack, Meta Pixel, GTM)',
        responses: {
          200: { description: 'Integration status map' },
        },
      },
    },
    '/blog-setup/settings/integrations/{serviceKey}': {
      put: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Update integration credentials or configuration',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'serviceKey', in: 'path', required: true, schema: { type: 'string', enum: ['ga4', 'gsc', 'slack', 'meta_pixel', 'gtm'] } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  trackingId: { type: 'string', example: 'G-XYZ1234567' },
                  webhookUrl: { type: 'string', example: 'https://hooks.slack.com/services/...' },
                  enabled: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Integration saved' },
        },
      },
    },
    '/blog-setup/settings/integrations/{serviceKey}/test': {
      post: {
        tags: ['11. Blog Settings & Integrations'],
        summary: 'Test live connectivity to integration service',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'serviceKey', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Test ping successful' },
          400: { description: 'Connection failed' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 12. Team, Writers & Author Profiles
    // -------------------------------------------------------------------------
    '/blog-setup/writers': {
      get: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'List publication writers and author profiles',
        responses: {
          200: { description: 'Array of writers' },
        },
      },
      post: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Create publication writer profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name: { type: 'string', example: 'Priya Patel' },
                  email: { type: 'string', format: 'email', example: 'priya@example.com' },
                  role: { type: 'string', default: 'Lead Technical Writer' },
                  bio: { type: 'string', example: 'Staff engineer and systems researcher.' },
                  avatar: { type: 'string', example: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Writer profile created' },
        },
      },
    },
    '/blog-setup/writers/{id}': {
      put: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Update writer profile details',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  bio: { type: 'string' },
                  avatar: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Writer updated' },
        },
      },
      delete: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Delete writer profile',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Writer deleted' },
        },
      },
    },
    '/blog-setup/team': {
      get: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'List internal team members and permissions',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Array of team members' },
        },
      },
    },
    '/blog-setup/team/invite': {
      post: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Invite team member to organization',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'role'],
                properties: {
                  name: { type: 'string', example: 'Ananya Roy' },
                  email: { type: 'string', format: 'email', example: 'ananya@organization.com' },
                  role: { type: 'string', enum: ['Editor', 'Content Writer', 'Contributor'], default: 'Editor' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Invitation sent' },
        },
      },
    },
    '/blog-setup/team/{id}': {
      put: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Update team member info',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Team member updated' },
        },
      },
      delete: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Remove team member',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Member removed' },
        },
      },
    },
    '/blog-setup/team/{id}/resend-invite': {
      post: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Resend invitation email to team member',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Invitation resent' },
        },
      },
    },
    '/blog-setup/team/{id}/permissions': {
      patch: {
        tags: ['12. Team, Writers & Author Profiles'],
        summary: 'Update team member granular permissions',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['permissions'],
                properties: {
                  permissions: {
                    type: 'object',
                    properties: {
                      canPublish: { type: 'boolean' },
                      canDelete: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Permissions saved' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 13. Content Import, Export & Maintenance
    // -------------------------------------------------------------------------
    '/blog-setup/content/import': {
      post: {
        tags: ['13. Content Import, Export & Maintenance'],
        summary: 'Bulk import posts from JSON or WordPress CSV',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['format', 'data'],
                properties: {
                  format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
                  data: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Content successfully imported' },
        },
      },
    },
    '/blog-setup/content/export': {
      get: {
        tags: ['13. Content Import, Export & Maintenance'],
        summary: 'Export all publication posts in JSON or CSV',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'csv'], default: 'json' } },
        ],
        responses: {
          200: { description: 'Export payload' },
        },
      },
    },
    '/blog-setup/content/trash': {
      delete: {
        tags: ['13. Content Import, Export & Maintenance'],
        summary: 'Permanently purge all posts in the trash queue',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Trash queue emptied' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 14. Analytics & SEO Reports
    // -------------------------------------------------------------------------
    '/analytics/overview': {
      get: {
        tags: ['14. Analytics & SEO Reports'],
        summary: 'High-level audience KPI analytics',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['7d', '30d', '90d', '1y'], default: '30d' } },
        ],
        responses: {
          200: { description: 'Total visits, page views, bounce rate, and average session duration' },
        },
      },
    },
    '/analytics/traffic-sources': {
      get: {
        tags: ['14. Analytics & SEO Reports'],
        summary: 'Traffic acquisition channel breakdown',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Organic, Direct, Social, Referral percentages' },
        },
      },
    },
    '/analytics/devices': {
      get: {
        tags: ['14. Analytics & SEO Reports'],
        summary: 'Visitor device breakdown',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Desktop, mobile, tablet shares' },
        },
      },
    },
    '/seo/performance': {
      get: {
        tags: ['14. Analytics & SEO Reports'],
        summary: 'Google Search Console keyword queries and clicks',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Keywords, clicks, impressions, CTR, and average position' },
        },
      },
    },
    '/seo/health': {
      get: {
        tags: ['14. Analytics & SEO Reports'],
        summary: 'Technical SEO health audit and detected issues',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'SEO score and list of actionable issues' },
        },
      },
    },
    '/seo/issues/{id}': {
      patch: {
        tags: ['14. Analytics & SEO Reports'],
        summary: 'Update status of SEO audit issue',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['resolved', 'ignored', 'open'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'SEO issue status updated' },
        },
      },
    },

    // -------------------------------------------------------------------------
    // 15. Operations, Redirects & Newsletter
    // -------------------------------------------------------------------------
    '/activity': {
      get: {
        tags: ['15. Operations, Redirects & Newsletter'],
        summary: 'Audit log stream of admin and author activities',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Activity events stream' },
        },
      },
    },
    '/redirects': {
      get: {
        tags: ['15. Operations, Redirects & Newsletter'],
        summary: 'List active HTTP 301/302 URL redirection rules',
        parameters: [
          { name: 'clientId', in: 'query', schema: { type: 'string' }, example: 'cli-2' },
        ],
        responses: {
          200: { description: 'Forwarding rules' },
        },
      },
      post: {
        tags: ['15. Operations, Redirects & Newsletter'],
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
                  sourceUrl: { type: 'string', example: '/old-post-link' },
                  targetUrl: { type: 'string', example: '/blog/new-article' },
                  statusCode: { type: 'integer', enum: [301, 302], default: 301 },
                  clientId: { type: 'string', example: 'cli-2' },
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
      put: {
        tags: ['15. Operations, Redirects & Newsletter'],
        summary: 'Update existing redirect rule',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  sourceUrl: { type: 'string' },
                  targetUrl: { type: 'string' },
                  statusCode: { type: 'integer', enum: [301, 302] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Redirect updated' },
        },
      },
      delete: {
        tags: ['15. Operations, Redirects & Newsletter'],
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
        tags: ['15. Operations, Redirects & Newsletter'],
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
                  clientId: { type: 'string', example: 'cli-2' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Subscribed successfully' },
        },
      },
    },
    '/newsletter/subscribers': {
      get: {
        tags: ['15. Operations, Redirects & Newsletter'],
        summary: 'List newsletter subscribers',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'List of subscribers' },
        },
      },
    },
    '/newsletter/subscribers/{id}': {
      patch: {
        tags: ['15. Operations, Redirects & Newsletter'],
        summary: 'Update subscriber status (active, unsubscribed)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['active', 'unsubscribed'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Subscriber status updated' },
        },
      },
      delete: {
        tags: ['15. Operations, Redirects & Newsletter'],
        summary: 'Remove subscriber',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Subscriber removed' },
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
        description: 'Enter your Bearer token obtained from POST /api/v1/auth/login or /api/v1/auth/admin/login',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'usr-1' },
          name: { type: 'string', example: 'Chief Administrator' },
          email: { type: 'string', format: 'email', example: 'superadmin@deotech.com' },
          role: { type: 'string', example: 'super_admin' },
          avatar: { type: 'string', example: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sachin' },
          clientId: { type: 'string', example: 'cli-2' },
        },
      },
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
          clientId: { type: 'string', example: 'cli-2' },
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
          clientId: { type: 'string', default: 'cli-2' },
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
