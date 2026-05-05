import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TransactionAction } from '../../common/enums';

export type TransactionDocument = Transaction & Document;

@Schema({
  timestamps: true,
  collection: 'transactions',
})
export class Transaction {
  /* =========================
     REFERENCES
  ========================= */

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: TransactionAction,
    required: true,
  })
  action: TransactionAction;

  @Prop({ type: Types.ObjectId, ref: 'FileRecord', default: null })
  fileId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Folder', default: null })
  folderId: Types.ObjectId;

  /* =========================
     REQUEST INFO
  ========================= */

  @Prop({ required: true })
  ip: string;

  @Prop({ default: null })
  userAgent: string;

  /* =========================
     STATUS
  ========================= */

  @Prop({
    type: String,
    enum: ['SUCCESS', 'FAILED'],
    default: 'SUCCESS',
  })
  status: 'SUCCESS' | 'FAILED';

  /* =========================
     METADATA
  ========================= */

  @Prop({
    type: Object,
    default: {},
  })
  metadata: {
    fileName?: string;
    size?: number;
    mimeType?: string;
    uploadId?: string;
    error?: string;
    [key: string]: any;
  };

  /* =========================
     TTL FIELD
  ========================= */

  @Prop({ default: null })
  expiresAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

/* =========================
   INDEXES (ONLY HERE)
========================= */

/**
 * Fast lookup: user activity filtering
 */
TransactionSchema.index({ userId: 1, action: 1 });

/**
 * File-related queries
 */
TransactionSchema.index({ fileId: 1 });

/**
 * Sorting / admin logs
 */
TransactionSchema.index({ createdAt: -1 });

/**
 * IP tracking / security
 */
TransactionSchema.index({ ip: 1 });

/**
 * TTL auto cleanup
 */
TransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
