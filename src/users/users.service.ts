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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /* =========================
     CREATE USER
  ========================= */
  async create(
    dto: CreateUserDto,
    createdById: string,
    creatorRole: Role,
  ): Promise<UserDocument> {
    if (dto.role === Role.SUPERADMIN) {
      throw new ForbiddenException('Cannot create SUPERADMIN accounts');
    }

    if (dto.role === Role.ADMIN && creatorRole !== Role.SUPERADMIN) {
      throw new ForbiddenException('Only SUPERADMIN can create ADMIN accounts');
    }

    if (creatorRole === Role.ADMIN && dto.role === Role.ADMIN) {
      throw new ForbiddenException('ADMINs can only create USER accounts');
    }

    const existing = await this.userModel.findOne({ email: dto.email });
    if (existing) throw new ConflictException('Email already registered');

    const hashedPassword = await bcrypt.hash(dto.password, SALT_ROUNDS);

    return this.userModel.create({
      ...dto,
      password: hashedPassword,
      role: dto.role || Role.USER,
      createdBy: new Types.ObjectId(createdById),
    });
  }

  /* =========================
     LIST USERS
  ========================= */
  async findAll(requestingUser: any, page = 1, limit = 20, search?: string) {
    const query: any = {};

    if (requestingUser.role === Role.ADMIN) {
      query.createdBy = requestingUser._id;
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
        .select('-password')
        .populate('createdBy', 'name email')
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
  async findById(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findById(id)
      .select('-password')
      .populate('createdBy', 'name email')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  async findByEmail(email: string, includePassword = false) {
    const query = this.userModel.findOne({ email: email.toLowerCase() });
    if (includePassword) query.select('+password');
    return query.exec();
  }

  /* =========================
     UPDATE USER
  ========================= */
  async update(id: string, dto: UpdateUserDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, dto, {
        new: true,
        runValidators: true,
      })
      .select('-password')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  /* =========================
     CHANGE PASSWORD
  ========================= */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).select('+password');

    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch)
      throw new BadRequestException('Current password is incorrect');

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ');
    }

    user.password = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await user.save();

    return { message: 'Password changed successfully' };
  }

  /* =========================
     ACTIVATE / DEACTIVATE
  ========================= */
  async deactivate(id: string) {
    return this.toggleActive(id, false);
  }

  async activate(id: string) {
    return this.toggleActive(id, true);
  }

  private async toggleActive(id: string, isActive: boolean) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findByIdAndUpdate(
      id,
      { isActive },
      { new: true },
    );

    if (!user) throw new NotFoundException('User not found');

    return {
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
    };
  }

  /* =========================
     DELETE USER
  ========================= */
  async deleteUser(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) throw new NotFoundException('User not found');

    this.logger.log(`User ${id} permanently deleted`);

    return { message: 'User deleted successfully' };
  }

  /* =========================
     TOKEN VERSION (FIX FOR YOUR ERROR)
  ========================= */
  async incrementTokenVersion(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      $inc: { tokenVersion: 1 },
    });
  }

  /* =========================
     STORAGE
  ========================= */
  async getStorageUsage(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    return {
      note: 'Implement aggregation in FileService',
    };
  }

  async updateQuota(userId: string, quotaBytes: number) {
    const user = await this.update(userId, {
      storageQuota: quotaBytes,
    } as any);

    return {
      userId,
      quotaBytes,
      quotaGB: +(quotaBytes / (1024 * 1024 * 1024)).toFixed(2),
    };
  }

  /* =========================
     LOGIN HELPERS
  ========================= */
  async updateLastLogin(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async validatePassword(user: any, password: string) {
    return bcrypt.compare(password, user.password);
  }

  async forceSetPassword(userId: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userModel.findByIdAndUpdate(userId, {
      password: hashed,
    });
  }
}