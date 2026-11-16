import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ReportType = 'DISPUTE' | 'COMPLAINT';
export type ReportStatus = 'UNRESOLVED' | 'RESOLVED';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true, collection: 'reports' })
export class Report {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'User', index: true })
  reporterId: string;

  @Prop({ type: String, enum: ['DISPUTE', 'COMPLAINT'], required: true })
  type: ReportType;

  @Prop({ required: true })
  subject: string;

  @Prop()
  description?: string;

  // Optional context - a dispute/complaint usually concerns a specific ride
  // or payment, but neither is required since not every report has one.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Trip' })
  tripId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Transaction' })
  transactionId?: string;

  @Prop({ type: String, enum: ['UNRESOLVED', 'RESOLVED'], default: 'UNRESOLVED', index: true })
  status: ReportStatus;

  @Prop()
  adminNote?: string;

  @Prop()
  resolvedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  resolvedBy?: string;

  // Soft-delete for the admin "Delete" action, consistent with transactions.
  @Prop({ default: false, index: true })
  hidden: boolean;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
