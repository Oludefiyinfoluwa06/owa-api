import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Announcement, AnnouncementDocument, AnnouncementAudience } from './schemas/announcement.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<AnnouncementDocument>,
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async send(adminId: string, message: string, audience: AnnouncementAudience = 'ALL') {
    const roleFilter =
      audience === 'ALL' ? { role: { $in: ['student', 'driver'] } } : { role: audience.toLowerCase() };

    const targets = await this.userModel.find(roleFilter).select('_id').lean();
    const targetIds = targets.map((u) => String(u._id));

    const { count } = await this.notificationsService.createMany(
      targetIds,
      'ANNOUNCEMENT',
      'Announcement',
      message,
      { audience },
    );

    const announcement = await this.announcementModel.create({
      message,
      audience,
      sentBy: adminId,
      recipientCount: count,
    });

    await this.activityLogService
      .log(adminId, 'ANNOUNCEMENT_SENT', `Sent an announcement to ${audience}`, {
        announcementId: String(announcement._id),
        recipientCount: count,
      })
      .catch(() => undefined);

    return {
      id: announcement._id,
      message: announcement.message,
      audience: announcement.audience,
      recipientCount: count,
      createdAt: (announcement as any).createdAt,
    };
  }

  async listForAdmin(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const items = await this.announcementModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await this.announcementModel.countDocuments();
    return { items, total, page, limit };
  }
}
