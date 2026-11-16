import { Schema, Document } from 'mongoose';

export type TransactionType =
  | 'TOPUP'
  | 'DEBIT'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'WITHDRAWAL'
  | 'TRIP_PAYMENT';

export interface TransactionDocument extends Document {
  type: TransactionType;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REJECTED';
  userId: any;
  walletId: any;
  amount: number;
  paymentId?: any;
  providerReference?: string;
  metadata?: any;
  toUserId?: any;
  toWalletId?: any;
  tripId?: any;
  hidden?: boolean;
}

export const TransactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['TOPUP', 'DEBIT', 'ADJUSTMENT', 'TRANSFER', 'WITHDRAWAL', 'TRIP_PAYMENT'],
      required: true,
    },
    status: {
      type: String,
      // REJECTED is distinct from FAILED: FAILED means a disbursement was
      // attempted and the provider declined it; REJECTED means an admin
      // declined a pending withdrawal before it was ever sent.
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REJECTED'],
      default: 'SUCCESS',
    },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    walletId: { type: Schema.Types.ObjectId, required: true, ref: 'Wallet', index: true },
    amount: { type: Number, required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    providerReference: { type: String },
    metadata: { type: Schema.Types.Mixed },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    toWalletId: { type: Schema.Types.ObjectId, ref: 'Wallet' },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', index: true },
    // Soft-delete for the admin "Delete" action - keeps the record and audit
    // trail intact while hiding it from admin-facing lists.
    hidden: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
