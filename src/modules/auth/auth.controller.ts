import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { MailService } from '../mail/mail.service';
import { MessagingService } from '../messaging/messaging.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { CreateDriverDto } from './dto/create-driver.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

// function generate4Digit() {
//   return Math.floor(1000 + Math.random() * 9000).toString();
// }

function generateRecoveryKey() {
  return Math.random().toString(36).slice(2, 10);
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
    // const code = generate4Digit();
    const created = await this.usersService.createUser({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: 'student',
      verified: true,
      verificationCode: null,
    });

    // await this.messagingService
    //   .sendSms(created.phone, `Your verification code is ${code}`)
    //   .catch((e) => {
    //     console.error('Failed to send SMS verification', e);
    //     this.mailService
    //       .sendVerificationEmail(created.email, code)
    //       .catch(() => {});
    //   });

    return {
      id: created._id,
      message: 'Registration successful',
    };
  }

  @Post('register/driver')
  async registerDriver(@Body() dto: CreateDriverDto) {
    // const code = generate4Digit();
    const created = await this.usersService.createUser({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: 'driver',
      verified: true,
      verificationCode: null,
    });

    // send verification code to user's phone via SMS (Twilio)
    // await this.messagingService
    //   .sendSms(created.phone, `Your verification code is ${code}`)
    //   .catch((e) => {
    //     console.error('Failed to send SMS verification', e);
    //     this.mailService
    //       .sendVerificationEmail(created.email, code)
    //       .catch(() => {});
    //   });

    return {
      id: created._id,
      message: 'Registration successful',
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
