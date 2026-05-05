import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OtpPurpose } from '../../common/enums';

export type OtpDocument = Otp & Document;

@Schema({
  timestamps: true,
  collection: 'otps',
})
export class Otp {
  /* =========================
     USER INFO
  ========================= */

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  /* =========================
     SECURITY
  ========================= */

  @Prop({ required: true })
  codeHash: string;

  @Prop({
    type: String,
    enum: OtpPurpose,
    required: true,
  })
  purpose: OtpPurpose;

  /* =========================
     EXPIRY (TTL)
  ========================= */

  @Prop({ required: true })
  expiresAt: Date;

  /* =========================
     ATTEMPTS / STATUS
  ========================= */

  @Prop({ default: false })
  isUsed: boolean;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: 5 })
  maxAttempts: number;

  /* =========================
     META
  ========================= */

  @Prop({ default: null })
  ip: string;

  @Prop({ default: null })
  userAgent: string;

  @Prop({ type: Types.ObjectId, ref: 'FileRecord', default: null })
  fileId?: Types.ObjectId;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

/* =========================
   INDEXES (ONLY HERE)
========================= */

/**
 * Fast lookup for OTP verification
 */
OtpSchema.index({ userId: 1, purpose: 1 });

/**
 * Email-based OTP lookup
 */
OtpSchema.index({ email: 1, purpose: 1 });

/**
 * TTL auto delete expired OTPs
 */
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Prevent multiple active OTPs per user + purpose
 */
OtpSchema.index(
  { userId: 1, purpose: 1, isUsed: 1 },
  { unique: true, partialFilterExpression: { isUsed: false } },
);
