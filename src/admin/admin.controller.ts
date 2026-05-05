import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums';

import { User, UserDocument } from '../users/schemas/user.schema';
import { FileRecord, FileDocument } from '../files/schemas/file.schema';
import {
  Transaction,
  TransactionDocument,
} from '../transactions/schemas/transaction.schema';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.ADMIN)
export class AdminController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(FileRecord.name)
    private readonly fileModel: Model<FileDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  /** =========================
   * GET /admin/overview
   ========================= */
  @Get('overview')
  async getOverview() {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers,
      totalFiles,
      deletedFiles,
      totalTransactions,
      recentLogins,
      usersByRoleRaw,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ isActive: true }),
      this.fileModel.countDocuments({ isDeleted: false }),
      this.fileModel.countDocuments({ isDeleted: true }),
      this.transactionModel.countDocuments(),
      this.transactionModel.countDocuments({
        action: 'login',
        createdAt: { $gte: last24h },
      }),
      this.userModel.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
    ]);

    const usersByRole = usersByRoleRaw.reduce(
      (acc, r) => {
        acc[r._id] = r.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      success: true,
      message: 'Admin overview retrieved',
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          byRole: usersByRole,
        },
        files: {
          total: totalFiles,
          inTrash: deletedFiles,
        },
        transactions: {
          total: totalTransactions,
          loginsLast24h: recentLogins,
        },
      },
    };
  }

  /** =========================
   * GET /admin/storage
   ========================= */
  @Get('storage')
  async getStorageStats() {
    const [stats, byMimeType, byUser] = await Promise.all([
      this.fileModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$size' },
            totalFiles: { $sum: 1 },
            avgFileSize: { $avg: '$size' },
          },
        },
      ]),

      this.fileModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$mimeType',
            count: { $sum: 1 },
            totalSize: { $sum: '$size' },
          },
        },
        { $sort: { totalSize: -1 } },
        { $limit: 10 },
      ]),

      this.fileModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$uploadedBy',
            fileCount: { $sum: 1 },
            totalSize: { $sum: '$size' },
          },
        },
        { $sort: { totalSize: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            fileCount: 1,
            totalSize: 1,
            user: {
              name: '$user.name',
              email: '$user.email',
            },
          },
        },
      ]),
    ]);

    const summary = stats?.[0] ?? {
      totalSize: 0,
      totalFiles: 0,
      avgFileSize: 0,
    };

    return {
      success: true,
      message: 'Storage statistics retrieved',
      data: {
        summary: {
          totalSizeBytes: summary.totalSize,
          totalSizeMB: +(summary.totalSize / (1024 * 1024)).toFixed(2),
          totalSizeGB: +(summary.totalSize / (1024 * 1024 * 1024)).toFixed(4),
          totalFiles: summary.totalFiles,
          avgFileSizeBytes: Math.round(summary.avgFileSize || 0),
        },
        byMimeType,
        topUsersByStorage: byUser,
      },
    };
  }

  /** =========================
   * GET /admin/activity
   ========================= */
  @Get('activity')
  async getActivity() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [recentTransactions, activityByAction, dailyActivity] =
      await Promise.all([
        this.transactionModel
          .find()
          .populate('userId', 'name email role')
          .populate('fileId', 'fileName')
          .sort({ createdAt: -1 })
          .limit(50)
          .lean(),

        this.transactionModel.aggregate([
          { $match: { createdAt: { $gte: sevenDaysAgo } } },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),

        this.transactionModel.aggregate([
          { $match: { createdAt: { $gte: sevenDaysAgo } } },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    return {
      success: true,
      message: 'Activity retrieved successfully',
      data: {
        recentTransactions,
        activityByAction,
        dailyActivity,
      },
    };
  }
}
