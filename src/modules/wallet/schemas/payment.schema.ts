import { Schema, Document } from 'mongoose';

export interface PaymentDocument extends Document {
  provider: string;
  providerReference: string;
  userId: any;
  amount: number;
  status: string;
  metadata?: any;
}

export const PaymentSchema = new Schema(
  {
    provider: { type: String, required: true },
    providerReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      index: true,
    },
    amount: { type: Number, required: true },
    status: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
