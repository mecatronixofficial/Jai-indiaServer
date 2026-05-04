import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Logger,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { AuthService } from "./auth.service";
import {
  LoginDto,
  VerifyOtpDto,
  RequestOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ResendOtpDto,
} from "./dto/auth.dto";

import { JwtAuthGuard, Public } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ClientIp } from "../common/decorators/client-ip.decorator";

import { OtpService } from "../otp/otp.service";
import { TransactionsService } from "../transactions/transactions.service";
import { UsersService } from "../users/users.service";

import { TransactionAction, OtpPurpose } from "../common/enums";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly transactionsService: TransactionsService,
    private readonly usersService: UsersService,
  ) {}

  // 🔐 LOGIN
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @ClientIp() ip: string) {
    const result = await this.authService.login(dto, ip);

    return {
      message: result.message,
      data: { email: result.email },
    };
  }

  // 🔐 VERIFY OTP
  @Public()
  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @ClientIp() ip: string) {
    const result = await this.authService.verifyOtp(dto, ip);

    // ✅ Defensive check
    if (!result?.user?.id) {
      throw new Error("Invalid verifyOtp response: user id missing");
    }

    await this.transactionsService.log({
      userId: result.user.id, // ✅ already string now
      action: TransactionAction.LOGIN,
      ip,
    });

    return {
      message: "Login successful",
      data: result,
    };
  }

  // 🔁 RESEND OTP
  @Post("resend-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendOtp(@Body() dto: ResendOtpDto, @ClientIp() ip: string) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      return {
        message: "If that email exists, an OTP has been resent.",
        data: null,
      };
    }

    const purpose = dto.purpose || OtpPurpose.LOGIN;

    await this.otpService.sendOtp(user._id.toString(), user.email, purpose);

    // ✅ Log
    await this.transactionsService.log({
      userId: user._id.toString(),
      action: TransactionAction.OTP_RESEND,
      ip,
    });

    return {
      message: "OTP resent successfully",
      data: null,
    };
  }

  // 🔐 REQUEST OTP (PROTECTED)
  @Post("request-otp")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
      data: null,
    };
  }

  // 👤 GET ME
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() currentUser: any) {
    return {
      message: "User retrieved",
      data: currentUser,
    };
  }

  // 🔑 FORGOT PASSWORD
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @ClientIp() ip: string) {
    const result = await this.authService.forgotPassword(dto.email);

    this.logger.log(`Forgot password requested for ${dto.email} from ${ip}`);

    return {
      message: result.message,
      data: null,
    };
  }

  // 🔑 RESET PASSWORD
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @ClientIp() ip: string) {
    const result = await this.authService.resetPassword({
      email: dto.email,
      otp: dto.otp,
      newPassword: dto.newPassword,
    });

    this.logger.log(`Password reset for ${dto.email} from ${ip}`);

    return {
      message: result.message,
      data: null,
    };
  }
}
