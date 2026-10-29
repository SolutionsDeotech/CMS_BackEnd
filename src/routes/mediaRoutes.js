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
import { verifyToken, optionalAuth } from '../middleware/auth.js'
import validate from '../middleware/validator.js'
import { mediaSchemas, themeSchemas } from '../middleware/validationSchemas.js'

const router = Router()

router.get('/', optionalAuth, getMedia)
router.post('/upload', verifyToken, upload.single('file'), uploadMedia)
router.post('/delete-batch', verifyToken, validate(mediaSchemas.batchDelete), batchDeleteMedia)
router.patch('/:id/rename', verifyToken, validate(mediaSchemas.rename), renameMedia)
router.post('/:id/compress', verifyToken, validate(mediaSchemas.empty), compressMedia)
router.delete('/:id', verifyToken, validate(themeSchemas.empty), deleteMedia)

export default router
