import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import {
  appConfig,
  jwtConfig,
  mongoConfig,
  r2Config,
  emailConfig,
  otpConfig,
  throttleConfig,
  cronConfig,
} from './config/configuration';

// Feature Modules
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FilesModule } from './files/files.module';
import { FoldersModule } from './folders/folders.module';
import { UploadModule } from './upload/upload.module';
import { OtpModule } from './otp/otp.module';
import { TransactionsModule } from './transactions/transactions.module';
import { R2Module } from './r2/r2.module';
import { SearchModule } from './search/search.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';

// Global Security
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    /**
     * 🌍 CONFIG
     */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [
        appConfig,
        jwtConfig,
        mongoConfig,
        r2Config,
        emailConfig,
        otpConfig,
        throttleConfig,
        cronConfig,
      ],
    }),

    /**
     * 🗄 DATABASE
     */
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('mongo.uri');

        if (!uri) {
          throw new Error('❌ MongoDB URI missing in environment');
        }

        return {
          uri,
          connectionFactory: (connection) => {
            connection.on('connected', () => {
              console.log('✅ MongoDB connected');
            });

            connection.on('error', (err: Error | any) => {
              console.error('MongoDB error:', err);
            });

            return connection;
          },
        };
      },
    }),

    /**
     * 🚦 RATE LIMITING (HARDENED)
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
            limit: config.get<number>('throttle.limit') ?? 100,
          },
        ],
        ignoreUserAgents: [/health-check/i],
      }),
    }),

    /**
     * ⏰ SCHEDULER
     */
    ScheduleModule.forRoot(),

    /**
     * 📦 FEATURE MODULES
     */
    AuthModule,
    UsersModule,
    FilesModule,
    FoldersModule,
    UploadModule,
    OtpModule,
    TransactionsModule,
    R2Module,
    SearchModule,
    NotificationsModule,
    AdminModule,
  ],

  providers: [
    /**
     * 🔐 AUTH (JWT FIRST)
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    /**
     * 🛡 ROLE BASED ACCESS
     */
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    /**
     * ❌ GLOBAL ERROR HANDLING
     */
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    /**
     * 🔄 RESPONSE FORMATTER
     */
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
