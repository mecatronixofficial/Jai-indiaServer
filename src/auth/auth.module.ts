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

    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.secret');

        if (!secret) {
          throw new Error('JWT secret is not configured');
        }

        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>('jwt.expiresIn', '1d'), // 🔐 safer default
            issuer: 'your-app',        // ✅ add
            audience: 'your-app-users' // ✅ add
          },
        };
      },
    }),

    forwardRef(() => UsersModule),
    forwardRef(() => OtpModule),
    TransactionsModule,
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy],

  exports: [
    AuthService,
    JwtModule, // ✅ needed if other modules sign tokens
  ],
})
export class AuthModule {}