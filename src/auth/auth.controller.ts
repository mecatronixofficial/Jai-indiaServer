import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';

import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RequestOtpDto,
  ResendOtpDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/auth.dto';

import { JwtAuthGuard, Public } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientIp } from '../common/decorators/client-ip.decorator';
import { OtpService } from '../otp/otp.service';
import { TransactionsService } from '../transactions/transactions.service';
import { UsersService } from '../users/users.service';
import { OtpPurpose, TransactionAction } from '../common/enums';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const ACCESS_TOKEN_AGE = 1000 * 60 * 15; // 15 min
const REFRESH_TOKEN_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days

interface AuthUser {
  _id: string;
  email: string;
  role: string;
  isActive: boolean;
  tokenVersion: number;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly isProd: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly transactionsService: TransactionsService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {
    this.isProd = this.configService.get<string>('app.env') === 'production';
  }

  /* =========================
     COOKIE HELPERS
  ========================= */

  private getCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.isProd,
      sameSite: this.isProd ? 'none' : 'lax',
      path: '/',
    };
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const base = this.getCookieOptions();
    res.cookie(ACCESS_COOKIE, accessToken, {
      ...base,
      maxAge: ACCESS_TOKEN_AGE,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...base,
      maxAge: REFRESH_TOKEN_AGE,
    });
  }

  private clearAuthCookies(res: Response): void {
    const base = this.getCookieOptions();
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }

  /* =========================
     LOGIN
  ========================= */
  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, ip);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    await this.transactionsService.log({
      userId: result.user.id,
      action: TransactionAction.LOGIN,
      ip,
    });

    return { message: 'Login successful', data: { user: result.user } };
  }

  /* =========================
     REFRESH
  ========================= */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const result = await this.authService.refresh(refreshToken);

    this.setAuthCookies(res, result.accessToken, result.refreshToken);

    return { message: 'Token refreshed successfully' };
  }

  /* =========================
     LOGOUT
     ✅ Public — works even with expired/missing tokens.
     ✅ Idempotent — calling logout when already logged out returns 200.
  ========================= */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @ClientIp() ip: string,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];

    // Try to revoke the session on the server, but don't fail if we can't.
    // The user's intent is to log out — honor that regardless.
    if (refreshToken) {
      try {
        const userId =
          await this.authService.getUserIdFromRefreshToken?.(refreshToken);
        if (userId) {
          await this.authService.logout(userId);

          // Audit log — best effort
          await this.transactionsService
            .log({
              userId,
              action: TransactionAction.LOGOUT,
              ip,
            })
            .catch(() => undefined);
        }
      } catch (err) {
        // Token may be expired, malformed, or already revoked.
        // Still proceed to clear cookies.
        if (!this.isProd) {
          this.logger.debug(`Logout token revoke skipped: ${String(err)}`);
        }
      }
    }

    this.clearAuthCookies(res);

    return { message: 'Logged out successfully' };
  }

  /* =========================
     ME
  ========================= */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    const fullUser = await this.usersService.findById(user._id); // ← added
    return { message: 'User retrieved successfully', data: fullUser };
  }

  /* =========================
     VERIFY OTP
  ========================= */
  @Post('verify-otp')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @ClientIp() ip: string) {
    await this.authService.verifyOtp(dto, ip);

    const user = await this.usersService.findByEmail(dto.email.toLowerCase());
    if (user) {
      await this.transactionsService.log({
        userId: user._id.toString(),
        action: TransactionAction.OTP_VERIFY,
        ip,
      });
    }

    return { message: 'OTP verified successfully' };
  }

  /* =========================
     RESEND OTP
  ========================= */
  @Post('resend-otp')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendOtp(@Body() dto: ResendOtpDto, @ClientIp() ip: string) {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (user) {
      await this.otpService.sendOtp(
        user._id.toString(),
        user.email,
        dto.purpose ?? OtpPurpose.RESET_PASSWORD,
      );

      if (!this.isProd) {
        this.logger.log(
          `OTP resent to ${email} for ${dto.purpose} | IP: ${ip}`,
        );
      }
    }

    return { message: 'If that email exists, an OTP has been resent.' };
  }

  /* =========================
     REQUEST OTP
  ========================= */
  @Post('request-otp')
  @UseGuards(JwtAuthGuard)
  async requestOtp(
    @Body() dto: RequestOtpDto,
    @CurrentUser() user: AuthUser,
    @ClientIp() ip: string,
  ) {
    const result = await this.otpService.sendOtp(
      user._id,
      user.email,
      dto.purpose,
      dto.fileId,
    );

    await this.transactionsService.log({
      userId: user._id,
      action: TransactionAction.OTP_REQUEST,
      ip,
    });

    return { message: result.message };
  }

  /* =========================
     FORGOT PASSWORD
  ========================= */
  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(
      dto.email.toLowerCase(),
    );
    return { message: result.message };
  }

  /* =========================
     RESET PASSWORD
  ========================= */
  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    return { message: result.message };
  }
}
