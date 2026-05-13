import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class MessagingService {
  private client?: twilio.Twilio;
  private from?: string;
  private enabled = false;
  private logger = new Logger(MessagingService.name);

  constructor(private configService: ConfigService) {
    const sid = this.configService.get<string>('twilio.accountSid');
    const token = this.configService.get<string>('twilio.authToken');
    const from = this.configService.get<string>('twilio.from');

    if (sid && token && from) {
      this.client = twilio(sid, token);
      this.from = from;
      this.enabled = true;
    } else {
      this.logger.warn(
        'Twilio not configured — SMS messages will be logged instead of sent',
      );
    }
  }

  async sendSms(to: string, body: string) {
    if (!this.enabled) {
      this.logger.log(`[mock sms] to=${to} body=${body}`);
      return { sid: 'mock', to, body };
    }

    try {
      const msg = await this.client!.messages.create({
        from: this.from!,
        to,
        body,
      });

      this.logger.log(`SMS sent: ${msg.sid}`);
      return msg;
    } catch (err) {
      this.logger.error('Failed sending SMS message', err as any);
      throw err;
    }
  }
}
