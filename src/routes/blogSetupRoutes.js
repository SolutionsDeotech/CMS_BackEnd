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
import { optionalAuth, verifyToken } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { blogSetupSchemas, themeSchemas } from '../middleware/validationSchemas.js'

const router = Router()

// --- 1. SuperAdmin Unified Template Builder ---
router.get('/templates', optionalAuth, getTemplate)
router.put('/templates', verifyToken, validate(blogSetupSchemas.template), updateTemplate)
router.post('/templates/publish', verifyToken, validate(blogSetupSchemas.templatePublish), publishTemplate)
router.get('/templates/versions', optionalAuth, getTemplateVersions)
router.post('/templates/rollback/:version', verifyToken, validate(themeSchemas.empty), rollbackTemplate)
router.post('/templates/reset', verifyToken, validate(themeSchemas.empty), resetTemplate)

// --- 2. Website Onboarding Wizard Hub ---
router.get('/onboarding/websites', optionalAuth, getOnboardingWebsites)
router.get('/onboarding/websites/:id', optionalAuth, getOnboardingWebsiteById)
router.post('/onboarding/websites', verifyToken, validate(blogSetupSchemas.onboardingWebsite), createOnboardingWebsite)
router.put('/onboarding/websites/:id', verifyToken, validate(blogSetupSchemas.onboardingUpdate), updateOnboardingWebsite)
router.post('/onboarding/probe', validate(blogSetupSchemas.probe), probeWebsiteReachability)
router.post('/onboarding/verify-domain', validate(blogSetupSchemas.verifyDomain), verifyDomainOwnership)
router.post('/onboarding/validate-location', verifyToken, validate(blogSetupSchemas.validateLocation), validateBlogLocation)
router.post('/onboarding/websites/:id/invitations', verifyToken, validate(blogSetupSchemas.invitation), createOnboardingInvitation)
router.post('/onboarding/websites/:id/invitations/:invitationId/resend', verifyToken, validate(themeSchemas.empty), resendOnboardingInvitation)
router.delete('/onboarding/websites/:id/invitations/:invitationId', verifyToken, revokeOnboardingInvitation)
router.put('/onboarding/websites/:id/test-post', verifyToken, validate(blogSetupSchemas.testPost), saveOnboardingTestPost)

// --- 3. Client Admin: Blog Home Settings & Widgets ---
router.get('/settings/home', optionalAuth, getBlogHomeSettings)
router.put('/settings/home', verifyToken, validate(blogSetupSchemas.homeSettings), updateBlogHomeSettings)

// --- 4. Client Admin: Comment Policies & Spam Keyword Rules ---
router.get('/settings/comments', optionalAuth, getCommentSettings)
router.put('/settings/comments', verifyToken, validate(blogSetupSchemas.commentSettings), updateCommentSettings)

// --- 5. Client Admin: Integrations (GA4, GSC, Slack, Meta Pixel, GTM) ---
router.get('/settings/integrations', optionalAuth, getIntegrations)
router.put('/settings/integrations/:serviceKey', verifyToken, validate(blogSetupSchemas.integrationSettings), updateIntegration)
router.post('/settings/integrations/:serviceKey/test', verifyToken, validate(themeSchemas.empty), testIntegrationConnection)

// --- 6. Writers Management & Author Profiles ---
router.get('/writers', optionalAuth, getWriters)
router.post('/writers', verifyToken, validate(blogSetupSchemas.writer), createWriter)
router.put('/writers/:id', verifyToken, validate(blogSetupSchemas.writerUpdate), updateWriter)
router.delete('/writers/:id', verifyToken, deleteWriter)

// --- 7. Newsletter Signup Widget Settings ---
router.get('/settings/newsletter', optionalAuth, getNewsletterSettings)
router.put('/settings/newsletter', verifyToken, validate(blogSetupSchemas.newsletterSettings), updateNewsletterSettings)

// --- 8. Editorial Team Invites & Permissions ---
router.get('/team', optionalAuth, getTeamMembers)
router.post('/team/invite', verifyToken, validate(blogSetupSchemas.teamInvitation), inviteTeamMember)
router.put('/team/:id', verifyToken, validate(blogSetupSchemas.teamUpdate), updateTeamMember)
router.delete('/team/:id', verifyToken, deleteTeamMember)
router.post('/team/:id/resend-invite', verifyToken, validate(themeSchemas.empty), resendTeamInvite)
router.patch('/team/:id/permissions', verifyToken, validate(blogSetupSchemas.teamPermissions), updateTeamMemberPermissions)

// --- 9. Content import/export and post-trash cleanup ---
router.post('/content/import', verifyToken, importPosts)
router.get('/content/export', verifyToken, exportPosts)
router.delete('/content/trash', verifyToken, validate(themeSchemas.empty), emptyPostTrash)

export default router
