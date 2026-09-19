import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { CloudinaryModule } from '../../common/cloudinary/cloudinary.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import {
  ProcessedEvent,
  ProcessedEventSchema,
} from './schemas/processed-event.schema';

@Module({
  imports: [
    CloudinaryModule,
    UsersModule,
    forwardRef(() => WalletModule),
    NotificationsModule,
    ActivityLogModule,
    MongooseModule.forFeature([
      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
    ]),
  ],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
