import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class DriversService {
  constructor(
    private cloudinary: CloudinaryService,
    private usersService: UsersService,
    private walletService: WalletService,
  ) {}

  async getProfile(id: string) {
    return this.usersService.getDriverProfile(id);
  }

  async onboard(
    userId: string,
    vehicleType: string,
    plateNumber: string,
    idCardBuffer: Buffer,
    idCardName: string,
    driversLicenseBuffer: Buffer,
    driversLicenseName: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const clFolder = 'drivers';

    const idRes = await this.cloudinary.uploadBuffer(
      idCardBuffer,
      `${userId}_idcard_${idCardName}`,
      clFolder,
      'raw',
    );

    const dlRes = await this.cloudinary.uploadBuffer(
      driversLicenseBuffer,
      `${userId}_drivers_license_${driversLicenseName}`,
      clFolder,
      'raw',
    );

    user.role = 'driver';
    user.vehicleType = vehicleType as any;
    (user as any).plateNumber = plateNumber;
    (user as any).idCardUrl = idRes.secure_url;
    (user as any).driversLicenseUrl = dlRes.secure_url;

    const driver = await user.save();

    const { passwordHash: _, ...rest } = driver.toObject();

    return rest;
  }

  async updateDetails(
    phone: string,
    details: any,
    profileBuffer?: Buffer,
    profileName?: string,
  ) {
    const user = await this.usersService.findByPhone(phone);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');

    // If a file buffer is provided, upload to Cloudinary under driver/profile
    if (profileBuffer) {
      const folder = 'driver/profile';
      const uploadRes = await this.cloudinary.uploadBuffer(
        profileBuffer,
        `${user._id}_profile_${profileName}`,
        folder,
        'image',
      );
      user.profilePicture = uploadRes.secure_url;
    } else if (details.profilePicture) {
      // allow existing URL via body
      user.profilePicture = details.profilePicture;
    }

    if (details.driverTagNumber) user.driverTagNumber = details.driverTagNumber;
    if (details.vehicleType) user.vehicleType = details.vehicleType;

    return user.save();
  }

  async updateBank(phone: string, bankDto: any) {
    return this.usersService.addBankDetails(
      phone,
      bankDto.bankName,
      bankDto.accountNumber,
      bankDto.bankCode,
    );
  }
}
