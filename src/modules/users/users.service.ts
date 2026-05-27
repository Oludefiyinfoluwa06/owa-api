import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel('User') private userModel: Model<UserDocument>) {}

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

  async findByPhone(phone: string) {
    return this.userModel.findOne({ phone }).exec();
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  async verifyUser(phone: string, code: string) {
    const user = await this.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    if (user.verificationCode !== code)
      throw new BadRequestException('Invalid code');
    user.verified = true;
    user.verificationCode = undefined;
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
    if (details.driverTagNumber) user.driverTagNumber = details.driverTagNumber;
    if (details.vehicleType) user.vehicleType = details.vehicleType as any;
    return user.save();
  }

  async addBankDetails(
    phone: string,
    bankName: string,
    accountNumber: string,
    bankCode?: string,
  ) {
    const user = await this.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');
    user.bankName = bankName;
    user.accountNumber = accountNumber;
    if (bankCode) user.bankCode = bankCode;
    return user.save();
  }

  async findByDriverTagNumber(tag: string) {
    return this.userModel.findOne({ driverTagNumber: tag }).exec();
  }
}
