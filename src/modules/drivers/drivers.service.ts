import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { Request } from 'express';
import { CloudinaryService } from '../../common/cloudinary/cloudinary.service';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import {
  ProcessedEvent,
  ProcessedEventDocument,
} from './schemas/processed-event.schema';
import { DriverBankDto } from './dto/driver-bank.dto';

@Injectable()
export class DriversService {
  constructor(
    private cloudinary: CloudinaryService,
    private usersService: UsersService,
    private walletService: WalletService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private activityLogService: ActivityLogService,
    @InjectModel(ProcessedEvent.name)
    private processedEventModel: Model<ProcessedEventDocument>,
  ) {}

  async getProfile(id: string) {
    return this.usersService.getDriverProfile(id);
  }

  async lookupByTag(tag: string) {
    return this.usersService.getPublicDriverByTag(tag);
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

    try {
      await this.createDiditSession(userId);
    } catch (error) {
      await this.setIdentityStatus(
        driver,
        'In Review',
        error instanceof Error
          ? error.message
          : 'Didit session creation failed',
      );
    }

    await this.activityLogService
      .log(
        userId,
        'DRIVER_ONBOARDING_SUBMITTED',
        'Driver onboarding documents submitted',
        { vehicleType, plateNumber },
      )
      .catch(() => undefined);

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
      user.profilePicture = details.profilePicture;
    }

    if (details.driverTagNumber) user.driverTagNumber = details.driverTagNumber;
    if (details.vehicleType) user.vehicleType = details.vehicleType;

