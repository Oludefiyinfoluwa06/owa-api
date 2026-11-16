import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnouncementsService } from './announcements.service';
import { Announcement, AnnouncementSchema } from './schemas/announcement.schema';
import { UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Announcement.name, schema: AnnouncementSchema },
      { name: 'User', schema: UserSchema },
    ]),
    NotificationsModule,
    ActivityLogModule,
  ],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
