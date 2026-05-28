import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from './schemas/user.schema';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
} from './dto/user.dto';

import { Role } from '../common/enums';

const SALT_ROUNDS = 12;

export interface AuthUser {
  _id: string;
  role: Role;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /* =========================
     CREATE USER
  ========================= */
  async create(
    dto: CreateUserDto,
    createdById: string,
    creatorRole: Role,
  ): Promise<UserDocument> {
    this.validateId(createdById);

    const email = this.normalizeEmail(dto.email);

    if (dto.role === Role.SUPERADMIN) {
      throw new ForbiddenException('Cannot create SUPERADMIN');
    }
    if (dto.role === Role.ADMIN && creatorRole !== Role.SUPERADMIN) {
      throw new ForbiddenException('Only SUPERADMIN can create ADMIN');
    }

    const exists = await this.userModel.exists({ email });
    if (exists) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      return await this.userModel.create({
        ...dto,
        email,
        password: hashedPassword,
        role: dto.role ?? Role.USER,
        createdBy: new Types.ObjectId(createdById),
        tokenVersion: 0,
        isActive: true,
      });
    } catch (err: unknown) {
      const mongoErr = err as { code?: number; stack?: string };
      if (mongoErr?.code === 11000) {
        throw new ConflictException('Email already exists');
      }
      this.logger.error('Failed to create user', mongoErr?.stack);
      throw err;
    }
  }

  /* =========================
     LIST USERS
  ========================= */
  async findAll(
    user: AuthUser,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    const query: Record<string, unknown> = {};

    if (user.role === Role.ADMIN) {
      query.createdBy = new Types.ObjectId(user._id);
    }

    if (search) {
      const escaped = this.escapeRegex(search);
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const skip = (safePage - 1) * safeLimit;

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      users,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    };
  }

  /* =========================
     GET USER
  ========================= */
  async findById(id: string) {
    this.validateId(id);

    const user = await this.userModel
      .findById(id)
      .select('-password -refreshToken')
      .lean()
      .exec();

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<UserDocument | null> {
    const query = this.userModel.findOne({
      email: this.normalizeEmail(email),
    });

    if (includePassword) {
      query.select('+password +refreshToken');
    }

    return query.exec();
  }

  /* =========================
     AUTH USER (LOGIN / JWT)
  ========================= */
  async findAuthUserById(userId: string): Promise<UserDocument> {
    this.validateId(userId);

    const user = await this.userModel
      .findById(userId)
      .select('+password +refreshToken')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /* =========================
     UPDATE USER
  ========================= */
  async update(
    id: string,
    dto: UpdateUserDto & { email?: string },
    currentUser?: AuthUser,
  ) {
    this.validateId(id);

    const existingUser = await this.userModel.findById(id).lean().exec();
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    let normalizedEmail: string | undefined;
    if (dto.email) {
      normalizedEmail = this.normalizeEmail(dto.email);

      const emailExists = await this.userModel.exists({
        email: normalizedEmail,
        _id: { $ne: new Types.ObjectId(id) },
      });
      if (emailExists) {
        throw new ConflictException('Email already in use');
      }
    }

    if (dto.role) {
      if (dto.role === Role.SUPERADMIN) {
        throw new ForbiddenException('Cannot assign SUPERADMIN role');
      }

      if (currentUser && currentUser._id === id) {
        throw new ForbiddenException('You cannot change your own role');
      }

      if (
        currentUser?.role === Role.ADMIN &&
        existingUser.role &&
        [Role.ADMIN, Role.SUPERADMIN].includes(existingUser.role)
      ) {
        throw new ForbiddenException('Insufficient permission');
      }
    }

    const allowedUpdates: Record<string, unknown> = {};

    if (dto.name !== undefined) allowedUpdates.name = dto.name.trim();
    if (normalizedEmail !== undefined) allowedUpdates.email = normalizedEmail;
    if (dto.department !== undefined) {
      allowedUpdates.department = dto.department.trim();
    }
    if (dto.phone !== undefined) allowedUpdates.phone = dto.phone;
    if (dto.role !== undefined) allowedUpdates.role = dto.role;
    if (dto.isActive !== undefined) allowedUpdates.isActive = dto.isActive;

    if (Object.keys(allowedUpdates).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    const sensitiveChange =
      allowedUpdates.role !== undefined ||
      allowedUpdates.isActive === false ||
      allowedUpdates.email !== undefined;

    if (sensitiveChange) {
      allowedUpdates.refreshToken = null;
    }

    const updateOps: Record<string, unknown> = { $set: allowedUpdates };
    if (sensitiveChange) {
      updateOps.$inc = { tokenVersion: 1 };
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, updateOps, {
        new: true,
        runValidators: true,
      })
      .select('-password -refreshToken')
      .lean()
      .exec();

    return user;
  }

  async updateLastSeen(
    userId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    this.validateId(userId);

    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
      ...(meta?.ip && { lastIp: meta.ip }),
      ...(meta?.userAgent && { lastUserAgent: meta.userAgent }),
    });
  }

  /* =========================
     STORAGE USAGE
  ========================= */
  async getStorageUsage(userId: string) {
    this.validateId(userId);

    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) throw new NotFoundException('User not found');

    const totalUsed = 0; // TODO: replace with real aggregation
    const quota = user.storageQuota ?? 0;

    return {
      usedBytes: totalUsed,
      quotaBytes: quota,
      usedGB: +(totalUsed / 1024 ** 3).toFixed(2),
      quotaGB: +(quota / 1024 ** 3).toFixed(2),
      usagePercent:
        quota > 0 ? +((totalUsed / quota) * 100).toFixed(2) : 0,
    };
  }

  /* =========================
     CHANGE PASSWORD
  ========================= */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    this.validateId(userId);

    const user = await this.userModel
      .findById(userId)
      .select('+password')
      .exec();

    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current',
      );
    }

    user.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.refreshToken = null;

    await user.save();

    return { message: 'Password changed successfully' };
  }

  /* =========================
     ACTIVATE / DEACTIVATE
  ========================= */
  async toggleActive(userId: string, isActive: boolean) {
    this.validateId(userId);

    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');

    if (user.isActive === isActive) {
      return {
        message: `User already ${isActive ? 'active' : 'inactive'}`,
      };
    }

    user.isActive = isActive;

    if (!isActive) {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
      user.refreshToken = null;
    }

    await user.save();

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
    };
  }

  deactivate(id: string) {
    return this.toggleActive(id, false);
  }

  activate(id: string) {
    return this.toggleActive(id, true);
  }

  /* =========================
     HARD DELETE
  ========================= */
  async deleteUser(id: string) {
    this.validateId(id);

    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    if (user.role === Role.SUPERADMIN) {
      throw new ForbiddenException('Cannot delete SUPERADMIN');
    }

    await this.userModel.findByIdAndDelete(id).exec();

    this.logger.warn(`User deleted → ${user.email} (${id})`);

    return { message: 'User permanently deleted' };
  }

  /* =========================
     TOKEN VERSION
  ========================= */
  async incrementTokenVersion(userId: string) {
    this.validateId(userId);

    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { tokenVersion: 1 },
    });
  }

  /* =========================
     STORAGE QUOTA
  ========================= */
  async updateQuota(userId: string, quotaBytes: number) {
    this.validateId(userId);

    if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
      throw new BadRequestException('Invalid quota value');
    }

    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { storageQuota: quotaBytes },
        { new: true },
      )
      .exec();

    if (!updated) throw new NotFoundException('User not found');

    return {
      userId,
      quotaBytes,
      quotaGB: +(quotaBytes / 1024 ** 3).toFixed(2),
    };
  }

  /* =========================
     AUTH HELPERS
  ========================= */
  async updateLastLogin(userId: string) {
    this.validateId(userId);

    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async validatePassword(
    user: Pick<UserDocument, 'password'> | null | undefined,
    password: string,
  ): Promise<boolean> {
    if (!user?.password) return false;
    return bcrypt.compare(password, user.password);
  }

  async forceSetPassword(userId: string, password: string) {
    this.validateId(userId);

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    await this.userModel.findByIdAndUpdate(userId, {
      $set: { password: hashed, refreshToken: null },
      $inc: { tokenVersion: 1 },
    });
  }

  async setRefreshToken(userId: string, token: string) {
    this.validateId(userId);

    const hashed = await bcrypt.hash(token, SALT_ROUNDS);

    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: hashed,
    });
  }

  async removeRefreshToken(userId: string) {
    this.validateId(userId);

    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: null,
    });
  }

  async compareRefreshToken(
    userId: string,
    token: string,
  ): Promise<boolean> {
    this.validateId(userId);

    const user = await this.userModel
      .findById(userId)
      .select('+refreshToken')
      .lean()
      .exec();

    if (!user?.refreshToken) return false;
    return bcrypt.compare(token, user.refreshToken);
  }

  /* =========================
     HELPERS
  ========================= */
  private validateId(id: string) {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID');
    }
  }

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }

  private escapeRegex(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}