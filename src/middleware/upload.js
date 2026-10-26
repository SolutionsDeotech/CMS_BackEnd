import multer from 'multer'
import path from 'path'
import fs from 'fs'
import AppError from '../utils/AppError.js'

// Ensure upload directories exist
const uploadDir = path.resolve('uploads')
const imageDir = path.join(uploadDir, 'images')
const videoDir = path.join(uploadDir, 'videos')
const docDir = path.join(uploadDir, 'documents')

;[uploadDir, imageDir, videoDir, docDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
})

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, imageDir)
    } else if (file.mimetype.startsWith('video/')) {
      cb(null, videoDir)
    } else {
      cb(null, docDir)
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const baseName = path.basename(file.originalname, ext).replace(/[^\w-]/g, '_')
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${baseName}-${uniqueSuffix}${ext}`)
  },
})

const fileFilter = (req, file, cb) => {
  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
    '.mp4', '.mov', '.avi', '.mkv',
    '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt',
  ]
  const ext = path.extname(file.originalname).toLowerCase()

  if (allowedExts.includes(ext)) {
    cb(null, true)
  } else {
    cb(
      new AppError(
        `File extension '${ext}' is not supported. Allowed: images, videos, documents.`,
        400
      ),
      false
    )
  }
}

export const upload = multer({
  storage,
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50) * 1024 * 1024,
  },
  fileFilter,
})

export default upload
