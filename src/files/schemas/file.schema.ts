import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FileDocument = FileRecord & Document;

@Schema({
  timestamps: true,
  collection: 'files',
})
export class FileRecord {
  /* =========================
     CORE FILE DATA
  ========================= */

  @Prop({ required: true, trim: true })
  fileName: string;

  @Prop({ required: true })
  originalName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true, min: 1 })
  size: number;

  @Prop({ required: true, unique: true })
  key: string;

  /* =========================
     RELATIONS
  ========================= */

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Folder', default: null })
  folderId: Types.ObjectId | null;

  /* =========================
     SOFT DELETE
  ========================= */

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  deletedBy: Types.ObjectId | null;

  /* =========================
     EXTRA METADATA
  ========================= */

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: Number, default: 0, min: 0 })
  downloadCount: number;

  /* =========================
     SHARING SYSTEM
  ========================= */

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: [],
  })
  sharedWith: Types.ObjectId[];

  /* =========================
     FUTURE READY
  ========================= */

  @Prop({ type: String, default: null })
  checksum?: string;

  @Prop({ type: String, default: null })
  previewUrl?: string;
}

export const FileSchema = SchemaFactory.createForClass(FileRecord);

/* =========================
   INDEXES (ONLY HERE)
========================= */

/**
 * User file listing (main query path)
 */
FileSchema.index({ uploadedBy: 1, isDeleted: 1 });

/**
 * Folder browsing performance
 */
FileSchema.index({ folderId: 1, isDeleted: 1 });

/**
 * Soft delete cleanup queries
 */
FileSchema.index({ isDeleted: 1, deletedAt: -1 });

/**
 * Sharing lookup (who can access file)
 */
FileSchema.index({ sharedWith: 1 });

/**
 * Full-text search (file explorer search bar)
 */
FileSchema.index(
  { fileName: 'text', originalName: 'text' },
  { weights: { fileName: 5, originalName: 3 } },
);
