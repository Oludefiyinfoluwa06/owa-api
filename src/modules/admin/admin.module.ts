import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserSchema } from '../users/schemas/user.schema';
import { Trip, TripSchema } from '../trips/schemas/trip.schema';
import { TransactionSchema } from '../wallet/schemas/transaction.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: Trip.name, schema: TripSchema },
      { name: 'Transaction', schema: TransactionSchema },
    ]),
    NotificationsModule,
    ActivityLogModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
