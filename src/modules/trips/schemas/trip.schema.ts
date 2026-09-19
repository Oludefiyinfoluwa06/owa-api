import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type TripStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'CANCELLED';

export type TripDocument = Trip & Document;

@Schema({ timestamps: true, collection: 'trips' })
export class Trip {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'User', index: true })
  passengerId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'User', index: true })
  driverId: string;

  @Prop({ required: true })
  fare: number;

  @Prop({
    type: String,
    enum: ['REQUESTED', 'ACCEPTED', 'ONGOING', 'COMPLETED', 'CANCELLED'],
    default: 'REQUESTED',
    index: true,
  })
  status: TripStatus;

  @Prop()
  pickupLocation?: string;

  @Prop()
  dropoffLocation?: string;

  @Prop()
  notes?: string;

  @Prop({ default: () => new Date() })
  requestedAt: Date;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop({ index: true })
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  cancelledBy?: string;

  @Prop()
  cancellationReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Transaction' })
  transactionId?: string;
}

export const TripSchema = SchemaFactory.createForClass(Trip);
