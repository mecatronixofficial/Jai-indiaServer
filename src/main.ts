import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port') ?? 3000;
  const env = configService.get<string>('app.env') ?? 'development';
  const appName =
    configService.get<string>('app.name') ?? 'Jai-India FileTransfer';

  /**
   * 🔐 TRUST PROXY (Cloudflare / VPS)
   */
  app.set('trust proxy', 1);

  /**
   * 🛡 SECURITY HEADERS
   */
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy:
        env === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
              },
            }
          : false,
    }),
  );

  /**
   * ⚡ COMPRESSION
   */
  app.use(compression());

  /**
   * 🌍 CORS
   */
  app.enableCors({
    origin:
      env === 'production'
        ? [process.env.FRONTEND_URL || 'https://app.jai-india.com']
        : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  /**
   * 🧪 VALIDATION
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      errorHttpStatusCode: 422,
    }),
  );

  /**
   * 🌐 PREFIX
   */
  app.setGlobalPrefix('api/v1');

  app.enableShutdownHooks();

  process.on('SIGINT', async () => {
    logger.warn('App shutting down (SIGINT)');
    await app.close();
  });

  process.on('SIGTERM', async () => {
    logger.warn('App shutting down (SIGTERM)');
    await app.close();
  });

  await app.listen(port);

  logger.log(`
╔══════════════════════════════════════════════════════════╗
║        🇮🇳  ${appName.padEnd(40)}║
╠══════════════════════════════════════════════════════════╣
║  Environment : ${env.padEnd(42)}║
║  Port        : ${String(port).padEnd(42)}║
║  API Base    : http://localhost:${port}/api/v1${''.padEnd(14)}║
║  Status      : Running . . ! ${''.padEnd(33)}║
╚══════════════════════════════════════════════════════════╝
`);
}

bootstrap();
