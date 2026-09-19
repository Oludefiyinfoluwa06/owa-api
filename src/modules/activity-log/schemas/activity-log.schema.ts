import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ActivityAction =
  | 'AUTH_REGISTER'
  | 'AUTH_LOGIN'
  | 'AUTH_PASSWORD_RESET'
  | 'WALLET_TOPUP'
  | 'WALLET_DEBIT'
  | 'WALLET_TRANSFER'
  | 'WALLET_WITHDRAWAL'
  | 'TRIP_REQUESTED'
  | 'TRIP_COMPLETED'
  | 'TRIP_CANCELLED'
  | 'DRIVER_ONBOARDING_SUBMITTED'
  | 'IDENTITY_VERIFICATION_SUBMITTED'
  | 'IDENTITY_VERIFICATION_UPDATED';

export type ActivityLogDocument = ActivityLog & Document;

@Schema({ timestamps: true, collection: 'activity_logs' })
export class ActivityLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'User', index: true })
  userId: string;

  @Prop({ required: true })
  action: ActivityAction;

  @Prop({ required: true })
  description: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: any;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
