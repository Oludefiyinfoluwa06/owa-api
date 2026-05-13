import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentDocument } from '../wallet/schemas/payment.schema';

interface CreatePaymentOpts {
	provider: string;
	providerReference: string;
	userId: string;
	amount: number;
	status?: string;
	metadata?: any;
}

@Injectable()
export class PaymentService {
	private readonly logger = new Logger(PaymentService.name);
	constructor(@InjectModel('Payment') private readonly paymentModel: Model<PaymentDocument>) {}

	async createPending(opts: CreatePaymentOpts) {
		return this.paymentModel.create({ ...opts, status: opts.status || 'PENDING' });
	}

	async updateMetadata(providerReference: string, metadata: any) {
		return this.paymentModel.updateOne({ providerReference }, { $set: { metadata } });
	}

	async findByProviderReference(providerReference: string) {
		return this.paymentModel.findOne({ providerReference }).lean();
	}

	async findByUserId(userId: string) {
		return this.paymentModel.find({ userId }).sort({ createdAt: -1 }).lean();
	}

	async markSuccess(providerReference: string, amount: number, provider = 'MONNIFY', userId?: string) {
		const existing = await this.paymentModel.findOne({ providerReference }).lean();
		if (existing && existing.status === 'SUCCESS') return existing;
		if (existing) {
			return this.paymentModel.findOneAndUpdate({ providerReference }, { $set: { status: 'SUCCESS', amount } }, { new: true }).lean();
		}
		return this.paymentModel.create({ provider, providerReference, userId, amount, status: 'SUCCESS' });
	}
}
