import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../users/schemas/user.schema';
import { TripDocument } from '../trips/schemas/trip.schema';
import { TransactionDocument } from '../wallet/schemas/transaction.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity-log/activity-log.service';

type Period = 'today' | 'week' | 'month' | 'year';
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is a fixed UTC+1, no DST
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // "active now" = seen in the last 15 minutes

@Injectable()
export class AdminService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
    @InjectModel('Trip') private readonly tripModel: Model<TripDocument>,
    @InjectModel('Transaction')
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  // ---------- shared helpers ----------

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
        const day = lagosNow.getUTCDay();
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

  private activeSince() {
    return new Date(Date.now() - ACTIVE_WINDOW_MS);
  }

  private async notify(
    userId: string,
    title: string,
    body: string,
    data?: any,
  ) {
    await this.notificationsService
      .create(userId, 'DRIVER_APPROVAL', title, body, data)
      .catch(() => undefined);
  }

  private async log(userId: string, description: string, metadata?: any) {
    await this.activityLogService
      .log(userId, 'DRIVER_APPROVAL_UPDATED', description, metadata)
      .catch(() => undefined);
  }

  // ---------- dashboard ----------

  async getDashboard(period: Period = 'today') {
    const { from, to } = this.resolvePeriod(period);

    const [txAgg] = await this.transactionModel.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const [ridesCompleted, activeDrivers, pendingApprovals] =
      await Promise.all([
        this.tripModel.countDocuments({
          status: 'COMPLETED',
          completedAt: { $gte: from, $lte: to },
        }),
        this.userModel.countDocuments({
          role: 'driver',
          driverApprovalStatus: 'APPROVED',
        }),
        this.userModel.countDocuments({
          role: 'driver',
          driverApprovalStatus: 'PENDING',
        }),
      ]);

    const [transactionOverTime, revenueBreakdownByVehicleType, recentTransactions] =
      await Promise.all([
        this.getTransactionOverTime(period, from, to),
        this.getRevenueBreakdownByVehicleType(from, to),
        this.getRecentTransactions(10),
      ]);

    return {
      period,
      range: { from, to },
      totalTransactionAmount: txAgg?.totalAmount || 0,
      totalTransactionCount: txAgg?.count || 0,
      ridesCompleted,
      activeDrivers,
      pendingApprovals,
      // No commission/fee model exists anywhere in the codebase yet - this
      // needs a real business decision before it can be computed for real.
      platformRevenue: null,
      transactionOverTime,
      revenueBreakdownByVehicleType,
      recentTransactions,
    };
  }

  private async getTransactionOverTime(period: Period, from: Date, to: Date) {
    const format = period === 'today' ? '%H:00' : '%Y-%m-%d';
    return this.transactionModel.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: {
            $dateToString: { format, date: '$createdAt', timezone: 'Africa/Lagos' },
          },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, bucket: '$_id', amount: 1 } },
    ]);
  }

  private async getRevenueBreakdownByVehicleType(from: Date, to: Date) {
    const rows = await this.tripModel.aggregate([
      { $match: { status: 'COMPLETED', completedAt: { $gte: from, $lte: to } } },
      {
        $lookup: {
          from: 'users',
          localField: 'driverId',
          foreignField: '_id',
          as: 'driver',
        },
      },
      { $unwind: '$driver' },
      {
        $group: {
          _id: '$driver.vehicleType',
          amount: { $sum: '$fare' },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, vehicleType: '$_id', amount: 1, count: 1 } },
    ]);
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    return rows.map((r) => ({
      ...r,
      percentage: total > 0 ? Math.round((r.amount / total) * 100) : 0,
    }));
  }

  private async getRecentTransactions(limit: number) {
    return this.transactionModel.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          id: '$_id',
          name: '$user.fullName',
          userRole: '$user.role',
          amount: 1,
          type: 1,
          status: 1,
          createdAt: 1,
        },
      },
    ]);
  }

  // ---------- analytics ----------

  async getAnalytics(query: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    search?: string;
  }) {
    const [transactionVolumeByDay, revenueTrendByWeek, transactionLogs, driverPerformance] =
      await Promise.all([
        this.getTransactionVolumeByDay(),
        this.getRevenueTrendByWeek(),
        this.getTransactionLogs(query),
        this.getDriverPerformance(),
      ]);

    return { transactionVolumeByDay, revenueTrendByWeek, transactionLogs, driverPerformance };
  }

  private async getTransactionVolumeByDay() {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.transactionModel.aggregate([
      { $match: { createdAt: { $gte: from } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Lagos' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, date: '$_id', count: 1 } },
    ]);
  }

  private async getRevenueTrendByWeek() {
    const from = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    return this.transactionModel.aggregate([
      { $match: { status: 'SUCCESS', createdAt: { $gte: from } } },
      {
        $group: {
          _id: { isoWeek: { $isoWeek: '$createdAt' }, isoYear: { $isoWeekYear: '$createdAt' } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.isoYear': 1, '_id.isoWeek': 1 } },
      { $project: { _id: 0, week: '$_id.isoWeek', year: '$_id.isoYear', amount: 1 } },
    ]);
  }

  private async getTransactionLogs(query: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const match: any = {};
    if (query.type) match.type = query.type;
    if (query.status) match.status = query.status;

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ];
    if (query.search) {
      pipeline.push({
        $match: { 'user.fullName': { $regex: query.search, $options: 'i' } },
      });
    }
    pipeline.push({ $sort: { createdAt: -1 } });

    const [items, countResult] = await Promise.all([
      this.transactionModel.aggregate([
        ...pipeline,
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            id: '$_id',
            name: '$user.fullName',
            userRole: '$user.role',
            amount: 1,
            type: 1,
            status: 1,
            createdAt: 1,
          },
        },
      ]),
      this.transactionModel.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    return { items, total: countResult[0]?.total || 0, page, limit };
  }

  private async getDriverPerformance(limit = 10) {
    const activeSince = this.activeSince();
    return this.transactionModel.aggregate([
      { $match: { type: 'TRIP_PAYMENT' } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      { $match: { 'user.role': 'driver' } },
      {
        $group: {
          _id: '$userId',
          name: { $first: '$user.fullName' },
          lastActiveAt: { $first: '$user.lastActiveAt' },
          earnings: { $sum: '$amount' },
        },
      },
      { $sort: { earnings: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          driverId: '$_id',
          name: 1,
          earnings: 1,
          status: {
            $cond: [{ $gte: ['$lastActiveAt', activeSince] }, 'Active', 'Inactive'],
          },
        },
      },
    ]);
  }

  // ---------- driver approvals ----------

  async listApprovals(query: {
    status?: string;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const filter: any = { role: 'driver', idCardUrl: { $exists: true, $ne: null } };
    if (query.status) filter.driverApprovalStatus = query.status.toUpperCase();
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [{ fullName: re }, { driverTagNumber: re }, { phone: re }];
    }

    const sort: any =
      query.sort === 'oldest' ? { onboardingSubmittedAt: 1 } : { onboardingSubmittedAt: -1 };

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          'fullName driverTagNumber vehicleType phone driverApprovalStatus onboardingSubmittedAt profilePicture',
        )
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async getApprovalDetail(driverId: string) {
    const driver = await this.userModel.findById(driverId).lean();
    if (!driver || driver.role !== 'driver')
      throw new NotFoundException('Driver not found');

    return {
      id: driver._id,
      fullName: driver.fullName,
      phone: driver.phone,
      email: driver.email,
      dateApplied: driver.onboardingSubmittedAt,
      status: driver.driverApprovalStatus,
      approvalReason: driver.approvalReason,
      vehicleType: driver.vehicleType,
      plateNumber: driver.plateNumber,
      driverTagNumber: driver.driverTagNumber,
      documents: {
        nationalIdCard: driver.idCardUrl,
        driversLicense: driver.driversLicenseUrl,
        passport: driver.passportUrl,
      },
    };
  }

  async approveDriver(driverId: string) {
    const driver = await this.userModel.findById(driverId);
    if (!driver || driver.role !== 'driver')
      throw new NotFoundException('Driver not found');

    // driverApprovalStatus is the sole gate for "can this driver operate" -
    // `verified` is already set true by email/OTP account verification and
    // is a separate concept, so it's left untouched here.
    driver.driverApprovalStatus = 'APPROVED';
    driver.approvalReason = undefined;
    await driver.save();

    await this.notify(
      driverId,
      'Application approved',
      'Your driver application has been approved. You can now accept rides.',
    );
    await this.log(driverId, 'Driver application approved');

    return { ok: true, status: 'APPROVED' };
  }

  async rejectDriver(driverId: string, reason?: string) {
    const driver = await this.userModel.findById(driverId);
    if (!driver || driver.role !== 'driver')
      throw new NotFoundException('Driver not found');

    driver.driverApprovalStatus = 'REJECTED';
    driver.approvalReason = reason;
    await driver.save();

    await this.notify(
      driverId,
      'Application rejected',
      reason || 'Your driver application was rejected.',
      { reason },
    );
    await this.log(driverId, 'Driver application rejected', { reason });

    return { ok: true, status: 'REJECTED' };
  }

  // ---------- active drivers ----------

  async getActiveDrivers(query: { search?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const activeSince = this.activeSince();

    // "Active driver" here means approved-to-operate, not just
    // email/OTP-verified (verified is a separate, unrelated concept).
    const filter: any = { role: 'driver', driverApprovalStatus: 'APPROVED' };
    if (query.search) {
      const re = new RegExp(query.search, 'i');
      filter.$or = [{ fullName: re }, { driverTagNumber: re }];
    }

    const { from: todayStart } = this.resolvePeriod('today');

    const [totalActiveDrivers, activeNow, totalRidesToday, drivers, total] =
      await Promise.all([
        this.userModel.countDocuments({
          role: 'driver',
          driverApprovalStatus: 'APPROVED',
        }),
        this.userModel.countDocuments({
          role: 'driver',
          driverApprovalStatus: 'APPROVED',
          lastActiveAt: { $gte: activeSince },
        }),
        this.tripModel.countDocuments({
          status: 'COMPLETED',
          completedAt: { $gte: todayStart },
        }),
        this.userModel
          .find(filter)
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        this.userModel.countDocuments(filter),
      ]);

    const driverIds = drivers.map((d) => d._id as Types.ObjectId);
    const [ridesAgg, earningsAgg] = await Promise.all([
      this.tripModel.aggregate([
        { $match: { driverId: { $in: driverIds }, status: 'COMPLETED' } },
        { $group: { _id: '$driverId', count: { $sum: 1 } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { userId: { $in: driverIds }, type: 'TRIP_PAYMENT' } },
        { $group: { _id: '$userId', amount: { $sum: '$amount' } } },
      ]),
    ]);
    const ridesMap = new Map(ridesAgg.map((r) => [String(r._id), r.count]));
    const earningsMap = new Map(earningsAgg.map((r) => [String(r._id), r.amount]));

    const items = drivers.map((d) => ({
      id: d._id,
      fullName: d.fullName,
      driverTagNumber: d.driverTagNumber,
      vehicleType: d.vehicleType,
      totalRides: ridesMap.get(String(d._id)) || 0,
      totalEarnings: earningsMap.get(String(d._id)) || 0,
      rating: null, // not implemented yet
      status: d.lastActiveAt && d.lastActiveAt >= activeSince ? 'Active' : 'Inactive',
      lastActiveAt: d.lastActiveAt || null,
    }));

    return {
      stats: {
        totalActiveDrivers,
        activeNow,
        averageRating: null, // not implemented yet
        totalRidesToday,
      },
      items,
      total,
      page,
      limit,
    };
  }
}
