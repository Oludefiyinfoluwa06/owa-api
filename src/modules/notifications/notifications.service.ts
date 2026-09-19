import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: any,
  ) {
    return this.notificationModel.create({ userId, type, title, body, data });
  }

  async findForUser(
    userId: string,
    page = 1,
    limit = 20,
    unreadOnly = false,
  ) {
    const skip = (page - 1) * limit;
    const filter: any = { userId };
    if (unreadOnly) filter.read = false;

    const items = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await this.notificationModel.countDocuments(filter);
    return { items, total };
  }

  async unreadCount(userId: string) {
    const count = await this.notificationModel.countDocuments({
      userId,
      read: false,
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notificationModel.findOne({
      _id: notificationId,
      userId,
    });
    if (!notification) throw new NotFoundException('Notification not found');
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
    return notification;
  }

  async markAllRead(userId: string) {
    await this.notificationModel.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } },
    );
    return { ok: true };
  }
}
