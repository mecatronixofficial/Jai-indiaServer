import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';

import { Otp, OtpDocument } from './schemas/otp.schema';
import { OtpPurpose } from '../common/enums';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private resend: Resend;
  private from: string;

  constructor(
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('email.apiKey');

    if (!apiKey) {
      throw new Error('❌ RESEND_API_KEY missing in environment variables');
    }

    this.resend = new Resend(apiKey);
    this.from =
      this.configService.get<string>('email.from') || 'onboarding@resend.dev';
  }

  /* =========================
     SECURE OTP GENERATION
  ========================= */
  private generateOtpCode(): string {
    return randomInt(100000, 999999).toString();
  }

  /* =========================
     SEND OTP
  ========================= */
  async sendOtp(
    userId: string,
    email: string,
    purpose: OtpPurpose,
    fileId?: string,
  ): Promise<{ message: string }> {
    const expiryMinutes = this.configService.get<number>(
      'otp.expiryMinutes',
      5,
    );

    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Invalidate previous OTPs
    await this.otpModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        purpose,
        isUsed: false,
      },
      { $set: { isUsed: true } },
    );

    // Generate OTP
    const code = this.generateOtpCode();
    const codeHash = await bcrypt.hash(code, 10);

    await this.otpModel.create({
      userId: new Types.ObjectId(userId),
      email,
      codeHash,
      purpose,
      expiresAt,
      fileId: fileId ? new Types.ObjectId(fileId) : null,
      isUsed: false,
      attempts: 0,
      maxAttempts: 5,
    });

    await this.sendOtpEmail(email, code, purpose, expiryMinutes);

    this.logger.log(`OTP sent to ${email} for ${purpose}`);

    return {
      message: `OTP sent to ${email}. Valid for ${expiryMinutes} minutes.`,
    };
  }

  /* =========================
     VERIFY OTP
  ========================= */
  async verifyOtp(
    userId: string,
    code: string,
    purpose: OtpPurpose,
    fileId?: string,
  ): Promise<boolean> {
    const otp = await this.otpModel.findOne({
      userId: new Types.ObjectId(userId),
      purpose,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (otp.attempts >= otp.maxAttempts) {
      throw new BadRequestException('OTP locked due to too many attempts');
    }

    if (fileId && otp.fileId && otp.fileId.toString() !== fileId) {
      throw new BadRequestException('OTP does not match this request');
    }

    const isValid = await bcrypt.compare(code, otp.codeHash);

    otp.attempts += 1;

    if (!isValid) {
      await otp.save();
      throw new BadRequestException('Invalid OTP');
    }

    otp.isUsed = true;
    await otp.save();

    return true;
  }

  /* =========================
     EMAIL SENDER (RESEND)
  ========================= */
  private async sendOtpEmail(
    email: string,
    code: string,
    purpose: OtpPurpose,
    expiryMinutes: number,
  ): Promise<void> {
    const purposeLabels: Record<OtpPurpose, string> = {
      [OtpPurpose.RESET_PASSWORD]: 'Password Reset',
      [OtpPurpose.DELETE_FILE]: 'File Deletion Confirmation',
      [OtpPurpose.CHANGE_EMAIL]: 'Email Change Verification',
      [OtpPurpose.HIGH_RISK_ACTION]: 'Security Verification',
    };

    const subject = `[Jai-India FileTransfer] ${purposeLabels[purpose]} OTP`;

    const html = `
      <div style="font-family:Arial;padding:20px;background:#f4f4f4">
        <div style="max-width:500px;margin:auto;background:#fff;padding:20px;border-radius:10px">
          <h2 style="color:#ff6b00;text-align:center">Jai-India FileTransfer</h2>

          <p>Your OTP for <b>${purposeLabels[purpose]}</b>:</p>

          <div style="text-align:center;font-size:32px;font-weight:bold;letter-spacing:6px;color:#ff6b00">
            ${code}
          </div>

          <p style="text-align:center;color:#666">
            Valid for ${expiryMinutes} minutes
          </p>

          <hr />

          <p style="font-size:12px;color:#999">
            Never share this OTP. If you didn’t request it, ignore this email.
          </p>
        </div>
      </div>
    `;

    try {
      const response = await this.resend.emails.send({
        from: this.from,
        to: email,
        subject,
        html,
      });
    } catch (err) {
      console.error('RESEND ERROR:', err);
      this.logger.error(`❌ OTP email failed: ${(err as Error).message}`);
      throw new Error('Failed to send OTP email');
    }
  }
}
