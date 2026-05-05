import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { FileRecord, FileDocument } from './schemas/file.schema';
import {
  SaveFileMetadataDto,
  FileQueryDto,
  RenameFileDto,
  ShareFileDto,
  BulkDeleteDto,
  BulkRestoreDto,
  BulkMoveDto,
} from './dto/file.dto';

import { R2Service } from '../r2/r2.service';
import { OtpService } from '../otp/otp.service';
import { Role, OtpPurpose } from '../common/enums';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectModel(FileRecord.name)
    private fileModel: Model<FileDocument>,
    private r2Service: R2Service,
    private otpService: OtpService,
  ) {}

  // =========================
  // CREATE METADATA
  // =========================
  async saveMetadata(dto: SaveFileMetadataDto, userId: string) {
    const file = await this.fileModel.create({
      ...dto,
      uploadedBy: new Types.ObjectId(userId),
      folderId: dto.folderId ? new Types.ObjectId(dto.folderId) : null,
    });

    return file.populate('uploadedBy', 'name email');
  }

  // =========================
  // LIST FILES
  // =========================
  async findAll(currentUser: any, query: FileQueryDto) {
    const filter: any = { isDeleted: false };

    if (currentUser.role === Role.USER) {
      filter.$or = [
        { uploadedBy: currentUser._id },
        { sharedWith: currentUser._id },
      ];
    }

    if (query.folderId) {
      if (!Types.ObjectId.isValid(query.folderId)) {
        throw new BadRequestException('Invalid folder ID');
      }
      filter.folderId = new Types.ObjectId(query.folderId);
    }

    if (query.search) {
      filter.$or = [
        { fileName: { $regex: query.search, $options: 'i' } },
        { originalName: { $regex: query.search, $options: 'i' } },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    const [files, total] = await Promise.all([
      this.fileModel
        .find(filter)
        .populate('uploadedBy', 'name email')
        .populate('folderId', 'name path')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.fileModel.countDocuments(filter),
    ]);

    return {
      files,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // =========================
  // GET ONE FILE
  // =========================
  async findOne(fileId: string, currentUser: any) {
    return this.findOneAndVerifyAccess(fileId, currentUser);
  }

  async findOneWithDownloadUrl(fileId: string, currentUser: any) {
    const file = await this.findOneAndVerifyAccess(fileId, currentUser);

    const downloadUrl = await this.r2Service.generatePresignedDownloadUrl(
      file.key,
      file.originalName,
    );

    return { file, downloadUrl };
  }

  // =========================
  // DELETE (SOFT)
  // =========================
  async softDelete(fileId: string, otpCode: string, currentUser: any) {
    const file = await this.findOneAndVerifyAccess(fileId, currentUser);

    await this.otpService.verifyOtp(
      currentUser._id.toString(),
      otpCode,
      OtpPurpose.DELETE_FILE,
      fileId,
    );

    await this.fileModel.findByIdAndUpdate(fileId, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: currentUser._id,
    });

    return { message: 'File moved to trash. Auto-delete in 7 days.' };
  }

  // =========================
  // PERMANENT DELETE
  // =========================
  async permanentDelete(fileId: string, currentUser: any) {
    if (!Types.ObjectId.isValid(fileId)) {
      throw new BadRequestException('Invalid file ID');
    }

    const file = await this.fileModel.findById(fileId);
    if (!file) throw new NotFoundException('File not found');

    this.verifyOwnerOrAdmin(file, currentUser);

    await this.r2Service.deleteObject(file.key);
    await this.fileModel.findByIdAndDelete(fileId);

    return { message: 'File permanently deleted' };
  }

  // =========================
  // RESTORE
  // =========================
  async restore(fileId: string, currentUser: any) {
    const file = await this.fileModel.findOne({
      _id: new Types.ObjectId(fileId),
      isDeleted: true,
    });

    if (!file) throw new NotFoundException('File not found in trash');

    this.verifyOwnerOrAdmin(file, currentUser);

    await this.fileModel.findByIdAndUpdate(fileId, {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    });

    return { message: 'File restored successfully' };
  }

  // =========================
  // RENAME
  // =========================
  async rename(fileId: string, dto: RenameFileDto, currentUser: any) {
    await this.findOneAndVerifyAccess(fileId, currentUser);

    return this.fileModel.findByIdAndUpdate(
      fileId,
      { fileName: dto.fileName },
      { new: true },
    );
  }

  // =========================
  // SHARE
  // =========================
  async share(fileId: string, dto: ShareFileDto, currentUser: any) {
    await this.findOneAndVerifyAccess(fileId, currentUser);

    const userIds = dto.userIds.map((id) => new Types.ObjectId(id));

    await this.fileModel.findByIdAndUpdate(fileId, {
      $addToSet: { sharedWith: { $each: userIds } },
    });

    return { message: 'File shared successfully' };
  }

  async getSharedWithMe(currentUser: any) {
    return this.fileModel
      .find({
        sharedWith: currentUser._id,
        isDeleted: false,
      })
      .populate('uploadedBy', 'name email')
      .lean();
  }

  // FIXED: controller expects 2 params (id, user)
  async unshare(fileId: string, currentUser: any) {
    await this.findOneAndVerifyAccess(fileId, currentUser);

    await this.fileModel.findByIdAndUpdate(fileId, {
      $set: { sharedWith: [] },
    });

    return { message: 'Sharing removed' };
  }

  // =========================
  // TRASH
  // =========================
  async getTrash(currentUser: any) {
    const filter: any = { isDeleted: true };

    if (currentUser.role === Role.USER) {
      filter.uploadedBy = currentUser._id;
    }

    return this.fileModel.find(filter).lean();
  }

  // =========================
  // BULK OPERATIONS
  // =========================
  async bulkDelete(dto: BulkDeleteDto, currentUser: any) {
    await this.otpService.verifyOtp(
      currentUser._id.toString(),
      dto.otpCode,
      OtpPurpose.DELETE_FILE,
    );

    const ids = dto.fileIds.map((id) => new Types.ObjectId(id));

    const result = await this.fileModel.updateMany(
      { _id: { $in: ids }, uploadedBy: currentUser._id },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: currentUser._id,
      },
    );

    return { message: `${result.modifiedCount} files moved to trash` };
  }

  async bulkRestore(dto: BulkRestoreDto, currentUser: any) {
    const ids = dto.fileIds.map((id) => new Types.ObjectId(id));

    const result = await this.fileModel.updateMany(
      { _id: { $in: ids }, uploadedBy: currentUser._id },
      { isDeleted: false, deletedAt: null, deletedBy: null },
    );

    return { message: `${result.modifiedCount} files restored` };
  }

  async bulkMove(dto: BulkMoveDto, currentUser: any) {
    const ids = dto.fileIds.map((id) => new Types.ObjectId(id));

    const result = await this.fileModel.updateMany(
      { _id: { $in: ids }, uploadedBy: currentUser._id },
      {
        folderId: dto.folderId ? new Types.ObjectId(dto.folderId) : null,
      },
    );

    return { message: `${result.modifiedCount} files moved` };
  }

  // =========================
  // HELPERS
  // =========================
  private async findOneAndVerifyAccess(fileId: string, currentUser: any) {
    if (!Types.ObjectId.isValid(fileId)) {
      throw new BadRequestException('Invalid file ID');
    }

    const file = await this.fileModel.findById(fileId);

    if (!file || file.isDeleted) {
      throw new NotFoundException('File not found');
    }

    const isOwner = file.uploadedBy.toString() === currentUser._id.toString();

    const isAdmin =
      currentUser.role === Role.ADMIN || currentUser.role === Role.SUPERADMIN;

    const isShared = file.sharedWith?.some(
      (id) => id.toString() === currentUser._id.toString(),
    );

    if (!isOwner && !isAdmin && !isShared) {
      throw new ForbiddenException('Access denied');
    }

    return file;
  }

  private verifyOwnerOrAdmin(file: FileDocument, currentUser: any) {
    const isOwner = file.uploadedBy.toString() === currentUser._id.toString();

    const isAdmin =
      currentUser.role === Role.ADMIN || currentUser.role === Role.SUPERADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }
  }

  async permanentlyDeleteExpired(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const expiredFiles = await this.fileModel.find({
      isDeleted: true,
      deletedAt: { $lte: cutoffDate },
    });

    let deletedCount = 0;

    for (const file of expiredFiles) {
      try {
        // delete from R2 storage
        await this.r2Service.deleteObject(file.key);

        // delete from MongoDB
        await this.fileModel.findByIdAndDelete(file._id);

        deletedCount++;
      } catch (err) {
        this.logger.error(
          `Failed deleting file ${file._id}`,
          (err as Error).stack,
        );
      }
    }

    return deletedCount;
  }
}
