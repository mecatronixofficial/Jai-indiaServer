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

// Modules
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

// Global
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    /**
     * 🌍 Global Config
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
     * 🗄 MongoDB
     */
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('mongo.uri');

        if (!uri) {
          throw new Error('❌ MongoDB URI missing in .env');
        }

        return {
          uri,
          connectionFactory: (connection) => {
            connection.on('connected', () =>
              console.log('✅ MongoDB connected'),
            );
            connection.on('error', (err) =>
              console.error('❌ MongoDB error:', err),
            );
            return connection;
          },
        };
      },
    }),

    /**
     * 🚦 Rate Limiting
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
      }),
    }),

    /**
     * ⏰ Cron Jobs
     */
    ScheduleModule.forRoot(),

    /**
     * 📦 Feature Modules
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
     * 🔐 Global Security
     */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    /**
     * ❌ Global Error Handler
     */
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    /**
     * 🔄 Response Formatter
     */
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
