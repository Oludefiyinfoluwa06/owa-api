import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TransactionDocument } from '../wallet/schemas/transaction.schema';

@Injectable()
export class TransactionService {
	private readonly logger = new Logger(TransactionService.name);
	constructor(@InjectModel('Transaction') private readonly transactionModel: Model<TransactionDocument>) {}

	async createTransaction(payload: Partial<TransactionDocument> & { type: 'TOPUP' | 'DEBIT' | 'ADJUSTMENT'; userId: string; walletId: string; amount: number }) {
		return this.transactionModel.create(payload as any);
	}
	async findByWalletId(walletId: string) {
		return this.transactionModel.find({ walletId }).sort({ createdAt: -1 }).lean();
	}
}
