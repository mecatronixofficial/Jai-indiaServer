import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Role } from '../../common/enums';

export type UserDocument = User & Document;

@Schema({
  timestamps: true,
  collection: 'users',
  toJSON: {
    virtuals: true,
    transform: function (_doc, ret: any) {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.__v;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({
    required: true,
    lowercase: true,
    trim: true,
    unique: true, // ✅ THIS IS ENOUGH
    index: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  // 🔐 Refresh Token (hashed)
  @Prop({ type: String, default: null, select: false })
  refreshToken: string | null;

  @Prop({
    type: String,
    enum: Role,
    default: Role.USER,
  })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop()
  lastLoginAt: Date;

  @Prop({ trim: true, maxlength: 100 })
  department: string;

  @Prop({
    trim: true,
    match: /^[0-9]{10}$/,
  })
  phone: string;

  @Prop({ default: 0, select: false }) // 🔐 hide internal security field
  tokenVersion: number;

  @Prop({
    default: 10 * 1024 * 1024 * 1024,
    min: 100 * 1024 * 1024,
  })
  storageQuota: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

/* =========================
   INDEXES (PRO LEVEL)
========================= */

// 🔍 Search optimization
UserSchema.index({ name: 1 });

// 🔐 Role + status queries
UserSchema.index({ role: 1, isActive: 1 });

// 👤 Ownership queries
UserSchema.index({ createdBy: 1 });

/* =========================
   MIDDLEWARE (PRO)
========================= */

// 🔐 Ensure email always lowercase
UserSchema.pre('save', function (next) {
  if (this.email) {
    this.email = this.email.toLowerCase();
  }
  next();
});

/* =========================
   VIRTUALS
========================= */

UserSchema.virtual('displayName').get(function (this: User) {
  return `${this.name} (${this.email})`;
});
