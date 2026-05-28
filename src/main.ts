import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
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
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);

  /* =========================
     ENV CONFIG
  ========================= */
  const port = configService.get<number>('app.port') ?? 5000;
  const env =
    configService.get<string>('app.env') ??
    process.env.NODE_ENV ??
    'development';
  const isProd = env === 'production';
  const frontendUrl =
    configService.get<string>('app.frontendUrl') ?? 'http://localhost:3000';

  /* =========================
     TRUST PROXY
     Required when behind nginx/Cloudflare so `req.ip` reflects
     the real client IP, not the proxy.
  ========================= */
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  /* =========================
     BODY PARSER
  ========================= */
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });

  /* =========================
     SECURITY HEADERS
  ========================= */
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProd
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  /* =========================
     GLOBAL MIDDLEWARE
  ========================= */
  app.use(cookieParser());
  app.use(compression());

  /* =========================
     CORS
  ========================= */
  const configuredOrigins =
    configService
      .get<string>('CORS_ORIGINS')
      ?.split(',')
      .map((url) => url.trim())
      .filter(Boolean) ?? [];

  const baseOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    frontendUrl,
    ...configuredOrigins,
  ];

  const uniqueOrigins = [
    ...new Set(baseOrigins.filter((o): o is string => Boolean(o))),
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow same-origin and non-browser tools (Postman, curl)
      if (!origin) return callback(null, true);

      if (uniqueOrigins.includes(origin)) {
        return callback(null, true);
      }

      // In dev, log unmatched origins but still allow — saves time
      // when the frontend changes ports. Comment this out to harden.
      if (!isProd) {
        logger.warn(`Dev-mode CORS allow for unlisted origin: ${origin}`);
        return callback(null, true);
      }

      logger.warn(`Blocked CORS request from: ${origin}`);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86_400,
  });

  /* =========================
     API PREFIX + VERSIONING
     Final route shape: /api/v1/*
  ========================= */
  app.setGlobalPrefix('api', {
    exclude: ['health', '/'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  /* =========================
     VALIDATION
  ========================= */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
      stopAtFirstError: true,
    }),
  );

  /* =========================
     GRACEFUL SHUTDOWN
  ========================= */
  app.enableShutdownHooks();

  const shutdown = async (signal: string) => {
    logger.log(`${signal} received — shutting down...`);
    try {
      await app.close();
      logger.log('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', err as Error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason as Error);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    // Uncaught exceptions leave the process in an undefined state.
    // Best practice: log, then exit so a process manager (PM2, k8s) restarts.
    process.exit(1);
  });

  /* =========================
     START
  ========================= */
  await app.listen(port, '0.0.0.0');

  logger.log(`
═══════════════════════════════════════════════════════════
🚀  Server started

🌍  Environment:     ${env}
📡  Port:            ${port}
🔗  API URL:         http://localhost:${port}/api/v1
🌐  Frontend URL:    ${frontendUrl}
🔒  Production:      ${isProd ? 'YES' : 'NO'}

✅  Allowed Origins:
${uniqueOrigins.map((o) => `    - ${o}`).join('\n')}
═══════════════════════════════════════════════════════════
  `);
}

void bootstrap();
