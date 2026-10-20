import { Router } from 'express'
import {
  getMedia,
  uploadMedia,
  deleteMedia,
  batchDeleteMedia,
} from '../controllers/mediaController.js'
import { upload } from '../middleware/upload.js'
import { verifyToken, optionalAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', optionalAuth, getMedia)
router.post('/upload', verifyToken, upload.single('file'), uploadMedia)
router.post('/delete-batch', verifyToken, batchDeleteMedia)
router.delete('/:id', verifyToken, deleteMedia)

export default router
