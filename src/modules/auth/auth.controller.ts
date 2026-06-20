import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { MailService } from '../mail/mail.service';
import { MessagingService } from '../messaging/messaging.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

// function generate4Digit() {
//   return Math.floor(1000 + Math.random() * 9000).toString();
// }

function generateRecoveryKey() {
  return Math.random().toString(36).slice(2, 10);
}

function generate4Digit() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private usersService: UsersService,
    private mailService: MailService,
    private messagingService: MessagingService,
    private walletService: WalletService,
  ) {}

  @Post('register/student')
  async registerStudent(@Body() dto: CreateStudentDto) {
    const code = generate4Digit();
    const created = await this.usersService.createUser({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: 'student',
      verified: false,
      verificationCode: code,
    });

    await this.mailService
      .sendVerificationEmail(created.email, code)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send verification email', e);
      });

    return {
      id: created._id,
      message: 'Registration successful. Verification code sent to email.',
    };
  }

  @Post('register/driver')
  async registerDriver(@Body() dto: CreateDriverDto) {
    const code = generate4Digit();
    const created = await this.usersService.createUser({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: 'driver',
      verified: false,
      verificationCode: code,
    });

    await this.mailService
      .sendVerificationEmail(created.email, code)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send verification email', e);
      });

    return {
      id: created._id,
      message: 'Registration successful. Verification code sent to email.',
    };
  }

  @Post('verify/email')
  async verifyByEmail(@Body() dto: VerifyEmailDto) {
    // Accept either VerifyEmailDto or plain body with email/code

    const email = dto.email;
    const code = dto.code;
    const user = await this.usersService.verifyUserByEmail(email, code);
    console.log({ user });

    const wallet = await this.walletService
      .createWalletForUser(String(user._id))
      .catch(() => {});

    console.log({ wallet });

    const token = await this.authService.login(user);
    return {
      message: 'Account verified',
      accessToken: token.accessToken,
    };
  }

  @Post('verify')
  async verify(@Body() dto: VerifyAccountDto) {
    const user = await this.usersService.verifyUser(dto.phone, dto.code);
    await this.walletService
      .createWalletForUser(String(user._id))
      .catch(() => {});

    const token = await this.authService.login(user);
    return {
      message: 'Account verified',
      accessToken: token.accessToken,
    };
  }

  @Post('verify/resend')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    const code = generate4Digit();
    // prefer email if provided
    if (dto.email) {
      await this.usersService
        .setVerificationCodeByEmail(dto.email, code)
        .catch(() => {
          throw new BadRequestException('User not found');
        });
      await this.mailService
        .sendVerificationEmail(dto.email, code)
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.error('Failed to send verification email', e);
        });
      return { message: 'Verification code resent to email' };
    }

    if (dto.phone) {
      const user = await this.usersService.findByPhone(dto.phone);
      if (!user) throw new BadRequestException('User not found');
      await this.usersService.setVerificationCodeByPhone(dto.phone, code);
      // attempt SMS then fallback to email
      try {
        await this.messagingService.sendSms(
          dto.phone,
          `Your verification code is ${code}`,
        );
      } catch (e) {
        // fallback to email if available
        if (user.email) {
          await this.mailService
            .sendVerificationEmail(user.email, code)
            .catch(() => {});
        }
      }
      return { message: 'Verification code resent' };
    }

    throw new BadRequestException('email or phone is required');
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.phone, dto.password);
    if (!user) throw new BadRequestException('Invalid credentials');
    return this.authService.login(user);
  }

  @Post('password/recover')
  async recover(@Body() dto: PasswordRecoveryDto) {
    const recoveryKey = generateRecoveryKey();
    const user = await this.usersService.setRecoveryKey(dto.email, recoveryKey);
    await this.mailService
      .sendRecoveryEmail(user.email, recoveryKey)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send recovery email', e);
      });
    return { message: 'Recovery key sent to email' };
  }

  @Post('password/reset')
  async reset(@Body() dto: ResetPasswordDto) {
    if (dto.password !== dto.confirmPassword)
      throw new BadRequestException('Passwords do not match');
    await this.usersService.resetPassword(dto.email, dto.token, dto.password);
    return { message: 'Password reset successful' };
  }
}