    return user.save();
  }

  async updateBank(phone: string, bankDto: DriverBankDto) {
    // Reject a bad/unresolvable account at save time instead of leaving the
    // driver to discover it only when a withdrawal fails.
    const resolved = await this.walletService.resolveAccountName(
      bankDto.accountNumber,
      bankDto.bankCode,
    );
    return this.usersService.addBankDetails(
      phone,
      bankDto.bankName,
      bankDto.accountNumber,
      bankDto.bankCode,
      resolved.accountName,
    );
  }

  private async setIdentityStatus(
    user: any,
    status: string,
    message?: string,
  ) {
    user.identityVerificationStatus = status;
    if (message !== undefined) user.identityVerificationMessage = message;
    user.identityVerificationCheckedAt = new Date();
    user.verificationStatus = status;
    if (status === 'Approved') user.verified = true;
    await user.save();

    await this.notificationsService
      .create(
        String(user._id),
        'IDENTITY_VERIFICATION',
        'Identity verification update',
        message || `Your identity verification status is now ${status}`,
        { status },
      )
      .catch(() => undefined);

    await this.activityLogService
      .log(
        String(user._id),
        'IDENTITY_VERIFICATION_UPDATED',
        `Identity verification status updated to ${status}`,
        { status },
      )
      .catch(() => undefined);

    return user;
  }

  async createDiditSession(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');

    const apiKey = this.configService.get<string>('didit.apiKey');
    const workflowId = this.configService.get<string>('didit.workflowId');
    const callbackUrl = this.configService.get<string>('didit.callbackUrl');
    const baseUrl = this.configService.get<string>('didit.baseUrl');

    if (!apiKey || !workflowId) {
      throw new BadRequestException(
        'Didit identity verification is not configured yet',
      );
    }

    const response = await fetch(`${baseUrl}/v3/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        callback: callbackUrl,
        vendor_data: userId,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadRequestException(
        `Didit session creation failed: ${errorBody || response.statusText}`,
      );
    }

    const data = await response.json();
    const session = data.session || data;

    user.verificationSessionId = session.id || session.session_id;
    await this.setIdentityStatus(
      user,
      'In Progress',
      'Didit verification session created',
    );

    return {
      verificationUrl: session.url,
      sessionToken: session.session_token,
      sessionId: user.verificationSessionId,
    };
  }

  async checkVerificationStatus(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');

    const sessionId = (user as any).verificationSessionId;
    if (!sessionId) {
      throw new BadRequestException(
        'No verification session has been started for this driver',
      );
    }

    const apiKey = this.configService.get<string>('didit.apiKey');
    const baseUrl = this.configService.get<string>('didit.baseUrl');
    if (!apiKey || !baseUrl) {
      throw new BadRequestException(
        'Didit identity verification is not configured yet',
      );
    }

    const response = await fetch(
      `${baseUrl}/v3/session/${sessionId}/decision/`,
      {
        method: 'GET',
        headers: { 'x-api-key': apiKey },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadRequestException(
        `Didit status check failed: ${errorBody || response.statusText}`,
      );
    }

    const data = await response.json();
    const status = this.normalizeDiditStatus(data.status);
    await this.setIdentityStatus(
      user,
      status,
      `Didit status refreshed to ${status}`,
    );

    return {
      status,
      identityVerificationStatus: (user as any).identityVerificationStatus,
    };
  }

  async handleDiditWebhook(
    req: Request & { rawBody?: string },
    signature?: string,
    timestamp?: string,
  ) {
    const rawBody =
      req.rawBody || (typeof req.body === 'string' ? req.body : '');
    if (!rawBody) {
      return { received: true, message: 'Webhook body was empty' };
    }

    const verificationResult = this.verifyDiditWebhook(
      rawBody,
      signature,
      timestamp,
    );
    if (!verificationResult.isValid) {
      throw new UnauthorizedException(verificationResult.message);
    }

    const payload = verificationResult.payload;
    if (!payload) {
      return { received: true, message: 'Webhook payload was empty' };
    }

    void this.queueDiditWebhookProcessing(payload);
    return { received: true, message: 'Webhook received' };
  }

  private verifyDiditWebhook(
    rawBody: string,
    signature?: string,
    timestamp?: string,
  ) {
    const secret = this.configService.get<string>('didit.webhookSecret');
    if (!secret) {
      return {
        isValid: false,
        message: 'Didit webhook secret is not configured',
      };
    }

    if (!signature || !timestamp) {
      return {
        isValid: false,
        message: 'Didit webhook signature is missing',
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const receivedTimestamp = Number(timestamp);
    if (
      Number.isNaN(receivedTimestamp) ||
      Math.abs(now - receivedTimestamp) > 300
    ) {
      return {
        isValid: false,
        message: 'Didit webhook timestamp is invalid',
      };
    }

    const canonicalBody = this.canonicalJson(rawBody);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(canonicalBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');
    const isValid =
      expectedBuffer.length === receivedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!isValid) {
      return {
        isValid: false,
        message: 'Didit webhook signature is invalid',
      };
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      return { isValid: false, message: 'Didit webhook payload is invalid' };
    }

    return { isValid: true, payload };
  }

  private async queueDiditWebhookProcessing(payload: any) {
    const eventId = payload.event_id || payload.id || payload.eventId;
    if (!eventId) {
      return { received: true, message: 'No event id found' };
    }

    const existing = await this.processedEventModel.findOne({ eventId }).lean();
    if (existing) {
      return;
    }

    const status = payload.status;
    if (typeof status !== 'string') {
      return;
    }

    const userId =
      payload.vendor_data ||
      payload.vendorData ||
      payload.user_id ||
      payload.userId;
    if (!userId) {
      return;
    }

    const user = await this.usersService.findById(String(userId));
    if (!user) {
      return;
    }

    const diditStatus = this.normalizeDiditStatus(status);
    await this.setIdentityStatus(
      user,
      diditStatus,
      `Didit status updated to ${diditStatus}`,
    );

    await this.processedEventModel.create({
      eventId,
      status: diditStatus,
      source: 'didit',
    });
  }

  private normalizeDiditStatus(status: string) {
    const statuses = [
      'Not Started',
      'In Progress',
      'In Review',
      'Approved',
      'Declined',
      'Resubmitted',
      'Awaiting User',
      'Abandoned',
      'Expired',
      'Kyc Expired',
    ];

    return statuses.includes(status) ? status : 'In Review';
  }

  private canonicalJson(value: unknown): string {
    const normalized = this.normalizeForCanonical(value);
    return JSON.stringify(normalized);
  }

  private normalizeForCanonical(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeForCanonical(item));
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, this.normalizeForCanonical(item)] as const);
      return Object.fromEntries(entries);
    }

    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }

    return value;
  }

}
