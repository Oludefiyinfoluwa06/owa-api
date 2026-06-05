import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Body,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import * as multer from 'multer';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { DriverDetailsDto } from './dto/driver-details.dto';
import { DriverBankDto } from './dto/driver-bank.dto';

@Controller('drivers')
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Post('onboard')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'idCard', maxCount: 1 },
        { name: 'driversLicense', maxCount: 1 },
      ],
      { storage: multer.memoryStorage() },
    ),
  )
  async onboard(
    @AuthUser() user: any,
    @Body() body: CreateDriverDto,
    @UploadedFiles()
    files: {
      idCard?: Express.Multer.File[];
      driversLicense?: Express.Multer.File[];
    },
  ) {
    const idCardFile = files.idCard && files.idCard[0];
    const driversLicenseFile = files.driversLicense && files.driversLicense[0];

    return this.driversService.onboard(
      user.userId,
      body.vehicleType,
      body.plateNumber,
      idCardFile.buffer,
      idCardFile.originalname,
      driversLicenseFile.buffer,
      driversLicenseFile.originalname,
    );
  }

  @Post('details')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('profilePicture', { storage: multer.memoryStorage() }),
  )
  async details(
    @AuthUser() user: any,
    @Body() body: DriverDetailsDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const updated = await this.driversService.updateDetails(
      user.phone,
      body,
      file?.buffer,
      file?.originalname,
    );
    return { id: updated.id, message: 'Driver details updated successfully' };
  }

  @Post('bank')
  @UseGuards(JwtAuthGuard)
  async bank(@AuthUser() user: any, @Body() body: DriverBankDto) {
    const updated = await this.driversService.updateBank(user.phone, body);
    return {
      id: updated.id,
      message: 'Driver bank details updated successfully',
    };
  }
}
