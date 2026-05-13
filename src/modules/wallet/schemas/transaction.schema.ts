import { Schema, Document } from 'mongoose';

export interface TransactionDocument extends Document {
  type: 'TOPUP' | 'DEBIT' | 'ADJUSTMENT';
  userId: any;
  walletId: any;
  amount: number;
  paymentId?: any;
  providerReference?: string;
  metadata?: any;
}

export const TransactionSchema = new Schema(
  {
    type: { type: String, enum: ['TOPUP', 'DEBIT', 'ADJUSTMENT'], required: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    walletId: { type: Schema.Types.ObjectId, required: true, ref: 'Wallet', index: true },
    amount: { type: Number, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    providerReference: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
