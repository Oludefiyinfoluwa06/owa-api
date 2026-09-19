import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';

@Controller('activity-log')
@UseGuards(JwtAuthGuard)
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  async list(
    @AuthUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.activityLogService.findForUser(
      String(user.userId),
      Number(page),
      Number(limit),
    );
  }
}
