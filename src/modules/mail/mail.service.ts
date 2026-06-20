import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('mail.host');
    const port = this.configService.get<number>('mail.port');
    const user = this.configService.get<string>('mail.user');
    const pass = this.configService.get<string>('mail.pass');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendMail(to: string, subject: string, html: string, text?: string) {
    try {
      const from = this.configService.get<string>('mail.from') || undefined;
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text: text ?? undefined,
        html,
      });
      this.logger.log(`Sent mail to ${to}: ${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error('Failed to send email', err as any);
      throw err;
    }
  }

  async sendVerificationEmail(to: string, code: string) {
    const subject = 'OWA - Your verification code';
    const html = `<p>Your verification code is <strong>${code}</strong></p>`;
    return this.sendMail(
      to,
      subject,
      html,
      `Your verification code is ${code}`,
    );
  }

  async sendRecoveryEmail(to: string, key: string) {
    const subject = 'OWA - Password recovery key';
    const html = `<p>Your password recovery key is <strong>${key}</strong></p>`;
    return this.sendMail(to, subject, html, `Your recovery key is ${key}`);
  }
}
