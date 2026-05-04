import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { Types } from 'mongoose';

import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

import { Role, TransactionAction } from '../common/enums';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /* =========================
     GET ALL
  ========================= */
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
    @Query('action') action?: TransactionAction,
    @Query('fileId') fileId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    // Limit protection
    if (limit > 100) {
      throw new BadRequestException('Limit cannot exceed 100');
    }

    const isAdmin = [Role.ADMIN, Role.SUPERADMIN].includes(user.role);

    // Validate ObjectIds
    if (userId && !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }

    if (fileId && !Types.ObjectId.isValid(fileId)) {
      throw new BadRequestException('Invalid fileId');
    }

    // Validate dates
    const parsedStart = startDate ? new Date(startDate) : undefined;
    const parsedEnd = endDate ? new Date(endDate) : undefined;

    if (startDate && isNaN(parsedStart!.getTime())) {
      throw new BadRequestException('Invalid startDate');
    }

    if (endDate && isNaN(parsedEnd!.getTime())) {
      throw new BadRequestException('Invalid endDate');
    }

    const effectiveUserId = isAdmin ? userId : user._id.toString();

    const result = await this.transactionsService.findAll(
      {
        userId: effectiveUserId,
        action,
        fileId,
        startDate: parsedStart,
        endDate: parsedEnd,
      },
      page,
      limit,
    );

    return {
      success: true,
      message: 'Transactions retrieved successfully',
      data: result,
    };
  }

  /* =========================
     BY USER
  ========================= */
  @Get('user/:userId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findByUser(
    @Param('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }

    const result = await this.transactionsService.findByUserId(
      userId,
      page,
      limit,
    );

    return {
      success: true,
      message: 'User transactions retrieved successfully',
      data: result,
    };
  }

  /* =========================
     BY FILE
  ========================= */
  @Get('file/:fileId')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findByFile(
    @Param('fileId') fileId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    if (!Types.ObjectId.isValid(fileId)) {
      throw new BadRequestException('Invalid fileId');
    }

    const result = await this.transactionsService.findByFileId(
      fileId,
      page,
      limit,
    );

    return {
      success: true,
      message: 'File transactions retrieved successfully',
      data: result,
    };
  }

  /* =========================
     GET ONE
  ========================= */
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findOne(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid transaction ID');
    }

    const transaction = await this.transactionsService.findById(id);

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      success: true,
      message: 'Transaction retrieved successfully',
      data: transaction,
    };
  }
}