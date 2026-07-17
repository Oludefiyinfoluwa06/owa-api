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
import {
  ProcessedEvent,
  ProcessedEventDocument,
} from './schemas/processed-event.schema';

@Injectable()
export class DriversService {
  constructor(
    private cloudinary: CloudinaryService,
    private usersService: UsersService,
    private walletService: WalletService,
    private configService: ConfigService,
    @InjectModel(ProcessedEvent.name)
    private processedEventModel: Model<ProcessedEventDocument>,
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

    try {
      await this.createDiditSession(userId);
    } catch (error) {
      (driver as any).identityVerificationStatus = 'In Review';
      (driver as any).identityVerificationMessage =
        error instanceof Error
          ? error.message
          : 'Didit session creation failed';
      await driver.save().catch(() => undefined);
    }

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

  async updateBank(phone: string, bankDto: any) {
    return this.usersService.addBankDetails(
      phone,
      bankDto.bankName,
      bankDto.accountNumber,
      bankDto.bankCode,
    );
  }

  async verifyIdentityDocuments(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== 'driver')
      throw new BadRequestException('User is not a driver');

    const idCardUrl = (user as any).idCardUrl;
    const driversLicenseUrl = (user as any).driversLicenseUrl;

    if (!idCardUrl || !driversLicenseUrl) {
      throw new BadRequestException(
        'National ID card and driver license documents are required before verification',
      );
    }

    const verificationResult = await this.callThirdPartyVerification({
      userId,
      nationalIdUrl: idCardUrl,
      driversLicenseUrl,
    });

    const isVerified = verificationResult.status === 'verified';
    user.idCardVerified =
      verificationResult.idCardStatus === 'verified' || isVerified;
    user.driversLicenseVerified =
      verificationResult.driversLicenseStatus === 'verified' || isVerified;
    (user as any).identityVerificationStatus = verificationResult.status;
    (user as any).identityVerificationMessage = verificationResult.message;
    (user as any).identityVerificationCheckedAt = new Date();

    await user.save();

    return {
      id: user._id,
      userId,
      status: verificationResult.status,
      service: verificationResult.service,
      idCardVerified: user.idCardVerified,
      driversLicenseVerified: user.driversLicenseVerified,
      message: verificationResult.message,
    };
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
    (user as any).identityVerificationStatus = 'In Progress';
    (user as any).identityVerificationMessage =
      'Didit verification session created';
    await user.save();

    return {
      verificationUrl: session.url,
      sessionToken: session.session_token,
      sessionId: user.verificationSessionId,
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
    (user as any).identityVerificationStatus = diditStatus;
    (user as any).identityVerificationMessage =
      `Didit status updated to ${diditStatus}`;
    (user as any).identityVerificationCheckedAt = new Date();
    user.verified = diditStatus === 'Approved';
    user.verificationStatus = diditStatus;
    user.verificationSessionId =
      (user as any).verificationSessionId || undefined;
    await user.save();

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

  private async callThirdPartyVerification(payload: Record<string, unknown>) {
    const provider =
      this.configService.get<string>('identityVerification.provider') || 'mock';
    const baseUrl = this.configService.get<string>(
      'identityVerification.baseUrl',
    );
    const apiKey = this.configService.get<string>(
      'identityVerification.apiKey',
    );

    if (!baseUrl || provider === 'mock') {
      return {
        status: 'pending',
        service: 'mock',
        message:
          'No third-party verification service is configured yet. Verification is queued for manual review.',
        idCardStatus: 'pending',
        driversLicenseStatus: 'pending',
      };
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new BadRequestException(
        `Identity verification failed: ${errorBody || response.statusText}`,
      );
    }

    const data = await response.json().catch(() => ({}));

    return {
      status: data.status || 'pending',
      service: provider,
      message:
        data.message || 'Identity documents were submitted for verification.',
      idCardStatus:
        data.idCardStatus ||
        data.nationalIdStatus ||
        data.idCard ||
        data.status ||
        'pending',
      driversLicenseStatus:
        data.driversLicenseStatus ||
        data.licenseStatus ||
        data.driversLicense ||
        data.status ||
        'pending',
    };
  }
}
