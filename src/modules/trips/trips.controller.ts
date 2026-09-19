import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { RequestTripDto } from './dto/request-trip.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { DailyQueryDto } from './dto/daily-query.dto';

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post('request')
  async request(@AuthUser() user: any, @Body() dto: RequestTripDto) {
    return this.tripsService.requestTrip(
      String(user.userId),
      dto.driverTagNumber,
      dto.fare,
      dto.pickupLocation,
      dto.dropoffLocation,
      dto.notes,
    );
  }

  @Post(':id/accept')
  async accept(@AuthUser() user: any, @Param('id') id: string) {
    return this.tripsService.acceptTrip(String(user.userId), id);
  }

  @Post(':id/start')
  async start(@AuthUser() user: any, @Param('id') id: string) {
    return this.tripsService.startTrip(String(user.userId), id);
  }

  @Post(':id/complete')
  async complete(@AuthUser() user: any, @Param('id') id: string) {
    return this.tripsService.completeTrip(String(user.userId), id);
  }

  @Post(':id/cancel')
  async cancel(
    @AuthUser() user: any,
    @Param('id') id: string,
    @Body() dto: CancelTripDto,
  ) {
    return this.tripsService.cancelTrip(String(user.userId), id, dto.reason);
  }

  @Get()
  async list(
    @AuthUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    return this.tripsService.listTrips(
      String(user.userId),
      user.role,
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get('daily')
  async daily(@AuthUser() user: any, @Query() query: DailyQueryDto) {
    return this.tripsService.getDaily(
      String(user.userId),
      user.role,
      query.from,
      query.to,
    );
  }

  @Get('summary')
  async summary(@AuthUser() user: any, @Query() query: SummaryQueryDto) {
    return this.tripsService.getSummary(
      String(user.userId),
      user.role,
      query.period,
    );
  }
}
