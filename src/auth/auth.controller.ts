import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Logger,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Response, Request, CookieOptions } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import {
  LoginDto,
  VerifyOtpDto,
  RequestOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ResendOtpDto,
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
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private getCookieOptions(isProd: boolean): CookieOptions {
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    };
  }

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly transactionsService: TransactionsService,
    private readonly usersService: UsersService,
  ) {}

  /* =========================
     🔐 LOGIN
  ========================= */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Public()
  async login(
    @Body() dto: LoginDto,
    @ClientIp() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, ip);

    const isProd = process.env.NODE_ENV === 'production';

    this.setAuthCookies(res, result.accessToken, result.refreshToken, isProd);
    await this.transactionsService.log({
      userId: result.user.id,
      action: TransactionAction.LOGIN,
      ip,
    });

    return {
      message: 'Login successful',
      data: { user: result.user },
    };
  }

  /* =========================
     🔁 REFRESH TOKEN
  ========================= */
  @Post('refresh')
  @Public()
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isProd = process.env.NODE_ENV === 'production';

    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.authService.refresh(refreshToken);

    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 15,
      path: '/',
    });

    return {
      message: 'Token refreshed',
    };
  }

  /* =========================
     🚪 LOGOUT
  ========================= */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isProd = process.env.NODE_ENV === 'production';

    await this.authService.logout(user._id);

    const cookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
    } satisfies CookieOptions;

    res.clearCookie(ACCESS_COOKIE, cookieOptions);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);

    return { message: 'Logged out successfully' };
  }

  /* =========================
     🔐 VERIFY OTP
  ========================= */
  @Post('verify-otp')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @ClientIp() ip: string) {
    await this.authService.verifyOtp(dto, ip);

    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      await this.transactionsService.log({
        userId: user._id.toString(),
        action: TransactionAction.OTP_VERIFY,
        ip,
      });
    }

    return {
      message: 'OTP verified successfully',
    };
  }

  /* =========================
     🔁 RESEND OTP
  ========================= */
  @Post('resend-otp')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendOtp(@Body() dto: ResendOtpDto, @ClientIp() ip: string) {
    const email = dto.email.toLowerCase();

    const user = await this.usersService.findByEmail(email);

    if (user) {
      const purpose = dto.purpose || OtpPurpose.RESET_PASSWORD;

      await this.otpService.sendOtp(user._id.toString(), user.email, purpose);

      this.logger.log(`OTP resent → ${email} | ${purpose} | IP: ${ip}`);
    }

    // 🔐 Prevent email enumeration
    return {
      message: 'If that email exists, an OTP has been resent.',
    };
  }

  /* =========================
     🔐 REQUEST OTP (PROTECTED)
  ========================= */
  @Post('request-otp')
  @UseGuards(JwtAuthGuard)
  async requestOtp(
    @Body() dto: RequestOtpDto,
    @CurrentUser() currentUser: any,
    @ClientIp() ip: string,
  ) {
    const result = await this.otpService.sendOtp(
      currentUser._id.toString(),
      currentUser.email,
      dto.purpose,
      dto.fileId,
    );

    await this.transactionsService.log({
      userId: currentUser._id.toString(),
      action: TransactionAction.OTP_REQUEST,
      ip,
    });

    return {
      message: result.message,
    };
  }

  /* =========================
     👤 GET ME
  ========================= */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: any) {
    return {
      message: 'User retrieved',
      data: currentUser,
    };
  }

  /* =========================
     🔑 FORGOT PASSWORD
  ========================= */
  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @ClientIp() ip: string) {
    const result = await this.authService.forgotPassword(dto.email);

    this.logger.log(`Forgot password → ${dto.email} | IP: ${ip}`);

    return {
      message: result.message,
    };
  }

  /* =========================
     🔑 RESET PASSWORD
  ========================= */
  @Post('reset-password')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    const result = await this.authService.resetPassword(dto);

    this.logger.log(`Password reset → ${dto.email} | IP: ${ip}`);

    return {
      message: result.message,
    };
  }

  /* =========================
     🍪 COOKIE HELPER
  ========================= */

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    isProd: boolean,
  ) {
    const cookieOptions = this.getCookieOptions(isProd);

    res.cookie(ACCESS_COOKIE, accessToken, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 15,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  }
}
