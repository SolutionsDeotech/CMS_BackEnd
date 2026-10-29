import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { USER_ROLES, PERMISSIONS } from '../config/constants.js'

const userSchema = new mongoose.Schema(
  {
    customId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    userType: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.CONTENT_WRITER,
    },
    role: {
      type: String,
      default: 'Content Writer',
    },
    permission: {
      type: String,
      enum: Object.values(PERMISSIONS),
      default: PERMISSIONS.LIMITED_ACCESS,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    country: {
      type: String,
      default: 'India',
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: '',
    },
    avatar: {
      type: String,
      default: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
    },
    status: {
      type: String,
      enum: ['active', 'pending_invite', 'deactivated'],
      default: 'active',
    },
    clientId: {
      type: String,
      default: 'cli-1',
    },
    canViewComments: {
      type: Boolean,
      default: false,
    },
    canReplyComments: {
      type: Boolean,
      default: false,
    },
    activeSessions: [
      {
        id: { type: String, required: true },
        device: { type: String, default: 'Chrome on macOS' },
        ip: { type: String, default: '127.0.0.1' },
        location: { type: String, default: 'Jaipur' },
        lastActive: { type: String, default: 'Just now' },
        isCurrent: { type: Boolean, default: false },
      },
    ],
    resetPasswordOtp: String,
    resetPasswordExpires: Date,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret.customId || ret._id
        delete ret.__v
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret.customId || ret._id
        delete ret.__v
        return ret
      },
    },
  }
)

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next()
  }
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, email: this.email, userType: this.userType, role: this.role },
    process.env.JWT_SECRET || 'cms_super_secret_jwt_access_key_2026_deotech',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  )
}

export const User = mongoose.model('User', userSchema)
export default User
