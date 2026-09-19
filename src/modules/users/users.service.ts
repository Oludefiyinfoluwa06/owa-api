import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UserDocument } from './schemas/user.schema';
import { WalletService } from '../wallet/wallet.service';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import * as QRCode from 'qrcode';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => WalletService))
    private walletService: WalletService,
    private cloudinary: CloudinaryService,
  ) {}

  private async hashPassword(password: string) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async createUser(userPartial: Partial<UserDocument> & { password?: string }) {
    const existing = await this.userModel.findOne({
      $or: [{ phone: userPartial.phone }, { email: userPartial.email }],
    });
    if (existing) throw new BadRequestException('User already exists');

    const passwordHash = userPartial.password
      ? await this.hashPassword(userPartial.password)
      : userPartial.passwordHash;

    const created = new this.userModel({
      fullName: userPartial.fullName,
      email: userPartial.email,
      phone: userPartial.phone,
      passwordHash,
      role: userPartial.role ?? 'student',
      verified: userPartial.verified ?? false,
      verificationCode: userPartial.verificationCode,
    });

    return created.save();
  }

  async findById(userId: string) {
    return await this.userModel.findById(userId);
  }

  async findByPhone(phone: string) {
    return await this.userModel.findOne({ phone });
  }

  async findByEmail(email: string) {
    return await this.userModel.findOne({ email });
  }

  /**
   * Lets a fixed code (OTP_BYPASS_CODE) verify any account outside production,
   * so QA/frontend testing isn't blocked on inbox access to real OTP emails/SMS.
   * Gated on NODE_ENV as well so it stays inert even if the env var leaks into prod.
   */
  private isOtpBypassCode(code: string) {
    const bypassCode = process.env.OTP_BYPASS_CODE;
    return (
      process.env.NODE_ENV !== 'production' && !!bypassCode && code === bypassCode
    );
  }

  async verifyUser(phone: string, code: string) {
    const user = await this.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationCode !== code && !this.isOtpBypassCode(code))
      throw new BadRequestException('Invalid code');
    user.verified = true;
    user.verificationCode = undefined;
    return user.save();
  }

  async verifyUserByEmail(email: string, code: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationCode !== code && !this.isOtpBypassCode(code))
      throw new BadRequestException('Invalid code');
    user.verified = true;
    user.verificationCode = undefined;
    return user.save();
  }

  async setVerificationCodeByEmail(email: string, code: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    user.verificationCode = code;
    return user.save();
  }

  async setVerificationCodeByPhone(phone: string, code: string) {
    const user = await this.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    user.verificationCode = code;
    return user.save();
  }

  async validateCredentials(phone: string, password: string) {
    const user = await this.findByPhone(phone);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return null;
    return user;
  }

  async setRecoveryKey(email: string, key: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    user.recoveryKey = key;
    return user.save();
  }

  async resetPassword(email: string, token: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    if (!user.recoveryKey || user.recoveryKey !== token)
      throw new BadRequestException('Invalid token');
    user.passwordHash = await this.hashPassword(password);
    user.recoveryKey = undefined;
    return user.save();
  }

  async addDriverDetails(phone: string, details: Partial<UserDocument>) {
    const user = await this.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');
    if (details.profilePicture) user.profilePicture = details.profilePicture;
    if (details.driverTagNumber) {
      const tag = details.driverTagNumber;
      // ensure uniqueness
      const existing = await this.findByDriverTagNumber(tag);
      if (existing && String(existing._id) !== String(user._id))
        throw new BadRequestException('driverTagNumber already in use');

      user.driverTagNumber = tag;

      try {
        const pngBuffer: Buffer = await QRCode.toBuffer(tag, { type: 'png' });
        const uploadRes = await this.cloudinary.uploadBuffer(
          pngBuffer,
          `${user._id}_driver_qr`,
          'drivers/qr',
          'image',
        );
        (user as any).qrUrl = uploadRes.secure_url;
      } catch (e) {
        console.error('Failed to generate or upload QR', e);
      }
    }

    if (details.vehicleType) user.vehicleType = details.vehicleType as any;

    return user.save();
  }

  async addBankDetails(
    phone: string,
    bankName: string,
    accountNumber: string,
    bankCode?: string,
    accountName?: string,
  ) {
    const user = await this.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');
    user.bankName = bankName;
    user.accountNumber = accountNumber;
    if (bankCode) user.bankCode = bankCode;
    user.accountName = accountName;
    return user.save();
  }

  async findByDriverTagNumber(tag: string) {
    return await this.userModel.findOne({ driverTagNumber: tag });
  }

  async getPublicDriverByTag(tag: string) {
    const driver = await this.findByDriverTagNumber(tag);
    if (!driver || driver.role !== 'driver')
      throw new NotFoundException('Driver not found');

    return {
      id: driver._id,
      fullName: driver.fullName,
      profilePicture: driver.profilePicture,
      vehicleType: driver.vehicleType,
      plateNumber: (driver as any).plateNumber,
      driverTagNumber: driver.driverTagNumber,
      verified: driver.verified,
    };
  }

  async getProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'student') {
      let walletDetails: any = null;
      try {
        walletDetails = await this.walletService.getWalletDetails(
          String(user._id),
        );
      } catch (e) {
        walletDetails = null;
      }

      return {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        profilePicture: user.profilePicture,
        role: user.role,
        verified: user.verified,
        wallet: walletDetails.wallet,
      };
    }

    return {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profilePicture: user.profilePicture,
      role: user.role,
      verified: user.verified,
    };
  }

  async getDriverProfile(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');

    let walletInfo: any = null;
    try {
      const details = await this.walletService.getWalletDetails(
        String(user._id),
      );
      walletInfo = details?.wallet || null;
    } catch (e) {
      walletInfo = null;
    }

    return {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profilePicture: user.profilePicture,
      driverTagNumber: user.driverTagNumber,
      vehicleType: user.vehicleType,
      plateNumber: (user as any).plateNumber,
      bankName: user.bankName,
      accountNumber: user.accountNumber,
      bankCode: user.bankCode,
      accountName: user.accountName,
      idCardUrl: (user as any).idCardUrl,
      driversLicenseUrl: (user as any).driversLicenseUrl,
      idCardVerified: user.idCardVerified ?? false,
      driversLicenseVerified: user.driversLicenseVerified ?? false,
      verificationSessionId: (user as any).verificationSessionId,
      verificationStatus: (user as any).verificationStatus || 'Not Started',
      identityVerificationStatus: (user as any).identityVerificationStatus || 'pending',
      verified: user.verified,
      role: user.role,
      wallet: walletInfo,
    };
  }
}
