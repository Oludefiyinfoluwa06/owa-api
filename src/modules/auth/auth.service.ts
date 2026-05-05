import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(phone: string, password: string) {
    const user = await this.usersService.validateCredentials(phone, password);
    if (!user) return null;
    // Do not return passwordHash
    const { passwordHash: _, ...result } = user as any;
    return result;
  }

  async login(user: any) {
    if (!user) throw new UnauthorizedException();
    const payload = { sub: user.id, phone: user.phone, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }
}
