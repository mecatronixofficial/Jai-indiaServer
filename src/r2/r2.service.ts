import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly presignedUploadExpiry: number;
  private readonly presignedDownloadExpiry: number;
  private readonly maxFileSize: number;

  constructor(private configService: ConfigService) {
    const accountId = this.configService.get<string>('r2.accountId');
    const accessKeyId = this.configService.get<string>('r2.accessKeyId');
    const secretAccessKey = this.configService.get<string>('r2.secretAccessKey');
    const endpointFromEnv = this.configService.get<string>('r2.endpoint');

    const bucket = this.configService.get<string>('r2.bucketName');
    const uploadExpiry = this.configService.get<number>('r2.presignedUploadExpiry') ?? 3600;
    const downloadExpiry = this.configService.get<number>('r2.presignedDownloadExpiry') ?? 900;

    this.maxFileSize =
      this.configService.get<number>('r2.maxFileSize') ??
      10 * 1024 * 1024 * 1024;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      this.logger.error('❌ Missing R2 configuration');
      throw new Error('R2 configuration is incomplete');
    }

    const endpoint =
      endpointFromEnv ||
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.bucketName = bucket;
    this.presignedUploadExpiry = uploadExpiry;
    this.presignedDownloadExpiry = downloadExpiry;

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log('✅ R2 Service initialized');
  }

  /* =========================
     KEY GENERATION
  ========================= */
  generateKey(fileName: string, userId: string): string {
    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'bin';
    return `uploads/${userId}/${Date.now()}-${uuidv4()}.${ext}`;
  }

  /* =========================
     PRESIGNED UPLOAD
  ========================= */
  async generatePresignedUploadUrl(
    key: string,
    mimeType: string,
    fileSize: number,
  ) {
    if (fileSize > this.maxFileSize) {
      throw new BadRequestException('File too large');
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimeType,
        ContentLength: fileSize,
      });

      const uploadUrl = await getSignedUrl(this.client, command, {
        expiresIn: this.presignedUploadExpiry,
      });

      return { uploadUrl, key };
    } catch (error) {
      this.logger.error(`Upload URL error: ${(error as Error).message}`);
      throw new InternalServerErrorException('Upload URL failed');
    }
  }

  /* =========================
     PRESIGNED DOWNLOAD
  ========================= */
  async generatePresignedDownloadUrl(key: string, fileName?: string) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ResponseContentDisposition: fileName
          ? `attachment; filename="${encodeURIComponent(fileName)}"`
          : undefined,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: this.presignedDownloadExpiry,
      });
    } catch (error) {
      this.logger.error(`Download URL error: ${(error as Error).message}`);
      throw new InternalServerErrorException('Download URL failed');
    }
  }

  /* =========================
     DELETE
  ========================= */
  async deleteObject(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`Delete failed: ${key}`);
      throw new InternalServerErrorException('Delete failed');
    }
  }

  /* =========================
     EXISTS
  ========================= */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /* =========================
     MULTIPART
  ========================= */
  async createMultipartUpload(key: string, mimeType: string) {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: mimeType,
      }),
    );

    if (!res.UploadId) {
      throw new InternalServerErrorException('Upload init failed');
    }

    return res.UploadId;
  }

  async completeMultipartUpload(
    uploadId: string,
    key: string,
    parts: { partNumber: number; etag: string }[],
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      }),
    );
  }

  async abortMultipartUpload(uploadId: string, key: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }
}