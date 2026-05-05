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
} from '@nestjs/common';

import { UsersService } from './users.service';
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

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  /* =========================
     CREATE USER
  ========================= */
  @Post()
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    const user = await this.usersService.create(
      dto,
      currentUser._id,
      currentUser.role,
    );

    await this.transactionsService.log({
      userId: currentUser._id,
      action: TransactionAction.CREATE_USER,
      ip,
      metadata: { createdUserId: user._id, role: user.role },
    });

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
  async findAll(
    @CurrentUser() currentUser: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    const result = await this.usersService.findAll(
      currentUser,
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
     PROFILE
  ========================= */
  @Get('me')
  async getProfile(@CurrentUser() currentUser: any) {
    const user = await this.usersService.findById(currentUser._id);

    return {
      success: true,
      message: 'Profile retrieved successfully',
      data: user,
    };
  }

  /* =========================
     GET USER
  ========================= */
  @Get(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);

    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
    };
  }

  /* =========================
     UPDATE USER
  ========================= */
  @Patch(':id')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    const user = await this.usersService.update(id, dto);

    await this.transactionsService.log({
      userId: currentUser._id,
      action: TransactionAction.UPDATE_USER,
      ip,
      metadata: { updatedUserId: id },
    });

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
  async changePassword(
    @CurrentUser() currentUser: any,
    @Body() dto: ChangePasswordDto,
    @ClientIp() ip: string,
  ) {
    await this.usersService.changePassword(currentUser._id, dto);

    await this.transactionsService.log({
      userId: currentUser._id,
      action: TransactionAction.CHANGE_PASSWORD,
      ip,
    });

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  /* =========================
     ACTIVATE / DEACTIVATE
  ========================= */
  @Patch(':id/activate')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async activate(@Param('id') id: string) {
    return this.usersService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }

  /* =========================
     DELETE USER
  ========================= */
  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    await this.usersService.deleteUser(id);

    await this.transactionsService.log({
      userId: currentUser._id,
      action: TransactionAction.DELETE_USER,
      ip,
      metadata: { deletedUserId: id },
    });

    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  /* =========================
     STORAGE (moved to service)
  ========================= */
  @Get(':id/storage')
  @Roles(Role.SUPERADMIN, Role.ADMIN)
  async getStorageUsage(@Param('id') id: string) {
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
  async updateQuota(@Param('id') id: string, @Body() dto: UpdateQuotaDto) {
    const result = await this.usersService.updateQuota(id, dto.quotaBytes);

    return {
      success: true,
      message: 'Storage quota updated successfully',
      data: result,
    };
  }
}
