import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

import { UsersModule } from '../users/users.module';
import { OtpModule } from '../otp/otp.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    ConfigModule,

    // ✅ JWT Authentication Strategy
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    // ✅ JWT Config (secure + validated)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.secret');

        if (!secret) {
          throw new Error('❌ JWT_SECRET is missing in environment variables');
        }

        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>('jwt.expiresIn', '7d'),
          },
        };
      },
    }),

    // ✅ Avoid circular dependency issues
    forwardRef(() => UsersModule),
    forwardRef(() => OtpModule),
    TransactionsModule,
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy],

  // ✅ Export for global usage
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
