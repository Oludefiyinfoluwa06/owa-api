import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AdminService } from './admin.service';
import { RejectDriverDto } from './dto/reject-driver.dto';
import { RejectTransactionDto } from './dto/reject-transaction.dto';
import { ResolveReportDto } from '../reports/dto/resolve-report.dto';
import { CreateAnnouncementDto } from '../announcements/dto/create-announcement.dto';

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

  @Get('students')
  async getPassengers(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPassengers({
      search,
      status,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
    });
  }

  @Get('transactions')
  async getTransactions(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getTransactionsPage({
      search,
      type,
      status,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
    });
  }

  @Get('transactions/:id')
  async getTransactionDetail(@Param('id') id: string) {
    return this.adminService.getTransactionDetail(id);
  }

  @Post('transactions/:id/approve')
  async approveWithdrawal(@Param('id') id: string) {
    return this.adminService.approveWithdrawalTransaction(id);
  }

  @Post('transactions/:id/reject')
  async rejectWithdrawal(@Param('id') id: string, @Body() body: RejectTransactionDto) {
    return this.adminService.rejectWithdrawalTransaction(id, body.reason);
  }

  @Delete('transactions/:id')
  async hideTransaction(@Param('id') id: string) {
    return this.adminService.hideTransaction(id);
  }

  @Post('transactions/:id/retry')
  async retryWithdrawal(@Param('id') id: string) {
    return this.adminService.retryWithdrawalTransaction(id);
  }

  @Get('payments')
  async getPayments(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getPaymentsPage({
      search,
      status,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
    });
  }

  @Get('payments/:id')
  async getPaymentDetail(@Param('id') id: string) {
    return this.adminService.getPaymentDetail(id);
  }

  @Get('reports')
  async getReports(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getReportsPage({
      status,
      search,
      page: Number(page) || undefined,
      limit: Number(limit) || undefined,
    });
  }

  @Get('reports/:id')
  async getReportDetail(@Param('id') id: string) {
    return this.adminService.getReportDetail(id);
  }

  @Post('reports/:id/resolve')
  async resolveReport(
    @AuthUser() user: any,
    @Param('id') id: string,
    @Body() body: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(id, String(user.userId), body.adminNote);
  }

  @Delete('reports/:id')
  async hideReport(@Param('id') id: string) {
    return this.adminService.hideReport(id);
  }

  @Post('announcements')
  async sendAnnouncement(@AuthUser() user: any, @Body() body: CreateAnnouncementDto) {
    return this.adminService.sendAnnouncement(String(user.userId), body.message, body.audience);
  }

  @Get('announcements')
  async getAnnouncements(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.listAnnouncements(Number(page) || undefined, Number(limit) || undefined);
  }
}
