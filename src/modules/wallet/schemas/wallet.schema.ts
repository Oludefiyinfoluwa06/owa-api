import { Schema, Document } from 'mongoose';

export interface WalletDocument extends Document {
  userId: any;
  balance: number;
  pinHash?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  bankCode?: string;
  providerAccountReference?: string;
}

export const WalletSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
      unique: true,
    },
    // hashed 4-digit PIN for wallet operations
    pinHash: { type: String },
    balance: { type: Number, default: 0 },
    accountNumber: { type: String },
    accountName: { type: String },
    bankName: { type: String },
    bankCode: { type: String },
    providerAccountReference: { type: String, index: true },
  },
  { timestamps: true },
);
