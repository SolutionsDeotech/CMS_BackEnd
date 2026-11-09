import { Router } from 'express'
import {
  getTemplate,
  updateTemplate,
  publishTemplate,
  getTemplateVersions,
  rollbackTemplate,
  resetTemplate,
} from '../controllers/templateController.js'
import {
  getOnboardingWebsites,
  getOnboardingWebsiteById,
  createOnboardingWebsite,
  updateOnboardingWebsite,
  deleteOnboardingWebsite,
  probeWebsiteReachability,
  verifyDomainOwnership,
  validateBlogLocation,
  createOnboardingInvitation,
  resendOnboardingInvitation,
  revokeOnboardingInvitation,
  saveOnboardingTestPost,
} from '../controllers/onboardingController.js'
import {
  getBlogHomeSettings,
  updateBlogHomeSettings,
  getCommentSettings,
  updateCommentSettings,
  getIntegrations,
  updateIntegration,
  testIntegrationConnection,
  getWriters,
  createWriter,
  updateWriter,
  deleteWriter,
  getNewsletterSettings,
  updateNewsletterSettings,
  getTeamMembers,
  inviteTeamMember,
  updateTeamMember,
  deleteTeamMember,
  resendTeamInvite,
  updateTeamMemberPermissions,
  importPosts,
  exportPosts,
  emptyPostTrash,
} from '../controllers/blogSetupController.js'
import {
  optionalAuth,
  verifyToken,
  requireAdmin,
  requireOwnerAdminOrAdmin,
  requireClientAdminOrHigher,
  requireOnboardingAccess,
} from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { blogSetupSchemas, themeSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// --- 1. SuperAdmin Unified Template Builder (Primary Global Admin ONLY) ---
router.get('/templates', optionalAuth, getTemplate)
router.put('/templates', verifyToken, requireAdmin, validate(blogSetupSchemas.template), updateTemplate)
router.post('/templates/publish', verifyToken, requireAdmin, validate(blogSetupSchemas.templatePublish), publishTemplate)
router.get('/templates/versions', optionalAuth, getTemplateVersions)
router.post('/templates/rollback/:version', verifyToken, requireAdmin, validate(themeSchemas.empty), rollbackTemplate)
router.post('/templates/reset', verifyToken, requireAdmin, validate(themeSchemas.empty), resetTemplate)

// --- 2. Website Onboarding Wizard Hub ---
router.get('/onboarding/websites', optionalAuth, getOnboardingWebsites)
router.get('/onboarding/websites/:id', optionalAuth, getOnboardingWebsiteById)
router.post('/onboarding/websites', verifyToken, requireOnboardingAccess, validate(blogSetupSchemas.onboardingWebsite), createOnboardingWebsite)
router.put('/onboarding/websites/:id', verifyToken, requireOnboardingAccess, validate(blogSetupSchemas.onboardingUpdate), updateOnboardingWebsite)
router.delete('/onboarding/websites/:id', verifyToken, requireOnboardingAccess, deleteOnboardingWebsite)
router.post('/onboarding/probe', validate(blogSetupSchemas.probe), probeWebsiteReachability)
router.post('/onboarding/verify-domain', validate(blogSetupSchemas.verifyDomain), verifyDomainOwnership)
router.post('/onboarding/validate-location', verifyToken, requireOnboardingAccess, validate(blogSetupSchemas.validateLocation), validateBlogLocation)
router.post('/onboarding/websites/:id/invitations', verifyToken, requireOnboardingAccess, validate(blogSetupSchemas.invitation), createOnboardingInvitation)
router.post('/onboarding/websites/:id/invitations/:invitationId/resend', verifyToken, requireOnboardingAccess, validate(themeSchemas.empty), resendOnboardingInvitation)
router.delete('/onboarding/websites/:id/invitations/:invitationId', verifyToken, requireOnboardingAccess, revokeOnboardingInvitation)
router.put('/onboarding/websites/:id/test-post', verifyToken, requireOnboardingAccess, validate(blogSetupSchemas.testPost), saveOnboardingTestPost)

// --- 3. Client Admin & Owner Admin: Blog Home Settings & Widgets (Website-scoped) ---
router.get('/settings/home', optionalAuth, getBlogHomeSettings)
router.put('/settings/home', verifyToken, requireOwnerAdminOrAdmin, validate(blogSetupSchemas.homeSettings), updateBlogHomeSettings)

// --- 4. Client Admin & Owner Admin: Comment Policies & Spam Keyword Rules ---
router.get('/settings/comments', optionalAuth, getCommentSettings)
router.put('/settings/comments', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.commentSettings), updateCommentSettings)

// --- 5. Client Admin & Owner Admin: Integrations (GA4, GSC, Slack, Meta Pixel, GTM) ---
router.get('/settings/integrations', optionalAuth, getIntegrations)
router.put('/settings/integrations/:serviceKey', verifyToken, requireOwnerAdminOrAdmin, validate(blogSetupSchemas.integrationSettings), updateIntegration)
router.post('/settings/integrations/:serviceKey/test', verifyToken, requireOwnerAdminOrAdmin, validate(themeSchemas.empty), testIntegrationConnection)

// --- 6. Writers Management & Author Profiles (Owner Admin, Client Admin, or Global Admin) ---
router.get('/writers', optionalAuth, getWriters)
router.post('/writers', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.writer), createWriter)
router.put('/writers/:id', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.writerUpdate), updateWriter)
router.delete('/writers/:id', verifyToken, requireClientAdminOrHigher, deleteWriter)

// --- 7. Newsletter Signup Widget Settings ---
router.get('/settings/newsletter', optionalAuth, getNewsletterSettings)
router.put('/settings/newsletter', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.newsletterSettings), updateNewsletterSettings)

// --- 8. Editorial Team Invites & Permissions (Owner Admin, Client Admin, or Global Admin) ---
router.get('/team', optionalAuth, getTeamMembers)
router.post('/team/invite', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.teamInvitation), inviteTeamMember)
router.put('/team/:id', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.teamUpdate), updateTeamMember)
router.delete('/team/:id', verifyToken, requireClientAdminOrHigher, deleteTeamMember)
router.post('/team/:id/resend-invite', verifyToken, requireClientAdminOrHigher, validate(themeSchemas.empty), resendTeamInvite)
router.patch('/team/:id/permissions', verifyToken, requireClientAdminOrHigher, validate(blogSetupSchemas.teamPermissions), updateTeamMemberPermissions)

// --- 9. Content import/export and post-trash cleanup ---
router.post('/content/import', verifyToken, importPosts)
router.get('/content/export', verifyToken, exportPosts)
router.delete('/content/trash', verifyToken, validate(themeSchemas.empty), emptyPostTrash)

export default router
