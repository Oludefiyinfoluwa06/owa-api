import { Controller, Get, Param, Post, Body, UseGuards, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  async getBalance(@AuthUser() user: any) {
    return this.walletService.getBalance(String(user.sub || user.id));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getWallet(@AuthUser() user: any) {
    return this.walletService.getWalletDetails(String(user.sub || user.id));
  }

  @UseGuards(JwtAuthGuard)
  @Post('create')
  async create(@AuthUser() user: any, @Body() body: { skipProvider?: boolean }) {
    return this.walletService.createWalletForUser(String(user.sub || user.id), !!body.skipProvider);
  }

  @UseGuards(JwtAuthGuard)
  @Post('topup')
  async topup(
    @AuthUser() user: any,
    @Body()
    body: {
      amount: number;
      method: 'bank' | 'ussd' | 'card';
      opts?: any;
    },
  ) {
    const userId = String(user.sub || user.id);
    const { amount, method, opts } = body;
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

  @UseGuards(JwtAuthGuard)
  @Post('debit')
  async debit(@AuthUser() user: any, @Body() body: { amount: number }) {
    const userId = String(user.sub || user.id);
    const { amount } = body;
    return this.walletService.debit(userId, amount);
  }

  @UseGuards(JwtAuthGuard)
  @Post('set-pin')
  async setPin(@AuthUser() user: any, @Body() body: { pin: string }) {
    const userId = String(user.sub || user.id);
    return this.walletService.setPin(userId, body.pin);
  }

  @UseGuards(JwtAuthGuard)
  @Post('transfer')
  async transfer(
    @AuthUser() user: any,
    @Body()
    body: { driverTagNumber: string; amount: number; remark?: string; pin: string },
  ) {
    const userId = String(user.sub || user.id);
    return this.walletService.transfer(userId, body.driverTagNumber, body.amount, body.remark, body.pin);
  }

  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  async transactions(@AuthUser() user: any, @Query('page') page = '1', @Query('limit') limit = '20') {
    const userId = String(user.sub || user.id);
    return this.walletService.getTransactions(userId, Number(page), Number(limit));
  }
}
