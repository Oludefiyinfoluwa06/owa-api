import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance/:userId')
  async getBalance(@Param('userId') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Get(':userId')
  async getWallet(@Param('userId') userId: string) {
    return this.walletService.getWalletDetails(userId);
  }

  @Post('create')
  async create(@Body() body: { userId: string; skipProvider?: boolean }) {
    return this.walletService.createWalletForUser(
      body.userId,
      !!body.skipProvider,
    );
  }

  @Post('topup')
  async topup(
    @Body()
    body: {
      userId: string;
      amount: number;
      method: 'bank' | 'ussd' | 'card';
      opts?: any;
    },
  ) {
    const { userId, amount, method, opts } = body;
    return this.walletService.topUp(userId, amount, method, opts || {});
  }

  @Post('authorize-card-otp')
  async authorizeCardOtp(
    @Body()
    body: {
      transactionReference?: string;
      tokenId: string;
      token: string;
    },
  ) {
    return this.walletService.authorizeCardOtp(
      body.transactionReference,
      body.tokenId,
      body.token,
    );
  }

  @Post('debit')
  async debit(@Body() body: { userId: string; amount: number }) {
    const { userId, amount } = body;
    return this.walletService.debit(userId, amount);
  }
}
