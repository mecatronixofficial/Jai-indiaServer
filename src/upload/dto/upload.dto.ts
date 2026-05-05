import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsIn,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

import { Type } from 'class-transformer';

/* =========================
   CONSTANTS
========================= */

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'application/json',
  'application/xml',
  'text/xml',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

/* =========================
   PRESIGNED URL DTO
========================= */
export class PresignedUrlDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES, {
    message: 'Unsupported file type',
  })
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(MAX_FILE_SIZE)
  @Type(() => Number)
  fileSize: number;

  @IsString()
  @IsOptional()
  folderId?: string;
}

/* =========================
   INIT MULTIPART DTO
========================= */
export class InitiateMultipartDto {
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MIME_TYPES)
  mimeType: string;

  @IsNumber()
  @Min(1)
  @Max(MAX_FILE_SIZE)
  @Type(() => Number)
  fileSize: number;

  @IsString()
  @IsOptional()
  folderId?: string;
}

/* =========================
   MULTIPART PART DTO
========================= */
export class MultipartPartDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  partNumber: number;

  @IsString()
  @IsNotEmpty()
  etag: string;
}

/* =========================
   COMPLETE MULTIPART DTO
========================= */
export class CompleteMultipartDto {
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @IsString()
  @IsNotEmpty()
  key: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MultipartPartDto)
  parts: MultipartPartDto[];
}
