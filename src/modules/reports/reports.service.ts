import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { ActivityLogService } from '../activity-log/activity-log.service';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async create(
    reporterId: string,
    dto: {
      type: 'DISPUTE' | 'COMPLAINT';
      subject: string;
      description?: string;
      tripId?: string;
      transactionId?: string;
    },
  ) {
    const report = await this.reportModel.create({ reporterId, ...dto });

    await this.activityLogService
      .log(reporterId, 'REPORT_SUBMITTED', `Submitted a ${dto.type.toLowerCase()}: ${dto.subject}`, {
        reportId: String(report._id),
      })
      .catch(() => undefined);

    return report;
  }

  async getStats() {
    const [total, unresolved, resolvedThisWeek] = await Promise.all([
      this.reportModel.countDocuments({ hidden: { $ne: true } }),
      this.reportModel.countDocuments({ status: 'UNRESOLVED', hidden: { $ne: true } }),
      this.reportModel.countDocuments({
        status: 'RESOLVED',
        resolvedAt: { $gte: new Date(Date.now() - WEEK_MS) },
        hidden: { $ne: true },
      }),
    ]);
    return { total, unresolved, resolvedThisWeek };
  }

  async listForAdmin(query: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const match: any = { hidden: { $ne: true } };
    if (query.status) match.status = query.status.toUpperCase();

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'users',
          localField: 'reporterId',
          foreignField: '_id',
          as: 'reporter',
        },
      },
      { $unwind: { path: '$reporter', preserveNullAndEmptyArrays: true } },
    ];
    if (query.search) {
      pipeline.push({
        $match: {
          $or: [
            { subject: { $regex: query.search, $options: 'i' } },
            { 'reporter.fullName': { $regex: query.search, $options: 'i' } },
          ],
        },
      });
    }
    pipeline.push({ $sort: { createdAt: -1 } });

    const [items, countResult] = await Promise.all([
      this.reportModel.aggregate([
        ...pipeline,
        { $skip: (page - 1) * limit },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            id: '$_id',
            reporterName: '$reporter.fullName',
            type: 1,
            subject: 1,
            status: 1,
            createdAt: 1,
          },
        },
      ]),
      this.reportModel.aggregate([...pipeline, { $count: 'total' }]),
    ]);

    return { items, total: countResult[0]?.total || 0, page, limit };
  }

  async getDetailForAdmin(id: string) {
    const [report] = await this.reportModel.aggregate([
      { $match: { _id: new Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'users',
          localField: 'reporterId',
          foreignField: '_id',
          as: 'reporter',
        },
      },
      { $unwind: { path: '$reporter', preserveNullAndEmptyArrays: true } },
    ]);
    if (!report) throw new NotFoundException('Report not found');

    return {
      id: report._id,
      type: report.type,
      subject: report.subject,
      description: report.description,
      status: report.status,
      tripId: report.tripId,
      transactionId: report.transactionId,
      adminNote: report.adminNote,
      resolvedAt: report.resolvedAt,
      createdAt: report.createdAt,
      reporter: report.reporter
        ? {
            id: report.reporter._id,
            fullName: report.reporter.fullName,
            role: report.reporter.role,
            phone: report.reporter.phone,
          }
        : null,
    };
  }

  async resolve(id: string, adminId: string, adminNote?: string) {
    const report = await this.reportModel.findById(id);
    if (!report) throw new NotFoundException('Report not found');

    report.status = 'RESOLVED';
    report.resolvedAt = new Date();
    report.resolvedBy = adminId;
    if (adminNote) report.adminNote = adminNote;
    await report.save();

    await this.activityLogService
      .log(adminId, 'REPORT_RESOLVED', `Resolved report ${id}`, { reportId: id, adminNote })
      .catch(() => undefined);

    return { ok: true, status: 'RESOLVED' };
  }

  async hide(id: string) {
    const report = await this.reportModel.findByIdAndUpdate(
      id,
      { $set: { hidden: true } },
      { new: true },
    );
    if (!report) throw new NotFoundException('Report not found');
    return { ok: true };
  }
}
