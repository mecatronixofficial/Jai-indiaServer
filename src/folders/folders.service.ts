import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Folder, FolderDocument } from './schemas/folder.schema';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';
import { Role } from '../common/enums';

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    @InjectModel(Folder.name)
    private folderModel: Model<FolderDocument>,
  ) {}

  // -------------------------
  // Helpers
  // -------------------------
  private getUserId(user: any): string {
    return user.userId || user._id?.toString();
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID');
    }
    return new Types.ObjectId(id);
  }

  private verifyAccess(folder: FolderDocument, user: any): void {
    const userId = this.getUserId(user);

    const isOwner = folder.createdBy.toString() === userId;

    const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPERADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this folder');
    }
  }

  // -------------------------
  // Create Folder
  // -------------------------
  async create(dto: CreateFolderDto, user: any): Promise<FolderDocument> {
    const userId = this.getUserId(user);

    let parentId: Types.ObjectId | null = null;
    let path = '/';

    if (dto.parentId) {
      const parent = await this.folderModel.findById(dto.parentId);

      if (!parent) {
        throw new NotFoundException('Parent folder not found');
      }

      parentId = this.toObjectId(dto.parentId);
      path = `${parent.path}${parent.name}/`;
    }

    const exists = await this.folderModel.findOne({
      name: dto.name,
      parentId,
      isDeleted: false,
    });

    if (exists) {
      throw new BadRequestException('Folder already exists in this location');
    }

    return this.folderModel.create({
      name: dto.name,
      parentId,
      createdBy: this.toObjectId(userId),
      description: dto.description,
      path,
    });
  }

  // -------------------------
  // Get All Folders
  // -------------------------
  async findAll(user: any): Promise<any[]> {
    const filter: any = { isDeleted: false };

    if (user.role === Role.USER) {
      filter.createdBy = this.getUserId(user);
    }

    return this.folderModel
      .find(filter)
      .populate('createdBy', 'name email')
      .populate('parentId', 'name path')
      .sort({ path: 1, name: 1 })
      .lean();
  }

  // -------------------------
  // Get One Folder
  // -------------------------
  async findOne(id: string, user: any): Promise<FolderDocument> {
    const folder = await this.folderModel
      .findOne({ _id: id, isDeleted: false })
      .populate('createdBy', 'name email')
      .populate('parentId', 'name path');

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    this.verifyAccess(folder, user);

    return folder;
  }

  // -------------------------
  // Folder Tree
  // -------------------------
  async getFolderTree(user: any): Promise<any[]> {
    const filter: any = { isDeleted: false };

    if (user.role === Role.USER) {
      filter.createdBy = this.getUserId(user);
    }

    const folders = await this.folderModel.find(filter).lean();
    return this.buildTree(folders, null);
  }

  private buildTree(folders: any[], parentId: any): any[] {
    return folders
      .filter((f) =>
        parentId === null
          ? !f.parentId
          : f.parentId?.toString() === parentId?.toString(),
      )
      .map((f) => ({
        ...f,
        children: this.buildTree(folders, f._id),
      }));
  }

  // -------------------------
  // Update Folder
  // -------------------------
  async update(
    id: string,
    dto: UpdateFolderDto,
    user: any,
  ): Promise<FolderDocument> {
    const folder = await this.findOne(id, user);
    this.verifyAccess(folder, user);

    const updated = await this.folderModel.findByIdAndUpdate(id, dto, {
      new: true,
    });

    if (!updated) {
      throw new NotFoundException('Folder not found');
    }

    return updated;
  }

  // -------------------------
  // Soft Delete
  // -------------------------
  async softDelete(id: string, user: any): Promise<{ message: string }> {
    const folder = await this.findOne(id, user);
    this.verifyAccess(folder, user);

    await this.folderModel.findByIdAndUpdate(id, {
      isDeleted: true,
      deletedAt: new Date(),
    });

    return { message: 'Folder deleted successfully' };
  }

  // -------------------------
  // Move Folder
  // -------------------------
  async moveFolder(
    id: string,
    parentId: string | null,
    user: any,
  ): Promise<FolderDocument> {
    const folder = await this.findOne(id, user);
    this.verifyAccess(folder, user);

    if (parentId && parentId === id) {
      throw new BadRequestException('Cannot move folder into itself');
    }

    let newParentId: Types.ObjectId | null = null;
    let newPath = '/';

    if (parentId) {
      const parent = await this.folderModel.findById(parentId);

      if (!parent) {
        throw new NotFoundException('Parent folder not found');
      }

      newParentId = this.toObjectId(parentId);
      newPath = `${parent.path}${parent.name}/`;
    }

    const updated = await this.folderModel.findByIdAndUpdate(
      id,
      {
        parentId: newParentId,
        path: newPath,
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Folder not found after update');
    }

    return updated;
  }
}
