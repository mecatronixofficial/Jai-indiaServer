import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  BadRequestException,
} from '@nestjs/common';

import { Types } from 'mongoose';

import { FoldersService } from './folders.service';
import { FilesService } from '../files/files.service';
import {
  CreateFolderDto,
  UpdateFolderDto,
  MoveFolderDto,
} from './dto/folder.dto';
import { FileQueryDto } from '../files/dto/file.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';

import { TransactionsService } from '../transactions/transactions.service';
import { TransactionAction } from '../common/enums';

@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(
    private readonly foldersService: FoldersService,
    private readonly filesService: FilesService,
    private readonly transactionsService: TransactionsService,
  ) {}

  // -------------------------
  // VALIDATION
  // -------------------------
  private validateId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid folder ID');
    }
  }

  // -------------------------
  // CREATE FOLDER
  // -------------------------
  @Post()
  async create(
    @Body() dto: CreateFolderDto,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    const folder = await this.foldersService.create(dto, currentUser);

    await this.transactionsService.log({
      userId: currentUser._id.toString(),
      action: TransactionAction.CREATE_FOLDER,
      ip,
      folderId: folder._id.toString(),
      metadata: {
        folderName: folder.name,
        parentId: folder.parentId ?? null,
      },
    });

    return {
      success: true,
      message: 'Folder created successfully',
      data: folder,
    };
  }

  // -------------------------
  // GET ALL FOLDERS
  // -------------------------
  @Get()
  async findAll(@CurrentUser() currentUser: any) {
    const folders = await this.foldersService.findAll(currentUser);

    return {
      success: true,
      message: 'Folders retrieved successfully',
      data: folders,
    };
  }

  // -------------------------
  // FOLDER TREE
  // -------------------------
  @Get('tree')
  async getTree(@CurrentUser() currentUser: any) {
    const tree = await this.foldersService.getFolderTree(currentUser);

    return {
      success: true,
      message: 'Folder tree retrieved successfully',
      data: tree,
    };
  }

  // -------------------------
  // GET SINGLE FOLDER
  // -------------------------
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    this.validateId(id);

    const folder = await this.foldersService.findOne(id, currentUser);

    return {
      success: true,
      message: 'Folder retrieved successfully',
      data: folder,
    };
  }

  // -------------------------
  // GET FILES IN FOLDER
  // -------------------------
  @Get(':id/files')
  async getFolderFiles(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @Query() query: FileQueryDto,
  ) {
    this.validateId(id);

    await this.foldersService.findOne(id, currentUser);

    const result = await this.filesService.findAll(currentUser, {
      ...query,
      folderId: id,
    });

    return {
      success: true,
      message: 'Folder files retrieved successfully',
      data: result,
    };
  }

  // -------------------------
  // UPDATE FOLDER
  // -------------------------
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() currentUser: any,
  ) {
    this.validateId(id);

    const folder = await this.foldersService.update(id, dto, currentUser);

    return {
      success: true,
      message: 'Folder updated successfully',
      data: folder,
    };
  }

  // -------------------------
  // MOVE FOLDER
  // -------------------------
  @Patch(':id/move')
  async moveFolder(
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    const parentId = dto.parentId ?? null;

    const folder = await this.foldersService.moveFolder(
      id,
      parentId,
      currentUser,
    );

    await this.transactionsService.log({
      userId: currentUser._id.toString(),
      action: TransactionAction.MOVE_FOLDER,
      ip,
      folderId: id,
      metadata: {
        newParentId: parentId,
      },
    });

    return {
      success: true,
      message: 'Folder moved successfully',
      data: folder,
    };
  }

  // -------------------------
  // SOFT DELETE
  // -------------------------
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async softDelete(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    const result = await this.foldersService.softDelete(id, currentUser);

    await this.transactionsService.log({
      userId: currentUser._id.toString(),
      action: TransactionAction.DELETE_FOLDER,
      ip,
      folderId: id,
    });

    return {
      success: true,
      message: 'Folder deleted successfully',
      data: result,
    };
  }
}