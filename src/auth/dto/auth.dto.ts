import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  IsEnum,
  IsOptional,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { OtpPurpose } from '../../common/enums';

/**
 * 🔐 Common Validators
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+$/;

const OTP_REGEX = /^[0-9]{6}$/;

/**
 * 🔑 LOGIN DTO
 */
export class LoginDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(32)
  password: string;
}

/**
 * 🔐 VERIFY OTP DTO
 */
export class VerifyOtpDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @Matches(OTP_REGEX, { message: 'OTP must be 6 digits' })
  otp: string;

  @IsEnum(OtpPurpose)
  @IsOptional()
  purpose?: OtpPurpose;

  @IsString()
  @IsOptional()
  fileId?: string;
}

/**
 * 🔁 REQUEST OTP DTO
 */
export class RequestOtpDto {
  @IsEnum(OtpPurpose)
  purpose: OtpPurpose;

  @IsString()
  @IsOptional()
  fileId?: string;
}

/**
 * 🔁 RESEND OTP DTO
 */
export class ResendOtpDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @IsEnum(OtpPurpose)
  @IsOptional()
  purpose?: OtpPurpose;
}

/**
 * 🔒 FORGOT PASSWORD DTO
 */
export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;
}

/**
 * 🔐 RESET PASSWORD DTO
 */
export class ResetPasswordDto {
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase().trim())
  email: string;

  @Matches(OTP_REGEX, { message: 'OTP must be 6 digits' })
  otp: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(32)
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must include uppercase, lowercase, number and special character',
  })
  newPassword: string;
}
