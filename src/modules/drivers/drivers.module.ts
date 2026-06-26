import { Module, forwardRef } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [CloudinaryModule, UsersModule, forwardRef(() => WalletModule)],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
