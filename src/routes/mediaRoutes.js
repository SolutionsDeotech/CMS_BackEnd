import { Router } from 'express'
import {
  getMedia,
  uploadMedia,
  deleteMedia,
  batchDeleteMedia,
  renameMedia,
  compressMedia,
} from '../controllers/mediaController.js'
import { upload } from '../middleware/upload.js'
import { verifyToken, optionalAuth, requirePermission } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { mediaSchemas, themeSchemas } from '../middleware/validationSchemas.js'

const router = Router()

router.get('/', optionalAuth, getMedia)
router.post('/', verifyToken, requirePermission('media', 'create'), upload.single('file'), uploadMedia)
router.post('/upload', verifyToken, requirePermission('media', 'create'), upload.single('file'), uploadMedia)
router.post('/delete-batch', verifyToken, requirePermission('media', 'delete'), validate(mediaSchemas.batchDelete), batchDeleteMedia)
router.patch('/:id/rename', verifyToken, requirePermission('media', 'edit'), validate(mediaSchemas.rename), renameMedia)
router.post('/:id/compress', verifyToken, requirePermission('media', 'edit'), validate(mediaSchemas.empty), compressMedia)
router.delete('/:id', verifyToken, requirePermission('media', 'delete'), validate(themeSchemas.empty), deleteMedia)

export default router
