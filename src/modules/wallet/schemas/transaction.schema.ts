import { Schema, Document } from 'mongoose';

export interface TransactionDocument extends Document {
  type: 'TOPUP' | 'DEBIT' | 'ADJUSTMENT' | 'TRANSFER';
  userId: any;
  walletId: any;
  amount: number;
  paymentId?: any;
  providerReference?: string;
  metadata?: any;
  toUserId?: any;
  toWalletId?: any;
}

export const TransactionSchema = new Schema(
  {
    type: { type: String, enum: ['TOPUP', 'DEBIT', 'ADJUSTMENT', 'TRANSFER'], required: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    walletId: { type: Schema.Types.ObjectId, required: true, ref: 'Wallet', index: true },
    amount: { type: Number, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    providerReference: { type: String },
    metadata: { type: Schema.Types.Mixed },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    toWalletId: { type: Schema.Types.ObjectId, ref: 'Wallet' },
  },
  { timestamps: true },
);
