import {
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/* =========================
   SAVE FILE METADATA
========================= */
export class SaveFileMetadataDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  originalName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(10 * 1024 * 1024 * 1024) // 10GB
  @Type(() => Number)
  size: number;

  @IsString()
  @IsNotEmpty()
  key: string; // R2 object key

  @IsMongoId()
  @IsOptional()
  folderId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

/* =========================
   FILE QUERY
========================= */
export class FileQueryDto {
  @IsMongoId()
  @IsOptional()
  folderId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsOptional()
  limit: number = 20;

  @IsString()
  @IsOptional()
  sortBy: string = 'createdAt';

  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: 'asc' | 'desc' = 'desc';
}

/* =========================
   DELETE FILE
========================= */
export class DeleteFileDto {
  @IsString()
  @IsNotEmpty()
  otpCode: string;
}

/* =========================
   RENAME FILE
========================= */
export class RenameFileDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;
}

/* =========================
   SHARE FILE
========================= */
export class ShareFileDto {
  @IsArray()
  @IsMongoId({ each: true })
  userIds: string[];
}

/* =========================
   BULK DELETE
========================= */
export class BulkDeleteDto {
  @IsArray()
  @IsMongoId({ each: true })
  fileIds: string[];

  @IsString()
  @IsNotEmpty()
  otpCode: string;
}

/* =========================
   BULK RESTORE
========================= */
export class BulkRestoreDto {
  @IsArray()
  @IsMongoId({ each: true })
  fileIds: string[];
}

/* =========================
   BULK MOVE
========================= */
export class BulkMoveDto {
  @IsArray()
  @IsMongoId({ each: true })
  fileIds: string[];

  @IsMongoId()
  @IsOptional()
  folderId?: string; // null = root
}