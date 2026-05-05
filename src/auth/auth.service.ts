import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';
import { LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpPurpose } from '../common/enums';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  // 🔐 LOGIN STEP 1
  async login(
    dto: LoginDto,
    ip: string,
  ): Promise<{ message: string; email: string }> {
    const user = await this.usersService.findByEmail(dto.email, true);

    if (
      !user ||
      !(await this.usersService.validatePassword(user, dto.password))
    ) {
      this.logger.warn(`Failed login attempt → ${dto.email} | IP: ${ip}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'Account is deactivated. Contact administrator.',
      );
    }

    await this.otpService.sendOtp(
      user._id.toString(),
      user.email,
      OtpPurpose.LOGIN,
    );

    this.logger.log(`Login OTP sent → ${user.email} | IP: ${ip}`);

    return {
      message: 'OTP sent to your email. Please verify to complete login.',
      email: user.email,
    };
  }

  // 🔐 LOGIN STEP 2
  async verifyOtp(
    dto: VerifyOtpDto,
    ip: string,
  ): Promise<{
    accessToken: string;
    user: any;
  }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.otpService.verifyOtp(
      user._id.toString(),
      dto.otp,
      OtpPurpose.LOGIN,
    );

    // ✅ update last login
    await this.usersService.updateLastLogin(user._id.toString());

    // 🔥 CRITICAL FIX: increment token version
    await this.usersService.incrementTokenVersion(user._id.toString());

    // 🔥 get updated user (with new tokenVersion)
    const updatedUser = await this.usersService.findById(user._id.toString());

    // 🔥 use updated tokenVersion
    const payload: JwtPayload = {
      sub: updatedUser._id.toString(),
      email: updatedUser.email,
      role: updatedUser.role,
      tokenVersion: updatedUser.tokenVersion,
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`Login success → ${updatedUser.email} | IP: ${ip}`);

    return {
      accessToken,
      user: {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    };
  }

  // 🔑 FORGOT PASSWORD
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return {
        message: 'If that email exists, an OTP has been sent.',
      };
    }

    await this.otpService.sendOtp(
      user._id.toString(),
      user.email,
      OtpPurpose.RESET_PASSWORD,
    );

    this.logger.log(`Password reset OTP sent → ${email}`);

    return {
      message: 'If that email exists, an OTP has been sent.',
    };
  }

  // 🔑 RESET PASSWORD
  async resetPassword(dto: {
    email: string;
    otp: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new BadRequestException('Invalid request');
    }

    // 🔐 enforce correct OTP purpose
    await this.otpService.verifyOtp(
      user._id.toString(),
      dto.otp,
      OtpPurpose.RESET_PASSWORD,
    );

    // 🔒 basic password validation
    if (dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    await this.usersService.forceSetPassword(
      user._id.toString(),
      dto.newPassword,
    );

    // 🔥 invalidate all sessions after password reset
    await this.usersService.incrementTokenVersion(user._id.toString());

    this.logger.log(`Password reset success → ${dto.email}`);

    return {
      message: 'Password reset successfully',
    };
  }
}
