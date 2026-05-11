import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';

import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port') ?? 5000;
  const env = configService.get<string>('app.env') ?? 'development';

  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

  const isProd = env === 'production';

  /* =========================
     TRUST PROXY
  ========================= */
  app.set('trust proxy', 1);

  /* =========================
     SECURITY
  ========================= */
  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },

      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              objectSrc: ["'none'"],
            },
          }
        : false,
    }),
  );

  /* =========================
     MIDDLEWARE
  ========================= */
  app.use(cookieParser());

  app.use(compression());

  /* =========================
     CORS
  ========================= */
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  /* =========================
     GLOBAL PREFIX
  ========================= */
  app.setGlobalPrefix('api/v1');

  /* =========================
     VALIDATION
  ========================= */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /* =========================
     START
  ========================= */
  await app.listen(port, '0.0.0.0');

  logger.log(`
🚀 Server running successfully
🌍 Environment: ${env}
📡 API: http://localhost:${port}/api/v1
  `);
}

bootstrap();
