import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Put,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import { Types } from 'mongoose';
import { Throttle } from '@nestjs/throttler';

import { UsersService, AuthUser } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  UpdateQuotaDto,
} from './dto/user.dto';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';

import { Role, TransactionAction } from '../common/enums';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * Subset of UpdateUserDto that a user is allowed to apply to themselves.
 * Excludes role and isActive so users can't escalate or disable themselves.
 */
type UpdateProfileFields = Pick<
  UpdateUserDto,
  'name' | 'email' | 'department' | 'phone'
>;

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  /* =========================
     CREATE USER
  ========================= */
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: AuthUser,
    @ClientIp() ip: string,
  ) {
    const user = await this.usersService.create(
      dto,
      String(currentUser._id),
      currentUser.role,
    );

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.CREATE_USER,
      ip,
      metadata: { createdUserId: String(user._id), role: user.role },
    });

    this.logger.log(
      `User created → ${String(user._id)} by ${String(currentUser._id)}`,
    );

    return {
      success: true,
      message: 'User created successfully',
      data: user,
    };
  }

  /* =========================
     LIST USERS
  ========================= */
  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async findAll(
    @CurrentUser() currentUser: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    if (page < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    if (limit < 1 || limit > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const result = await this.usersService.findAll(
      { _id: String(currentUser._id), role: currentUser.role },
      page,
      limit,
      search,
    );

    return {
      success: true,
      message: 'Users retrieved successfully',
      data: result,
    };
  }

  /* =========================
     PROFILE — SELF UPDATE
     ⚠️ Route declared BEFORE `:id` so 'me' never matches as an ID.
  ========================= */
  @Patch('me')
  async updateMe(
    @CurrentUser() currentUser: AuthUser,
    @Body() dto: UpdateUserDto,
    @ClientIp() ip: string,
  ) {
    // Strip anything a user is not allowed to set on themselves.
    // Even though we type the payload below, the request body could
    // still contain extra properties if ValidationPipe isn't using
    // `whitelist: true, forbidNonWhitelisted: true`.
    const safeDto: UpdateProfileFields = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.email !== undefined && { email: dto.email }),
      ...(dto.department !== undefined && { department: dto.department }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
    };

    const user = await this.usersService.update(
      String(currentUser._id),
      safeDto,
      currentUser,
    );

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.UPDATE_USER,
      ip,
      metadata: { selfUpdate: true },
    });

    return {
      success: true,
      message: 'Profile updated successfully',
      data: user,
    };
  }

  /* =========================
     GET USER
  ========================= */
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findOne(@Param('id') id: string) {
    this.validateId(id);

    const user = await this.usersService.findById(id);

    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
    };
  }

  /* =========================
     UPDATE USER (admin/superadmin)
  ========================= */
  @Patch(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthUser,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    // Defense in depth — service does these checks too.
    if (String(currentUser._id) === id && dto.role) {
      throw new BadRequestException('You cannot change your own role');
    }

    // ✅ Pass currentUser so the service's auth checks actually run.
    const user = await this.usersService.update(id, dto, currentUser);

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.UPDATE_USER,
      ip,
      metadata: { updatedUserId: id, fields: Object.keys(dto) },
    });

    this.logger.log(`User updated → ${id} by ${String(currentUser._id)}`);

    return {
      success: true,
      message: 'User updated successfully',
      data: user,
    };
  }

  /* =========================
     CHANGE PASSWORD
  ========================= */
  @Put('me/password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @CurrentUser() currentUser: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
  ) {
    try {
      await this.usersService.changePassword(String(currentUser._id), dto);

      await this.transactionsService.log({
        userId: String(currentUser._id),
        action: TransactionAction.CHANGE_PASSWORD,
        ip,
        metadata: { success: true },
      });

      return {
        success: true,
        message: 'Password updated successfully',
      };
    } catch (err) {
      // Log failed attempts for security monitoring
      await this.transactionsService
        .log({
          userId: String(currentUser._id),
          action: TransactionAction.CHANGE_PASSWORD,
          ip,
          metadata: { success: false },
        })
        .catch(() => undefined);

      throw err;
    }
  }

  /* =========================
     ACTIVATE / DEACTIVATE
  ========================= */
  @Patch(':id/activate')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async activate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    const result = await this.usersService.activate(id);

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.UPDATE_USER,
      ip,
      metadata: { activatedUserId: id },
    });

    return { success: true, message: 'User activated', data: result };
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    if (String(currentUser._id) === id) {
      throw new BadRequestException('You cannot deactivate yourself');
    }

    const result = await this.usersService.deactivate(id);

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.UPDATE_USER,
      ip,
      metadata: { deactivatedUserId: id },
    });

    return { success: true, message: 'User deactivated', data: result };
  }

  /* =========================
     DELETE USER
  ========================= */
  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    if (String(currentUser._id) === id) {
      throw new BadRequestException('You cannot delete yourself');
    }

    await this.usersService.deleteUser(id);

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.DELETE_USER,
      ip,
      metadata: { deletedUserId: id },
    });

    this.logger.warn(`User deleted → ${id} by ${String(currentUser._id)}`);

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  /* =========================
     STORAGE
  ========================= */
  @Get(':id/storage')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async getStorageUsage(@Param('id') id: string) {
    this.validateId(id);

    const data = await this.usersService.getStorageUsage(id);

    return {
      success: true,
      message: 'Storage usage retrieved',
      data,
    };
  }

  /* =========================
     UPDATE QUOTA
  ========================= */
  @Patch(':id/quota')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async updateQuota(
    @Param('id') id: string,
    @Body() dto: UpdateQuotaDto,
    @CurrentUser() currentUser: AuthUser,
    @ClientIp() ip: string,
  ) {
    this.validateId(id);

    const result = await this.usersService.updateQuota(id, dto.quotaBytes);

    await this.transactionsService.log({
      userId: String(currentUser._id),
      action: TransactionAction.UPDATE_USER,
      ip,
      metadata: { quotaUpdatedUserId: id, quotaBytes: dto.quotaBytes },
    });

    return {
      success: true,
      message: 'Storage quota updated successfully',
      data: result,
    };
  }

  /* =========================
     🔒 VALIDATE ID
  ========================= */
  private validateId(id: string) {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID');
    }
  }
}