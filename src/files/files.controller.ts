import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  Patch,
  BadRequestException,
} from '@nestjs/common';

import { FilesService } from './files.service';
import {
  SaveFileMetadataDto,
  FileQueryDto,
  DeleteFileDto,
  RenameFileDto,
  ShareFileDto,
  BulkDeleteDto,
  BulkRestoreDto,
  BulkMoveDto,
} from './dto/file.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';

import { TransactionsService } from '../transactions/transactions.service';
import { TransactionAction } from '../common/enums';

@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly transactionsService: TransactionsService,
  ) {}

  // -------------------------
  // SAVE FILE METADATA
  // -------------------------
  @Post()
  async saveMetadata(
    @Body() dto: SaveFileMetadataDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const userId = user._id.toString();

    const file = await this.filesService.saveMetadata(dto, userId);

    await this.transactionsService.log({
      userId,
      action: TransactionAction.UPLOAD,
      ip,
      fileId: file._id.toString(),
      metadata: {
        fileName: file.fileName,
        size: file.size,
        mimeType: file.mimeType,
      },
    });

    return {
      success: true,
      message: 'File metadata saved successfully',
      data: file,
    };
  }

  // -------------------------
  // LIST FILES
  // -------------------------
  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: FileQueryDto) {
    const result = await this.filesService.findAll(user, query);

    return {
      success: true,
      message: 'Files retrieved successfully',
      data: result,
    };
  }

  // -------------------------
  // TRASH + SHARED
  // -------------------------
  @Get('trash')
  async getTrash(@CurrentUser() user: any) {
    const files = await this.filesService.getTrash(user);

    return {
      success: true,
      message: 'Trash retrieved successfully',
      data: files,
    };
  }

  @Get('shared-with-me')
  async getSharedWithMe(@CurrentUser() user: any) {
    const files = await this.filesService.getSharedWithMe(user);

    return {
      success: true,
      message: 'Shared files retrieved successfully',
      data: files,
    };
  }

  // -------------------------
  // FILE DETAILS
  // -------------------------
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const file = await this.filesService.findOne(id, user);

    return {
      success: true,
      message: 'File retrieved successfully',
      data: file,
    };
  }

  // -------------------------
  // DOWNLOAD
  // -------------------------
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.findOneWithDownloadUrl(id, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.DOWNLOAD,
      ip,
      fileId: id,
      metadata: { fileName: result.file.fileName },
    });

    return {
      success: true,
      message: 'Download URL generated successfully',
      data: {
        downloadUrl: result.downloadUrl,
        file: result.file,
        expiresIn: 900,
      },
    };
  }

  // -------------------------
  // DELETE (OTP PROTECTED)
  // -------------------------
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async softDelete(
    @Param('id') id: string,
    @Body() dto: DeleteFileDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.softDelete(id, dto.otpCode, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.DELETE,
      ip,
      fileId: id,
    });

    return {
      success: true,
      ...result,
    };
  }

  // -------------------------
  // PERMANENT DELETE
  // -------------------------
  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  async permanentDelete(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.permanentDelete(id, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.PERMANENT_DELETE,
      ip,
      fileId: id,
    });

    return { success: true, ...result };
  }

  // -------------------------
  // RESTORE
  // -------------------------
  @Patch(':id/restore')
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.restore(id, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.RESTORE,
      ip,
      fileId: id,
    });

    return { success: true, ...result };
  }

  // -------------------------
  // RENAME
  // -------------------------
  @Patch(':id/rename')
  async rename(
    @Param('id') id: string,
    @Body() dto: RenameFileDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const file = await this.filesService.rename(id, dto, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.RENAME_FILE,
      ip,
      fileId: id,
      metadata: { newName: dto.fileName },
    });

    return {
      success: true,
      message: 'File renamed successfully',
      data: file,
    };
  }

  // -------------------------
  // SHARE / UNSHARE
  // -------------------------
  @Post(':id/share')
  async share(
    @Param('id') id: string,
    @Body() dto: ShareFileDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.share(id, dto, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.SHARE_FILE,
      ip,
      fileId: id,
      metadata: { sharedWith: dto.userIds },
    });

    return { success: true, ...result };
  }

  @Delete(':id/unshare')
  @HttpCode(HttpStatus.OK)
  async unshare(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    // ✅ FIXED: pass user (was causing TS2554 error)
    const result = await this.filesService.unshare(id, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.UNSHARE_FILE,
      ip,
      fileId: id,
    });

    return { success: true, ...result };
  }

  // -------------------------
  // BULK OPERATIONS
  // -------------------------
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @Body() dto: BulkDeleteDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    if (!dto.fileIds?.length) {
      throw new BadRequestException('No files provided');
    }

    const result = await this.filesService.bulkDelete(dto, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.DELETE,
      ip,
      metadata: {
        bulk: true,
        count: dto.fileIds?.length ?? 0,
      },
    });

    return { success: true, ...result };
  }

  @Post('bulk-restore')
  @HttpCode(HttpStatus.OK)
  async bulkRestore(
    @Body() dto: BulkRestoreDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.bulkRestore(dto, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.RESTORE,
      ip,
      metadata: {
        bulk: true,
        count: dto.fileIds?.length ?? 0,
      },
    });

    return { success: true, ...result };
  }

  @Post('bulk-move')
  @HttpCode(HttpStatus.OK)
  async bulkMove(
    @Body() dto: BulkMoveDto,
    @CurrentUser() user: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.filesService.bulkMove(dto, user);

    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.MOVE_FILE,
      ip,
      metadata: {
        bulk: true,
        count: dto.fileIds?.length ?? 0,
        targetFolder: dto.folderId,
      },
    });

    return { success: true, ...result };
  }
}
