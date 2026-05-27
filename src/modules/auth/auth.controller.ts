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
import { DriverDetailsDto } from './dto/driver-details.dto';
import { DriverBankDto } from './dto/driver-bank.dto';

function generate4Digit() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

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

    // create wallet (provider reserved account) for the user
    await this.walletService.createWalletForUser(String(created.id)).catch(() => {});

    // send verification code to user's phone via SMS (Twilio)
    await this.messagingService
      .sendSms(created.phone, `Your verification code is ${code}`)
      .catch((e) => {
        // fallback: log and also attempt email
        // eslint-disable-next-line no-console
        console.error('Failed to send SMS verification', e);
        this.mailService
          .sendVerificationEmail(created.email, code)
          .catch(() => {});
      });

    return {
      id: created.id,
      phone: created.phone,
      message: 'Verification code sent',
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
    // create wallet (provider reserved account) for the driver
    await this.walletService.createWalletForUser(String(created.id)).catch(() => {});

    await this.messagingService
      .sendSms(created.phone, `Your verification code is ${code}`)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Failed to send SMS verification', e);
        this.mailService
          .sendVerificationEmail(created.email, code)
          .catch(() => {});
      });
    return {
      id: created.id,
      phone: created.phone,
      message: 'Verification code sent',
    };
  }

  @Post('verify')
  async verify(@Body() dto: VerifyAccountDto) {
    const user = await this.usersService.verifyUser(dto.phone, dto.code);
    return { id: user.id, phone: user.phone, verified: user.verified };
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

  @Post('driver/details')
  async driverDetails(@Body() body: { phone: string } & DriverDetailsDto) {
    const updated = await this.usersService.addDriverDetails(
      body.phone,
      body as any,
    );
    return { id: updated.id, phone: updated.phone };
  }

  @Post('driver/bank')
  async driverBank(@Body() body: { phone: string } & DriverBankDto) {
    const updated = await this.usersService.addBankDetails(
      body.phone,
      body.bankName,
      body.accountNumber,
      body.bankCode,
    );
    return { id: updated.id, phone: updated.phone };
  }
}
