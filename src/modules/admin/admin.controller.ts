import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { RejectDriverDto } from './dto/reject-driver.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  async getDashboard(@Query('period') period?: 'today' | 'week' | 'month' | 'year') {
    return this.adminService.getDashboard(period);
  }

  @Get('analytics')
  async getAnalytics(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAnalytics({
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
      type,
      status,
      search,
    });
  }

  @Get('drivers/approvals')
  async listApprovals(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listApprovals({
      status,
      search,
      sort,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
    });
  }

  @Get('drivers/approvals/:id')
  async getApprovalDetail(@Param('id') id: string) {
    return this.adminService.getApprovalDetail(id);
  }

  @Post('drivers/approvals/:id/approve')
  async approveDriver(@Param('id') id: string) {
    return this.adminService.approveDriver(id);
  }

  @Post('drivers/approvals/:id/reject')
  async rejectDriver(@Param('id') id: string, @Body() body: RejectDriverDto) {
    return this.adminService.rejectDriver(id, body.reason);
  }

  @Get('drivers/active')
  async getActiveDrivers(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getActiveDrivers({
      search,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
    });
  }
}
