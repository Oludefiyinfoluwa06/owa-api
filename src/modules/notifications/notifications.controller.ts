import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @AuthUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('unread') unread?: string,
  ) {
    return this.notificationsService.findForUser(
      String(user.userId),
      Number(page),
      Number(limit),
      unread === 'true',
    );
  }

  @Get('unread-count')
  async unreadCount(@AuthUser() user: any) {
    return this.notificationsService.unreadCount(String(user.userId));
  }

  @Post(':id/read')
  async markRead(@AuthUser() user: any, @Param('id') id: string) {
    return this.notificationsService.markRead(String(user.userId), id);
  }

  @Post('read-all')
  async markAllRead(@AuthUser() user: any) {
    return this.notificationsService.markAllRead(String(user.userId));
  }
}
