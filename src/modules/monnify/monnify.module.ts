import { forwardRef, Module } from '@nestjs/common';
import { MonnifyService } from './monnify.service';
import { MonnifyController } from './monnify.controller';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [forwardRef(() => UsersModule), forwardRef(() => WalletModule)],
  controllers: [MonnifyController],
  providers: [MonnifyService],
  exports: [MonnifyService],
})
export class MonnifyModule {}
