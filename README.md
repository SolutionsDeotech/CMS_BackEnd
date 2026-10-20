# Deotech Solutions - Enterprise Multi-Tenant CMS Backend

Enterprise-grade RESTful API backend built with Node.js, Express, and MongoDB (with resilient fallback storage) designed specifically to power the **Deotech Solutions CMS Frontend**.

---

## 🚀 Key Features & Standards

- **ES Modules (`"type": "module"`)**: Modern JavaScript standard.
- **Resilient Storage Architecture**: Supports full MongoDB / Mongoose models and indices, plus an automatic In-Memory / File Fallback Mode so the backend is **100% turnkey and runnable out-of-the-box** even if MongoDB is not locally running.
- **Role-Based Access Control (RBAC)**: Support for `Admin`, `Super Admin`, `OwnerAdmin`, `Editor`, `Content Writer`, `Contributor`, `Guest Author`, and permissions (`Full Access`, `Limited Access`, `Can View Only`).
- **JWT Authentication & Security**:
  - Access tokens & refresh secrets
  - Password hashing via `bcryptjs`
  - Active session tracking and remote device revocation
  - Forgot Password OTP verification flow
  - `helmet` security headers & rate limiting
- **File & Media Management**:
  - Multipart upload using `multer` with MIME-type filtering
  - Automatic categorization: `images/`, `videos/`, `documents/`
  - Public static serving on `/uploads/`
- **Error Handling**: Centralized operational error system (`AppError`) with custom HTTP status codes and standard JSON responses.
- **Logging**: Request-level HTTP logging with `morgan` and structured timestamped application logs with `winston`.

---

## 📂 Project Structure

```
CMS_BackEnd/
├── src/
│   ├── config/
│   │   ├── constants.js          # Role enums, statuses, permissions, defaults
│   │   └── db.js                 # Resilient MongoDB connector
│   ├── controllers/
│   │   ├── authController.js     # Register, login, OTP, profile, sessions
│   │   ├── postsController.js    # Blog post CRUD, search, workflow, stats
│   │   ├── commentsController.js # Comment threads, replies, likes, notifications
│   │   ├── taxonomyController.js # Categories & Tags management
│   │   ├── mediaController.js    # File upload, categorization, batch delete
│   │   ├── pagesController.js    # Core & child pages (Home, About, Services)
│   │   ├── clientsController.js  # Multi-tenant onboarding, themes, detection
│   │   └── opsController.js      # Analytics, SEO health, redirects, newsletter
│   ├── middleware/
│   │   ├── auth.js               # JWT verification & RBAC authorization
│   │   ├── errorHandler.js       # Global standard error handler
│   │   ├── rateLimiter.js        # Express rate limiting
│   │   ├── upload.js             # Multer upload configuration
│   │   └── validator.js          # Joi schema validation
│   ├── models/
│   │   ├── User.js               # User accounts, credentials, active sessions
│   │   ├── Post.js               # Blog posts with metadata & publishing workflow
│   │   ├── Comment.js            # Comments with nested replies & moderation
│   │   ├── Category.js           # Categories with color & post count
│   │   ├── Tag.js                # Tags
│   │   ├── Page.js               # Dynamic page layouts & section configurations
│   │   ├── Media.js              # Media items & file assets
│   │   ├── Client.js             # Multi-tenant client organizations & themes
│   │   ├── Redirect.js           # 301/302 URL redirects
│   │   ├── Activity.js           # Audit & activity logging
│   │   └── Newsletter.js         # Newsletter subscribers
│   ├── routes/                   # Modular route mounts
│   ├── seed/
│   │   └── mockData.js           # Frontend-aligned seed data
│   ├── services/
│   │   └── store.js              # Unified memory & Mongo sync repository
│   ├── utils/
│   │   ├── AppError.js           # Custom operational error
│   │   ├── asyncHandler.js       # Async wrapper
│   │   ├── helpers.js            # Slugify, pagination, read time, responses
│   │   └── logger.js             # Winston structured logger
│   └── app.js                    # Express application setup
├── uploads/                      # Uploaded files
│   ├── documents/
│   ├── images/
│   └── videos/
├── .env.example                  # Environment configuration template
├── .gitignore
├── package.json
├── server.js                     # Server entry point
└── README.md
```

