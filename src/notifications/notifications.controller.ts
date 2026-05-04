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

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /notifications */
  @Get()
  async findAll(
    @CurrentUser() currentUser: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const result = await this.notificationsService.findAllForUser(
      currentUser._id.toString(),
      page,
      limit,
    );

    return {
      message: 'Notifications retrieved successfully',
      data: result,
    };
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid notification ID');
    }

    return this.notificationsService.markAsRead(
      id,
      currentUser._id.toString(),
    );
  }

  /** PATCH /notifications/read-all */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser() currentUser: any) {
    return this.notificationsService.markAllAsRead(
      currentUser._id.toString(),
    );
  }
}