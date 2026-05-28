import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';

import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface CurrentUserDto {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  tokenVersion?: number;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  /** GET /notifications */
  @Get()
  async findAll(
    @CurrentUser() currentUser: CurrentUserDto,
    @Query(
      'page',
      new DefaultValuePipe(1),
      ParseIntPipe,
    )
    page: number,
    @Query(
      'limit',
      new DefaultValuePipe(20),
      ParseIntPipe,
    )
    limit: number,
  ) {
    const result =
      await this.notificationsService.findAllForUser(
        currentUser.id, // ✅ fixed
        page,
        limit,
      );

    return {
      success: true,
      message:
        'Notifications retrieved successfully',
      data: result,
    };
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        'Invalid notification ID',
      );
    }

    const result =
      await this.notificationsService.markAsRead(
        id,
        currentUser.id, // ✅ fixed
      );

    return {
      success: true,
      ...result,
    };
  }

  /** PATCH /notifications/read-all */
  @Patch('read-all')
  async markAllAsRead(
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result =
      await this.notificationsService.markAllAsRead(
        currentUser.id, // ✅ fixed
      );

    return {
      success: true,
      ...result,
    };
  }
}