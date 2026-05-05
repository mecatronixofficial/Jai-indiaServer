import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion: number; // ✅ make required if using versioning
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>('jwt.secret');

    if (!secret) {
      throw new Error('JWT_SECRET is missing in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    // 🔒 Basic payload validation
    if (!payload?.sub) {
      this.logger.warn('JWT failed: missing subject');
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      this.logger.warn(`JWT failed: user not found (${payload.sub})`);
      throw new UnauthorizedException('Invalid token');
    }

    if (!user.isActive) {
      this.logger.warn(`JWT failed: inactive user (${user.email})`);
      throw new UnauthorizedException('Account is deactivated');
    }

    // 🔥 Token version check (recommended)
    if (user.tokenVersion !== payload.tokenVersion) {
      this.logger.warn(`JWT failed: token version mismatch (${user.email})`);
      throw new UnauthorizedException('Session expired');
    }

    // 🔥 Soft delete check (if implemented in schema)
    if (user.isDeleted) {
      this.logger.warn(`JWT failed: deleted user (${user.email})`);
      throw new UnauthorizedException('Account removed');
    }

    // ✅ Return safe user object
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
