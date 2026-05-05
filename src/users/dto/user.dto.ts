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
} from 'class-validator';

import { Type } from 'class-transformer';
import { Role } from '../../common/enums';

/* =========================
   CREATE USER DTO
========================= */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    {
      message:
        'Password must contain uppercase, lowercase, number and special character',
    },
  )
  password: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @IsString()
  @IsOptional()
  @MaxLength(100)
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
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
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
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
    {
      message:
        'Password must contain uppercase, lowercase, number and special character',
    },
  )
  newPassword: string;
}

/* =========================
   UPDATE QUOTA DTO
========================= */
export class UpdateQuotaDto {
  @IsNumber()
  @Min(100 * 1024 * 1024) // 100MB
  @Max(1024 * 1024 * 1024 * 1024) // 1TB
  @Type(() => Number)
  quotaBytes: number;
}
