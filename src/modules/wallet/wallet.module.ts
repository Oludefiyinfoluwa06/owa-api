import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletSchema } from './schemas/wallet.schema';
import { MonnifyModule } from '../monnify/monnify.module';
import { PaymentModule } from '../payment/payment.module';
import { TransactionModule } from '../transaction/transaction.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Wallet', schema: WalletSchema }]),
    PaymentModule,
    TransactionModule,
    MonnifyModule,
    UsersModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
