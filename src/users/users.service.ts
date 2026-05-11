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

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
  ) {}

  /* =========================
     CREATE USER
  ========================= */
  async create(
    dto: CreateUserDto,
    createdById: string,
    creatorRole: Role,
  ): Promise<UserDocument> {
    const email = this.normalizeEmail(dto.email);

    if (dto.role === Role.SUPERADMIN) {
      throw new ForbiddenException('Cannot create SUPERADMIN');
    }

    if (dto.role === Role.ADMIN && creatorRole !== Role.SUPERADMIN) {
      throw new ForbiddenException('Only SUPERADMIN can create ADMIN');
    }

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    try {
      return await this.userModel.create({
        ...dto,
        email,
        password: hashedPassword,
        role: dto.role || Role.USER,
        createdBy: new Types.ObjectId(createdById),
        tokenVersion: 0,
        isActive: true,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException('Email already exists');
      }
      throw err;
    }
  }

  /* =========================
     LIST USERS
  ========================= */
  async findAll(user: any, page = 1, limit = 20, search?: string) {
    const query: any = {};

    if (user.role === Role.ADMIN) {
      query.createdBy = user._id;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
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
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async findByEmail(email: string, includePassword = false) {
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
  async update(id: string, dto: UpdateUserDto) {
    this.validateId(id);

    if ((dto as any).role === Role.SUPERADMIN) {
      throw new ForbiddenException('Cannot assign SUPERADMIN role');
    }

    if ((dto as any).email) {
      (dto as any).email = this.normalizeEmail((dto as any).email);
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, dto, {
        new: true,
        runValidators: true,
      })
      .select('-password -refreshToken')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async updateLastSeen(
    userId: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
      ...(meta?.ip && { lastIp: meta.ip }),
      ...(meta?.userAgent && { lastUserAgent: meta.userAgent }),
    });
  }

  async getStorageUsage(userId: string) {
    this.validateId(userId);

    const user = await this.userModel.findById(userId).lean();

    if (!user) throw new NotFoundException('User not found');

    // 👉 Assuming you track file sizes in another collection
    const totalUsed = 0; // replace with real aggregation if needed

    return {
      usedBytes: totalUsed,
      quotaBytes: user.storageQuota,
      usedGB: +(totalUsed / 1024 ** 3).toFixed(2),
      quotaGB: +(user.storageQuota / 1024 ** 3).toFixed(2),
      usagePercent: +((totalUsed / user.storageQuota) * 100).toFixed(2),
    };
  }

  /* =========================
     CHANGE PASSWORD
  ========================= */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).select('+password');

    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);

    if (!isMatch) {
      throw new BadRequestException('Current password incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Password must be different');
    }

    user.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    user.tokenVersion += 1;
    user.refreshToken = null;

    await user.save();

    return { message: 'Password changed successfully' };
  }

  /* =========================
     ACTIVATE / DEACTIVATE
  ========================= */
  async toggleActive(userId: string, isActive: boolean) {
    this.validateId(userId);

    const user = await this.userModel.findById(userId);

    if (!user) throw new NotFoundException('User not found');

    user.isActive = isActive;

    if (!isActive) {
      user.tokenVersion += 1;
      user.refreshToken = null;
    }

    await user.save();

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'}`,
    };
  }

  async deactivate(id: string) {
    return this.toggleActive(id, false);
  }

  async activate(id: string) {
    return this.toggleActive(id, true);
  }

  /* =========================
     HARD DELETE
  ========================= */
  async deleteUser(id: string) {
    this.validateId(id);

    const user = await this.userModel.findById(id);

    if (!user) throw new NotFoundException('User not found');

    await this.userModel.findByIdAndDelete(id);

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
     STORAGE
  ========================= */
  async updateQuota(userId: string, quotaBytes: number) {
    this.validateId(userId);

    await this.userModel.findByIdAndUpdate(userId, {
      storageQuota: quotaBytes,
    });

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
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async validatePassword(user: any, password: string) {
    return bcrypt.compare(password, user.password);
  }

  async forceSetPassword(userId: string, password: string) {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    await this.userModel.findByIdAndUpdate(userId, {
      password: hashed,
      $inc: { tokenVersion: 1 },
      refreshToken: null,
    });
  }

  async setRefreshToken(userId: string, token: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: token,
    });
  }

  async removeRefreshToken(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      refreshToken: null,
    });
  }

  /* =========================
     HELPERS
  ========================= */
  private validateId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID');
    }
  }

  private normalizeEmail(email: string) {
    return email.toLowerCase().trim();
  }
}
