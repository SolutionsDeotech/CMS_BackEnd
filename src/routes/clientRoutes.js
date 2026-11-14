import { Router } from 'express'
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientTheme,
  updateClientTheme,
  detectThemeFromUrl,
  getClientThemeVersions,
  publishClientTheme,
  rollbackClientTheme,
  resetClientTheme,
} from '../controllers/clientsController.js'
import {
  getClientIntegration,
  updateClientIntegration,
  testWebhookPing,
  getClientWebhookDeliveries,
  getClientWebhookDeliveryById,
  retryClientWebhookDelivery,
} from '../controllers/universalIntegrationController.js'
import { verifyToken, optionalAuth, requireAdmin, requireOnboardingAccess, requireClientAdminOrHigher } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { clientSchemas } from '../middleware/validationSchemas.js'
import { themeSchemas } from '../middleware/validationSchemas.js'

const router = Router()

router.get('/', validate(clientSchemas.query, 'query'), optionalAuth, getClients)
router.get('/:id', optionalAuth, getClientById)
router.post('/', verifyToken, requireOnboardingAccess, validate(clientSchemas.create), createClient)
router.put('/:id', verifyToken, requireOnboardingAccess, validate(clientSchemas.update), updateClient)
router.delete('/:id', verifyToken, requireOnboardingAccess, deleteClient)

// Client theme endpoints
router.get('/:id/theme', optionalAuth, getClientTheme)
router.put('/:id/theme', verifyToken, validate(themeSchemas.update), updateClientTheme)
router.post('/:id/theme/detect', verifyToken, validate(themeSchemas.detect), detectThemeFromUrl)
router.get('/:id/theme/versions', optionalAuth, getClientThemeVersions)
router.post('/:id/theme/publish', verifyToken, validate(themeSchemas.publish), publishClientTheme)
router.post('/:id/theme/rollback/:version', verifyToken, validate(themeSchemas.empty), rollbackClientTheme)
router.post('/:id/theme/reset', verifyToken, validate(themeSchemas.empty), resetClientTheme)

// Client Universal Integration & Webhooks (Protected, scoped to Tenant Admin or Global Admin)
router.get('/:id/integration', verifyToken, requireClientAdminOrHigher, getClientIntegration)
router.put('/:id/integration', verifyToken, requireClientAdminOrHigher, updateClientIntegration)
router.post('/:id/integration/webhook/test', verifyToken, requireClientAdminOrHigher, testWebhookPing)
router.get('/:id/integration/webhooks/deliveries', verifyToken, requireClientAdminOrHigher, getClientWebhookDeliveries)
router.get('/:id/integration/webhooks/deliveries/:deliveryId', verifyToken, requireClientAdminOrHigher, getClientWebhookDeliveryById)
router.post('/:id/integration/webhooks/deliveries/:deliveryId/retry', verifyToken, requireClientAdminOrHigher, retryClientWebhookDelivery)

export default router
