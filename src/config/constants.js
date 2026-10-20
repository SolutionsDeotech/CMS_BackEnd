export const USER_ROLES = {
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
  OWNER_ADMIN: 'OwnerAdmin',
  EDITOR: 'Editor',
  CONTENT_WRITER: 'Content Writer',
  CONTRIBUTOR: 'Contributor',
  GUEST_AUTHOR: 'Guest Author',
  INDIVIDUAL_USER: 'Individual User',
}

export const PERMISSIONS = {
  FULL_ACCESS: 'Full Access',
  LIMITED_ACCESS: 'Limited Access',
  CAN_VIEW_ONLY: 'Can View Only',
}

export const POST_STATUS = {
  PUBLISHED: 'published',
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  SCHEDULED: 'scheduled',
  ARCHIVED: 'archived',
}

export const COMMENT_STATUS = {
  APPROVED: 'approved',
  PENDING: 'pending',
  SPAM: 'spam',
  REJECTED: 'rejected',
}

export const MEDIA_CATEGORIES = {
  ALL: 'all',
  IMAGES: 'images',
  VIDEOS: 'videos',
  DOCUMENTS: 'documents',
}

export const DEFAULT_PAGE_LIMIT = 10
export const MAX_PAGE_LIMIT = 100
