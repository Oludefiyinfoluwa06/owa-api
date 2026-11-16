import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserSchema } from '../users/schemas/user.schema';
import { Trip, TripSchema } from '../trips/schemas/trip.schema';
import { TransactionSchema } from '../wallet/schemas/transaction.schema';
import { WalletSchema } from '../wallet/schemas/wallet.schema';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { ReportsModule } from '../reports/reports.module';
import { AnnouncementsModule } from '../announcements/announcements.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: Trip.name, schema: TripSchema },
      { name: 'Transaction', schema: TransactionSchema },
      { name: 'Wallet', schema: WalletSchema },
    ]),
    WalletModule,
    NotificationsModule,
    ActivityLogModule,
    ReportsModule,
    AnnouncementsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
