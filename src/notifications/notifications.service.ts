import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  private toObjectId(id: string) {
    return new Types.ObjectId(id);
  }

  /** Get notifications for a user */
  async findAllForUser(userId: string, page = 1, limit = 20) {
    const uid = this.toObjectId(userId);
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find({ userId: uid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.notificationModel.countDocuments({ userId: uid }),

      this.notificationModel.countDocuments({
        userId: uid,
        isRead: false,
      }),
    ]);

    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /** Mark single notification as read */
  async markAsRead(notificationId: string, userId: string) {
    const result = await this.notificationModel.findOneAndUpdate(
      {
        _id: this.toObjectId(notificationId),
        userId: this.toObjectId(userId),
      },
      { $set: { isRead: true } },
      { new: true },
    );

    if (!result) {
      throw new NotFoundException('Notification not found');
    }

    return { message: 'Notification marked as read' };
  }

  /** Mark all as read */
  async markAllAsRead(userId: string) {
    const result = await this.notificationModel.updateMany(
      {
        userId: this.toObjectId(userId),
        isRead: false,
      },
      { $set: { isRead: true } },
    );

    return {
      message: `${result.modifiedCount} notification(s) marked as read`,
    };
  }

  /** Create notification */
  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    fileId?: string;
    metadata?: Record<string, any>;
  }): Promise<NotificationDocument> {
    return this.notificationModel.create({
      userId: this.toObjectId(data.userId),
      type: data.type,
      title: data.title,
      message: data.message,
      fileId: data.fileId ? this.toObjectId(data.fileId) : null,
      metadata: data.metadata || {},
      isRead: false,
    });
  }
}
