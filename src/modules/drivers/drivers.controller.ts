import {
  BadRequestException,
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  UploadedFile,
  Body,
  Req,
  Headers,
  Param,
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

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async profile(@AuthUser() user: any) {
    return this.driversService.getProfile(user.userId);
  }

  @Get('lookup/:tag')
  @UseGuards(JwtAuthGuard)
  async lookupByTag(@Param('tag') tag: string) {
    return this.driversService.lookupByTag(tag);
  }

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

    if (!idCardFile || !driversLicenseFile) {
      throw new BadRequestException(
        'idCard and driversLicense files are both required',
      );
    }

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

  @Post('verify-identity')
  @UseGuards(JwtAuthGuard)
  async createDiditVerificationSession(@AuthUser() user: any) {
    return this.driversService.createDiditSession(user.userId);
  }

  @Get('verify-identity/status')
  @UseGuards(JwtAuthGuard)
  async checkVerificationStatus(@AuthUser() user: any) {
    return this.driversService.checkVerificationStatus(user.userId);
  }

  @Post('webhooks/didit')
  async diditWebhook(
    @Req() req: any,
    @Headers('x-signature-v2') signature: string,
    @Headers('x-timestamp') timestamp: string,
  ) {
    return this.driversService.handleDiditWebhook(req, signature, timestamp);
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
    return { id: updated._id, message: 'Driver details updated successfully' };
  }

  @Post('bank')
  @UseGuards(JwtAuthGuard)
  async bank(@AuthUser() user: any, @Body() body: DriverBankDto) {
    const updated = await this.driversService.updateBank(user.phone, body);
    return {
      id: updated._id,
      message: 'Driver bank details updated successfully',
    };
  }
}
