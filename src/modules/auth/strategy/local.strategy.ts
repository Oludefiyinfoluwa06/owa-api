import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'phone' });
  }
  async validate(phone: string, password: string) {
    const user = await this.authService.validateUser(phone, password);
    if (!user) {
      return null;
    }
    return user;
  }
}