---

## ⚙️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

The server will start on `http://localhost:5000`:
- **Health Check**: `http://localhost:5000/api/v1/health`
- **API Overview**: `http://localhost:5000/api/v1`

---

## 📡 Key API Endpoints

### 🔐 Authentication (`/api/v1/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register new user account |
| `POST` | `/api/v1/auth/login` | Login with email & password |
| `POST` | `/api/v1/auth/forgot-password` | Request 6-digit reset OTP |
| `POST` | `/api/v1/auth/verify-otp` | Verify reset OTP |
| `POST` | `/api/v1/auth/reset-password` | Reset password using OTP |
| `GET` | `/api/v1/auth/me` | Get current authenticated user |
| `PUT` | `/api/v1/auth/profile` | Update profile information |
| `PUT` | `/api/v1/auth/change-password` | Change user password |
| `GET` | `/api/v1/auth/sessions` | List active sessions |
| `POST` | `/api/v1/auth/logout-all` | Revoke all other device sessions |

### 📝 Blog Posts (`/api/v1/posts`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/posts` | List posts (filters: `q`, `category`, `tag`, `status`, `page`, `limit`) |
| `GET` | `/api/v1/posts/:idOrSlug` | Get single post by ID or slug |
| `POST` | `/api/v1/posts` | Create new post |
| `PUT` | `/api/v1/posts/:id` | Update post content & metadata |
| `PATCH`| `/api/v1/posts/:id/status` | Update post publishing status |
| `DELETE`| `/api/v1/posts/:id` | Delete post |
| `GET` | `/api/v1/posts/stats/overview` | Dashboard metrics & chart data |

### 💬 Comments (`/api/v1/comments`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/comments` | List comments with filters |
| `POST` | `/api/v1/comments` | Add comment to post |
| `POST` | `/api/v1/comments/:id/reply` | Reply to a comment |
| `PATCH`| `/api/v1/comments/:id/like` | Like a comment |
| `PATCH`| `/api/v1/comments/:id/status` | Moderation (`approved`, `pending`, `spam`) |
| `GET` | `/api/v1/comments/notifications` | Author notifications on comments |

### 🖼️ Media (`/api/v1/media`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/media` | List media files (filter: `category=images\|videos\|documents`) |
| `POST` | `/api/v1/media/upload` | Multipart file upload (`file` field) |
| `POST` | `/api/v1/media/delete-batch` | Batch delete media by keys |
| `DELETE`| `/api/v1/media/:id` | Delete single media item |

### 🏢 Multi-Tenant Clients (`/api/v1/clients`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/clients` | List tenant websites |
| `POST` | `/api/v1/clients` | Onboard new client website |
| `GET` | `/api/v1/clients/:id/theme` | Get client theme configuration |
| `PUT` | `/api/v1/clients/:id/theme` | Update client theme tokens & CSS |
| `POST` | `/api/v1/clients/:id/theme/detect` | Auto-detect brand theme from website URL |

### 📄 Pages & Operations (`/api/v1`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/pages` | List core pages or child pages (`?parent=Services`) |
| `GET` | `/api/v1/pages/:slugOrId` | Get page details & sections |
| `PUT` | `/api/v1/pages/:slugOrId` | Save page content (Hero, About, Services) |
| `GET` | `/api/v1/analytics/overview` | Pageviews, visitors & chart data |
| `GET` | `/api/v1/seo/health` | SEO audit score & checks |
| `GET` | `/api/v1/redirects` | URL redirect rules |
| `POST` | `/api/v1/newsletter/subscribe` | Public newsletter subscriber endpoint |
