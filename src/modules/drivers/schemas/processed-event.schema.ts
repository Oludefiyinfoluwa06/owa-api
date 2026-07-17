import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProcessedEventDocument = ProcessedEvent & Document;

@Schema({ timestamps: true, collection: 'processed_events' })
export class ProcessedEvent {
  @Prop({ required: true, unique: true, index: true })
  eventId: string;

  @Prop()
  status?: string;

  @Prop()
  source?: string;
}

export const ProcessedEventSchema = SchemaFactory.createForClass(ProcessedEvent);
