import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TransactionDocument,
  TransactionType,
} from '../wallet/schemas/transaction.schema';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  constructor(
    @InjectModel('Transaction')
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async createTransaction(
    payload: Partial<TransactionDocument> & {
      type: TransactionType;
      userId: string;
      walletId: string;
      amount: number;
    },
  ) {
    return this.transactionModel.create(payload as any);
  }

  async updateStatus(
    transactionId: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED',
    extra?: Partial<TransactionDocument>,
  ) {
    return this.transactionModel.findByIdAndUpdate(
      transactionId,
      { $set: { status, ...extra } },
      { new: true },
    );
  }
  async findByWalletId(walletId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const docs = await this.transactionModel
      .find({ walletId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await this.transactionModel.countDocuments({ walletId });
    return { items: docs, total };
  }
  async findByUserId(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const docs = await this.transactionModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const total = await this.transactionModel.countDocuments({ userId });
    return { items: docs, total };
  }
}
