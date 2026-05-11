import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';

import { LoginDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpPurpose } from '../common/enums';
import { JwtPayload } from './strategies/jwt.strategy';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
  ) {}

  /* =========================
     🔐 LOGIN (ACCESS + REFRESH)
  ========================= */
  async login(dto: LoginDto, ip: string) {
    const email = dto.email.toLowerCase();

    const user = await this.usersService.findByEmail(email, true);

    if (!user) {
      this.logger.warn(`Login failed: user not found (${email}) | IP: ${ip}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await this.usersService.validatePassword(
      user,
      dto.password,
    );

    if (!isMatch) {
      this.logger.warn(`Login failed: wrong password (${email}) | IP: ${ip}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated');
    }

    // 🔥 invalidate old sessions
    await this.usersService.incrementTokenVersion(user._id.toString());

    // 🔁 fetch updated user
    const updatedUser = await this.usersService.findAuthUserById(
      user._id.toString(),
    );

    // ✅ IMPORTANT FIX (NULL CHECK)
    if (!updatedUser) {
      this.logger.error(`User disappeared after token update: ${email}`);
      throw new UnauthorizedException('User not found');
    }

    const payload: JwtPayload = {
      sub: updatedUser._id.toString(),
      email: updatedUser.email,
      role: updatedUser.role,
      tokenVersion: updatedUser.tokenVersion,
    };

    const accessToken = this.signAccessToken(payload);
    const refreshToken = this.signRefreshToken(payload);

    await this.usersService.setRefreshToken(
      updatedUser._id.toString(),
      await bcrypt.hash(refreshToken, 10),
    );

    await this.usersService.updateLastLogin(updatedUser._id.toString());

    this.logger.log(`Login success → ${email} | IP: ${ip}`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    };
  }

  /* =========================
     🔁 REFRESH TOKEN (ROTATION)
  ========================= */
  async refresh(cookies: any) {
    const token = cookies?.refresh_token;

    if (!token) {
      throw new UnauthorizedException('No refresh token');
    }

    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify(token);
    } catch (err) {
      this.logger.warn('Refresh token expired/invalid');
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.usersService.findAuthUserById(payload.sub);

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Invalid session');
    }

    const isMatch = await bcrypt.compare(token, user.refreshToken);

    if (!isMatch) {
      throw new UnauthorizedException('Session mismatch');
    }

    const newPayload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const newAccessToken = this.signAccessToken(newPayload);
    const newRefreshToken = this.signRefreshToken(newPayload);

    // 🔄 ROTATE refresh token
    await this.usersService.setRefreshToken(
      user._id.toString(),
      await bcrypt.hash(newRefreshToken, 10),
    );

    this.logger.log(`Token refreshed → ${user.email}`);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /* =========================
     🚪 LOGOUT
  ========================= */
  async logout(userId: string) {
    await this.usersService.removeRefreshToken(userId);
    this.logger.log(`Logout → ${userId}`);
  }

  /* =========================
     🔐 VERIFY OTP
  ========================= */
  async verifyOtp(dto: VerifyOtpDto, ip: string) {
    const email = dto.email.toLowerCase();

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid request');
    }

    if (!dto.purpose) {
      throw new BadRequestException('OTP purpose required');
    }

    await this.otpService.verifyOtp(user._id.toString(), dto.otp, dto.purpose);

    this.logger.log(`OTP verified → ${email} | ${dto.purpose} | IP: ${ip}`);

    return { message: 'OTP verified successfully' };
  }

  /* =========================
     🔑 FORGOT PASSWORD
  ========================= */
  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase();

    const user = await this.usersService.findByEmail(normalizedEmail);

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

    this.logger.log(`Reset OTP sent → ${normalizedEmail}`);

    return {
      message: 'If that email exists, an OTP has been sent.',
    };
  }

  /* =========================
     🔑 RESET PASSWORD
  ========================= */
  async resetPassword(dto: {
    email: string;
    otp: string;
    newPassword: string;
  }) {
    const email = dto.email.toLowerCase();

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid request');
    }

    await this.otpService.verifyOtp(
      user._id.toString(),
      dto.otp,
      OtpPurpose.RESET_PASSWORD,
    );

    if (!this.isStrongPassword(dto.newPassword)) {
      throw new BadRequestException('Weak password');
    }

    await this.usersService.forceSetPassword(
      user._id.toString(),
      dto.newPassword,
    );

    // 🔥 invalidate all sessions
    await this.usersService.incrementTokenVersion(user._id.toString());
    await this.usersService.removeRefreshToken(user._id.toString());

    this.logger.log(`Password reset → ${email}`);

    return { message: 'Password reset successful' };
  }

  /* =========================
     🔒 TOKEN HELPERS
  ========================= */
  private signAccessToken(payload: JwtPayload) {
    return this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: 'jai-india-api',
      audience: 'jai-india-users',
    });
  }

  private signRefreshToken(payload: JwtPayload) {
    return this.jwtService.sign(payload, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: 'jai-india-api',
      audience: 'jai-india-users',
    });
  }

  /* =========================
     🔒 PASSWORD VALIDATION
  ========================= */
  private isStrongPassword(password: string): boolean {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(password);
  }
}
