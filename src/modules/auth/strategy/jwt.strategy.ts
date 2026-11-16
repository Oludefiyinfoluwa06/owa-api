import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }
  async validate(payload: any) {
    // Fire-and-forget: runs on every authenticated request, so it must never
    // slow a request down or fail it if the write hiccups.
    void this.usersService.touchLastActive(payload.sub).catch(() => undefined);
    return { userId: payload.sub, phone: payload.phone, role: payload.role };
  }
}
