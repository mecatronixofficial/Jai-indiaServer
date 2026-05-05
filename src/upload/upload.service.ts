import { Injectable, BadRequestException, Logger } from '@nestjs/common';

import { R2Service } from '../r2/r2.service';
import {
  PresignedUrlDto,
  InitiateMultipartDto,
  CompleteMultipartDto,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from './dto/upload.dto';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly r2Service: R2Service) {}

  /* =========================
     HELPERS
  ========================= */
  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private validateFile(mimeType: string, size: number) {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }

    if (size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `Max file size is ${MAX_FILE_SIZE / (1024 * 1024 * 1024)} GB`,
      );
    }
  }

  /* =========================
     PRESIGNED URL
  ========================= */
  async generatePresignedUrl(dto: PresignedUrlDto, userId: string) {
    this.validateFile(dto.mimeType, dto.fileSize);

    const safeName = this.sanitizeFileName(dto.fileName);
    const key = this.r2Service.generateKey(safeName, userId);

    const { uploadUrl } = await this.r2Service.generatePresignedUploadUrl(
      key,
      dto.mimeType,
      dto.fileSize,
    );

    this.logger.log(
      `Presigned URL generated | user=${userId} | key=${key} | size=${dto.fileSize}`,
    );

    return {
      uploadUrl,
      key,
      expiresIn: 3600,
    };
  }

  /* =========================
     MULTIPART INIT
  ========================= */
  async initiateMultipartUpload(dto: InitiateMultipartDto, userId: string) {
    this.validateFile(dto.mimeType, dto.fileSize);

    const safeName = this.sanitizeFileName(dto.fileName);
    const key = this.r2Service.generateKey(safeName, userId);

    const uploadId = await this.r2Service.createMultipartUpload(
      key,
      dto.mimeType,
    );

    const partSize = 50 * 1024 * 1024; // 50MB

    this.logger.log(
      `Multipart initiated | user=${userId} | key=${key} | size=${dto.fileSize}`,
    );

    return {
      uploadId,
      key,
      partSize,
    };
  }

  /* =========================
     MULTIPART COMPLETE
  ========================= */
  async completeMultipartUpload(dto: CompleteMultipartDto, userId: string) {
    if (!dto.parts?.length) {
      throw new BadRequestException('Parts list cannot be empty');
    }

    await this.r2Service.completeMultipartUpload(
      dto.uploadId,
      dto.key,
      dto.parts,
    );

    this.logger.log(
      `Multipart completed | user=${userId} | key=${dto.key} | parts=${dto.parts.length}`,
    );

    return {
      key: dto.key,
      message: 'Upload complete. Save metadata via /files',
    };
  }
}
