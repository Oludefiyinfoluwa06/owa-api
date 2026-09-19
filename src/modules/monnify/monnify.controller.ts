import {
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { MonnifyService } from './monnify.service';
import { WalletService } from '../wallet/wallet.service';

@Controller('monnify')
export class MonnifyController {
  private readonly logger = new Logger(MonnifyController.name);

  constructor(
    private readonly monnifyService: MonnifyService,
    private readonly walletService: WalletService,
  ) {}

  @Post('webhook')
  async webhook(
    @Req() req: Request & { rawBody?: string },
    @Headers('monnify-signature') signature: string,
  ) {
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    if (!this.monnifyService.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Monnify webhook signature');
    }

    const event = await this.monnifyService.parseWebhook(req.body);
    this.logger.debug('Received Monnify webhook', {
      eventType: event.eventType,
      providerReference: event.providerReference,
      status: event.status,
    });

    const result = await this.walletService.handleMonnifyWebhookEvent(event);
    return { received: true, ...result };
  }
}
