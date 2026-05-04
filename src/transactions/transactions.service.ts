import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Transaction,
  TransactionDocument,
} from './schemas/transaction.schema';

import { TransactionAction } from '../common/enums';

export interface LogTransactionDto {
  userId: string;
  action: TransactionAction;
  ip: string;
  fileId?: string;
  folderId?: string;
  metadata?: Record<string, any>;
  userAgent?: string;
  status?: 'SUCCESS' | 'FAILED';
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  /* =========================
     LOG TRANSACTION
  ========================= */
  async log(dto: LogTransactionDto): Promise<void> {
    try {
      await this.transactionModel.create({
        userId: new Types.ObjectId(dto.userId),
        action: dto.action,
        ip: dto.ip,
        fileId: dto.fileId ? new Types.ObjectId(dto.fileId) : null,
        folderId: dto.folderId ? new Types.ObjectId(dto.folderId) : null,
        metadata: dto.metadata || {},
        userAgent: dto.userAgent || null,
        status: dto.status || 'SUCCESS',
      });
    } catch (error) {
      this.logger.error('Transaction log failed', {
        error: error.message,
        stack: error.stack,
        payload: dto,
      });
    }
  }

  /* =========================
     FIND ALL
  ========================= */
  async findAll(
    filters: {
      userId?: string;
      action?: TransactionAction;
      fileId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page = 1,
    limit = 20,
  ) {
    const query: Record<string, any> = {};

    // Limit protection
    limit = Math.min(limit, 100);

    // Safe ObjectId handling
    if (filters.userId && Types.ObjectId.isValid(filters.userId)) {
      query.userId = new Types.ObjectId(filters.userId);
    }

    if (filters.fileId && Types.ObjectId.isValid(filters.fileId)) {
      query.fileId = new Types.ObjectId(filters.fileId);
    }

    if (filters.action) {
      query.action = filters.action;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .select('-__v')
        .populate('userId', 'name email role')
        .populate('fileId', 'fileName originalName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.transactionModel.countDocuments(query),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /* =========================
     FIND ONE
  ========================= */
  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;

    return this.transactionModel
      .findById(id)
      .populate('userId', 'name email role')
      .populate('fileId', 'fileName originalName')
      .lean();
  }

  /* =========================
     SHORTCUTS
  ========================= */
  async findByUserId(userId: string, page = 1, limit = 20) {
    return this.findAll({ userId }, page, limit);
  }

  async findByFileId(fileId: string, page = 1, limit = 20) {
    return this.findAll({ fileId }, page, limit);
  }
}