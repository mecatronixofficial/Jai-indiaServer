import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsPositive,
} from 'class-validator';

import { Transform, Type } from 'class-transformer';
import { Role } from '../../common/enums';

/* =========================
   COMMON TRANSFORMS
========================= */
const normalizeString = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  );

const normalizeEmail = () =>
  Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  );

/* =========================
   PASSWORD REGEX (IMPROVED)
========================= */
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/;

/* =========================
   CREATE USER DTO
========================= */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @normalizeString()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  @normalizeEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must include uppercase, lowercase, number, and symbol',
  })
  password: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @normalizeString()
  department?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{10}$/, {
    message: 'Phone must be a valid 10-digit number',
  })
  phone?: string;
}

/* =========================
   UPDATE USER DTO
========================= */
export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @normalizeString()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  @normalizeString()
  department?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{10}$/, {
    message: 'Phone must be a valid 10-digit number',
  })
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // 🔐 Prevent accidental role/email injection
  // (explicitly not allowed here)
   // ✅ ADD THIS
  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}

/* =========================
   CHANGE PASSWORD DTO
========================= */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(PASSWORD_REGEX, {
    message:
      'Password must include uppercase, lowercase, number, and symbol',
  })
  newPassword: string;
}

/* =========================
   UPDATE QUOTA DTO
========================= */
export class UpdateQuotaDto {
  @IsNumber()
  @IsPositive()
  @Min(100 * 1024 * 1024) // 100MB
  @Max(1024 * 1024 * 1024 * 1024) // 1TB
  @Type(() => Number)
  quotaBytes: number;
}