import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly isProd: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('jwt.secret');

    if (!secret) {
      throw new Error('JWT_SECRET is missing in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.extractJwtFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: secret,
      issuer: configService.get<string>('jwt.issuer') ?? 'jai-india-api',
      audience: configService.get<string>('jwt.audience') ?? 'jai-india-users',
      ignoreExpiration: false,
      passReqToCallback: false,
      // ✅ removed clockTolerance — not supported here; set in JwtModule.verifyOptions
    });

    this.isProd = configService.get<string>('app.env') === 'production';
  }

  /* =========================
     COOKIE EXTRACTOR
  ========================= */

  private static extractJwtFromCookie(req: Request): string | null {
    if (!req?.cookies) return null;
    return (
      req.cookies.access_token ??
      req.cookies.accessToken ??
      req.cookies.jwt ??
      null
    );
  }

  /* =========================
     VALIDATE
  ========================= */

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.usersService
      .findAuthUserById(payload.sub)
      .catch(() => null);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account disabled');
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token expired');
    }

    if (user.email !== payload.email) {
      throw new UnauthorizedException('Token mismatch');
    }

    if (user.role !== payload.role) {
      throw new UnauthorizedException('Role mismatch');
    }

    if (!this.isProd) {
      this.logger.debug(`Authenticated: ${user.email}`);
    }

    return {
      _id: user._id.toString(), 
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      tokenVersion: user.tokenVersion,
    };
  }
}
