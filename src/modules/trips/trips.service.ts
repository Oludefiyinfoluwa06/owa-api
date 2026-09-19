import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Trip, TripDocument } from './schemas/trip.schema';
import { UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is a fixed UTC+1, no DST

type Role = 'driver' | 'student';
type Period = 'today' | 'week' | 'month' | 'year';

@Injectable()
export class TripsService {
  constructor(
    @InjectModel(Trip.name) private readonly tripModel: Model<TripDocument>,
    private readonly usersService: UsersService,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async requestTrip(
    passengerId: string,
    driverTagNumber: string,
    fare: number,
    pickupLocation?: string,
    dropoffLocation?: string,
    notes?: string,
  ) {
    const driver = await this.usersService.findByDriverTagNumber(driverTagNumber);
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.role !== 'driver')
      throw new BadRequestException('driverTagNumber does not belong to a driver');

    const trip = await this.tripModel.create({
      passengerId,
      driverId: String(driver._id),
      fare,
      pickupLocation,
      dropoffLocation,
      notes,
    });

    await this.notify(
      String(driver._id),
      'TRIP_REQUESTED',
      'New trip request',
      `You have a new trip request for ${fare}`,
      { tripId: String(trip._id) },
    );
    await this.log(
      passengerId,
      'TRIP_REQUESTED',
      `Requested a trip with driver ${driverTagNumber}`,
      { tripId: String(trip._id), fare },
    );

    return trip;
  }

  private async findOwnedTrip(tripId: string) {
    const trip = await this.tripModel.findById(tripId);
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  async acceptTrip(driverId: string, tripId: string) {
    const trip = await this.findOwnedTrip(tripId);
    if (String(trip.driverId) !== driverId)
      throw new ForbiddenException('You are not the driver for this trip');
    if (trip.status !== 'REQUESTED')
      throw new BadRequestException(`Cannot accept a trip in status ${trip.status}`);

    trip.status = 'ACCEPTED';
    trip.acceptedAt = new Date();
    await trip.save();

    await this.notify(
      String(trip.passengerId),
      'TRIP_ACCEPTED',
      'Trip accepted',
      'Your trip request was accepted by the driver',
      { tripId: String(trip._id) },
    );

    return trip;
  }

  async startTrip(driverId: string, tripId: string) {
    const trip = await this.findOwnedTrip(tripId);
    if (String(trip.driverId) !== driverId)
      throw new ForbiddenException('You are not the driver for this trip');
    if (trip.status !== 'ACCEPTED')
      throw new BadRequestException(`Cannot start a trip in status ${trip.status}`);

    trip.status = 'ONGOING';
    trip.startedAt = new Date();
    await trip.save();

    await this.notify(
      String(trip.passengerId),
      'TRIP_STARTED',
      'Trip started',
      'Your trip has started',
      { tripId: String(trip._id) },
    );

    return trip;
  }

  async completeTrip(driverId: string, tripId: string) {
    const trip = await this.findOwnedTrip(tripId);
    if (String(trip.driverId) !== driverId)
      throw new ForbiddenException('You are not the driver for this trip');
    if (trip.status !== 'ONGOING')
      throw new BadRequestException(`Cannot complete a trip in status ${trip.status}`);

    const settlement = await this.walletService.settleTrip(
      String(trip.passengerId),
      String(trip.driverId),
      trip.fare,
      String(trip._id),
    );

    trip.status = 'COMPLETED';
    trip.completedAt = new Date();
    trip.transactionId = settlement.transactionId;
    await trip.save();

    await this.notify(
      String(trip.passengerId),
      'TRIP_COMPLETED',
      'Trip completed',
      `Trip completed, ${trip.fare} was charged to your wallet`,
      { tripId: String(trip._id), fare: trip.fare },
    );
    await this.notify(
      String(trip.driverId),
      'TRIP_COMPLETED',
      'Trip completed',
      `Trip completed, you earned ${trip.fare}`,
      { tripId: String(trip._id), fare: trip.fare },
    );
    await this.log(
      String(trip.passengerId),
      'TRIP_COMPLETED',
      `Completed trip and paid ${trip.fare}`,
      { tripId: String(trip._id), fare: trip.fare },
    );
    await this.log(
      String(trip.driverId),
      'TRIP_COMPLETED',
      `Completed trip and earned ${trip.fare}`,
      { tripId: String(trip._id), fare: trip.fare },
    );

    return trip;
  }

  async cancelTrip(userId: string, tripId: string, reason?: string) {
    const trip = await this.findOwnedTrip(tripId);
    const isPassenger = String(trip.passengerId) === userId;
    const isDriver = String(trip.driverId) === userId;
    if (!isPassenger && !isDriver)
      throw new ForbiddenException('You are not part of this trip');
    if (!['REQUESTED', 'ACCEPTED'].includes(trip.status))
      throw new BadRequestException(`Cannot cancel a trip in status ${trip.status}`);

    trip.status = 'CANCELLED';
    trip.cancelledAt = new Date();
    trip.cancelledBy = userId;
    trip.cancellationReason = reason;
    await trip.save();

    const otherPartyId = isPassenger ? String(trip.driverId) : String(trip.passengerId);
    await this.notify(
      otherPartyId,
      'TRIP_CANCELLED',
      'Trip cancelled',
      reason ? `Trip was cancelled: ${reason}` : 'Trip was cancelled',
      { tripId: String(trip._id) },
    );
    await this.log(userId, 'TRIP_CANCELLED', 'Cancelled a trip', {
      tripId: String(trip._id),
      reason,
    });

    return trip;
  }

  async listTrips(userId: string, role: Role, page = 1, limit = 20, status?: string) {
    const filter: any = { [this.roleField(role)]: userId };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const items = await this.tripModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await this.tripModel.countDocuments(filter);
    return { items, total };
  }

  async getDaily(userId: string, role: Role, from?: string, to?: string) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const items = await this.tripModel.aggregate([
      {
        $match: {
          [this.roleField(role)]: new Types.ObjectId(userId),
          status: 'COMPLETED',
          completedAt: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$completedAt',
              timezone: 'Africa/Lagos',
            },
          },
          total: { $sum: '$fare' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', total: 1, count: 1 } },
    ]);

    return { from: fromDate, to: toDate, items };
  }

  async getSummary(userId: string, role: Role, period: Period = 'today') {
    const { from, to } = this.resolvePeriod(period);

    const [result] = await this.tripModel.aggregate([
      {
        $match: {
          [this.roleField(role)]: new Types.ObjectId(userId),
          status: 'COMPLETED',
          completedAt: { $gte: from, $lte: to },
        },
      },
      {
        $addFields: {
          hourOfDay: {
            $hour: { date: '$completedAt', timezone: 'Africa/Lagos' },
          },
        },
      },
      {
        $addFields: {
          // morning 05:00-11:59, afternoon 12:00-16:59, evening 17:00-04:59 (wraps overnight)
          timeBucket: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [{ $gte: ['$hourOfDay', 5] }, { $lt: ['$hourOfDay', 12] }],
                  },
                  then: 'morning',
                },
                {
                  case: {
                    $and: [{ $gte: ['$hourOfDay', 12] }, { $lt: ['$hourOfDay', 17] }],
                  },
                  then: 'afternoon',
                },
              ],
              default: 'evening',
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$fare' },
          count: { $sum: 1 },
          morning: {
            $sum: { $cond: [{ $eq: ['$timeBucket', 'morning'] }, '$fare', 0] },
          },
          afternoon: {
            $sum: { $cond: [{ $eq: ['$timeBucket', 'afternoon'] }, '$fare', 0] },
          },
          evening: {
            $sum: { $cond: [{ $eq: ['$timeBucket', 'evening'] }, '$fare', 0] },
          },
        },
      },
    ]);

    return {
      period,
      from,
      to,
      total: result?.total || 0,
      count: result?.count || 0,
      byTimeOfDay: {
        morning: result?.morning || 0,
        afternoon: result?.afternoon || 0,
        evening: result?.evening || 0,
      },
    };
  }

  private roleField(role: Role) {
    return role === 'driver' ? 'driverId' : 'passengerId';
  }

  private toLagos(date: Date) {
    return new Date(date.getTime() + LAGOS_OFFSET_MS);
  }

  private fromLagos(date: Date) {
    return new Date(date.getTime() - LAGOS_OFFSET_MS);
  }

  private resolvePeriod(period: Period) {
    const now = new Date();
    const lagosNow = this.toLagos(now);
    let lagosFrom: Date;

    switch (period) {
      case 'week': {
        const day = lagosNow.getUTCDay(); // 0 = Sunday
        const diffToMonday = (day + 6) % 7;
        lagosFrom = new Date(
          Date.UTC(
            lagosNow.getUTCFullYear(),
            lagosNow.getUTCMonth(),
            lagosNow.getUTCDate() - diffToMonday,
          ),
        );
        break;
      }
      case 'month':
        lagosFrom = new Date(
          Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), 1),
        );
        break;
      case 'year':
        lagosFrom = new Date(Date.UTC(lagosNow.getUTCFullYear(), 0, 1));
        break;
      default:
        lagosFrom = new Date(
          Date.UTC(
            lagosNow.getUTCFullYear(),
            lagosNow.getUTCMonth(),
            lagosNow.getUTCDate(),
          ),
        );
    }

    return { from: this.fromLagos(lagosFrom), to: now };
  }

  private async notify(
    userId: string,
    type: Parameters<NotificationsService['create']>[1],
    title: string,
    body: string,
    data?: any,
  ) {
    await this.notificationsService.create(userId, type, title, body, data).catch(() => undefined);
  }

  private async log(
    userId: string,
    action: Parameters<ActivityLogService['log']>[1],
    description: string,
    metadata?: any,
  ) {
    await this.activityLogService.log(userId, action, description, metadata).catch(() => undefined);
  }
}
