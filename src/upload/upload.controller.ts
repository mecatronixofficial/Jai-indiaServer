import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { UploadService } from './upload.service';
import {
  PresignedUrlDto,
  InitiateMultipartDto,
  CompleteMultipartDto,
} from './dto/upload.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';

import { TransactionsService } from '../transactions/transactions.service';
import { TransactionAction } from '../common/enums';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly transactionsService: TransactionsService,
  ) {}

  /* =========================
     PRESIGNED URL
  ========================= */
  @Post('presigned-url')
  @HttpCode(HttpStatus.OK)
  async getPresignedUrl(
    @Body() dto: PresignedUrlDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.uploadService.generatePresignedUrl(
      dto,
      user._id.toString(),
    );

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.UPLOAD_FILE,
      ip,
      metadata: {
        fileName: dto.fileName,
        size: dto.fileSize,
        mimeType: dto.mimeType,
      },
    });

    return {
      success: true,
      message: 'Presigned upload URL generated successfully',
      data: result,
    };
  }

  /* =========================
     MULTIPART INIT
  ========================= */
  @Post('multipart/initiate')
  @HttpCode(HttpStatus.OK)
  async initiateMultipart(
    @Body() dto: InitiateMultipartDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.uploadService.initiateMultipartUpload(
      dto,
      user._id.toString(),
    );

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.INIT_MULTIPART_UPLOAD,
      ip,
      metadata: {
        fileName: dto.fileName,
        size: dto.fileSize,
      },
    });

    return {
      success: true,
      message: 'Multipart upload initiated',
      data: result,
    };
  }

  /* =========================
     MULTIPART COMPLETE
  ========================= */
  @Post('multipart/complete')
  @HttpCode(HttpStatus.OK)
  async completeMultipart(
    @Body() dto: CompleteMultipartDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.uploadService.completeMultipartUpload(
      dto,
      user._id.toString(),
    );

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.COMPLETE_MULTIPART_UPLOAD,
      ip,
      metadata: {
        uploadId: dto.uploadId,
        parts: dto.parts.length,
      },
    });

    return {
      success: true,
      message: 'Multipart upload completed',
      data: result,
    };
  }
}
