import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FolderDocument = Folder & Document;

@Schema({
  timestamps: true,
  collection: 'folders',
})
export class Folder {
  /* =========================
     BASIC INFO
  ========================= */

  @Prop({ required: true, trim: true, maxlength: 200 })
  name: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'Folder',
    default: null,
  })
  parentId: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: Types.ObjectId;

  /* =========================
     SOFT DELETE
  ========================= */

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  /* =========================
     OPTIONAL METADATA
  ========================= */

  @Prop({ type: String, default: '', maxlength: 500 })
  description: string;

  /* =========================
     SHARING SYSTEM
  ========================= */

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'User' }],
    default: [],
  })
  sharedWith: Types.ObjectId[];

  /* =========================
     HIERARCHY PATH
  ========================= */

  @Prop({ type: String, default: '/' })
  path: string;
}

export const FolderSchema = SchemaFactory.createForClass(Folder);

/* =========================
   INDEXES (ONLY HERE)
========================= */

/**
 * User workspace + soft delete filter
 */
FolderSchema.index({ createdBy: 1, isDeleted: 1 });

/**
 * Tree navigation performance
 */
FolderSchema.index({ parentId: 1, isDeleted: 1 });

/**
 * Path-based lookup (fast folder tree resolution)
 */
FolderSchema.index({ path: 1 });

/**
 * Soft delete cleanup / admin queries
 */
FolderSchema.index({ isDeleted: 1, deletedAt: -1 });

/**
 * Prevent duplicate folder names in same structure
 */
FolderSchema.index({
  name: 1,
  parentId: 1,
  createdBy: 1,
  isDeleted: 1,
});
