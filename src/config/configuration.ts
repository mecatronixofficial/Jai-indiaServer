import { registerAs } from '@nestjs/config';

/**
 * =========================
 * APP CONFIG
 * =========================
 */
export const appConfig = registerAs('app', () => ({
  port: Number(process.env.APP_PORT ?? 3000),
  env: process.env.APP_ENV ?? 'development',
  name: process.env.APP_NAME ?? 'Jai-India FileTransfer',
}));

/**
 * =========================
 * JWT CONFIG
 * =========================
 */
export const jwtConfig = registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  };
});

/**
 * =========================
 * MONGO CONFIG
 * =========================
 */
export const mongoConfig = registerAs('mongo', () => ({
  uri:
    process.env.MONGODB_URI ??
    'mongodb://localhost:27017/jai-india-filetransfer',
}));

/**
 * =========================
 * R2 STORAGE CONFIG
 * =========================
 */
export const r2Config = registerAs('r2', () => {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 configuration is missing required credentials');
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName: process.env.R2_BUCKET_NAME ?? 'jai-india-filetransfer',
    endpoint:
      process.env.R2_ENDPOINT ??
      `https://${accountId}.r2.cloudflarestorage.com`,
    presignedUploadExpiry: Number(process.env.PRESIGNED_UPLOAD_EXPIRY ?? 3600),
    presignedDownloadExpiry: Number(
      process.env.PRESIGNED_DOWNLOAD_EXPIRY ?? 900,
    ),
  };
});

/**
 * =========================
 * EMAIL CONFIG
 * =========================
 */
export const emailConfig = registerAs('email', () => {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not defined');
  }

  return {
    provider: process.env.EMAIL_PROVIDER ?? 'resend',
    apiKey,
    from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
  };
});

/**
 * =========================
 * OTP CONFIG
 * =========================
 */
export const otpConfig = registerAs('otp', () => ({
  expiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES ?? 5),
}));

/**
 * =========================
 * RATE LIMIT CONFIG
 * =========================
 */
export const throttleConfig = registerAs('throttle', () => ({
  ttl: Number(process.env.THROTTLE_TTL ?? 60),
  limit: Number(process.env.THROTTLE_LIMIT ?? 100),
}));

/**
 * =========================
 * CRON CONFIG
 * =========================
 */
export const cronConfig = registerAs('cron', () => ({
  deleteSchedule: process.env.CRON_DELETE_SCHEDULE ?? '0 0 * * *',
  softDeleteDays: Number(process.env.SOFT_DELETE_DAYS ?? 7),
}));
