import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AnnouncementAudience = 'ALL' | 'STUDENT' | 'DRIVER';

export type AnnouncementDocument = Announcement & Document;

@Schema({ timestamps: true, collection: 'announcements' })
export class Announcement {
  @Prop({ required: true })
  message: string;

  @Prop({ type: String, enum: ['ALL', 'STUDENT', 'DRIVER'], default: 'ALL' })
  audience: AnnouncementAudience;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, ref: 'User' })
  sentBy: string;

  // How many notifications were actually fanned out at send time - a
  // point-in-time count, not a live recomputation.
  @Prop({ default: 0 })
  recipientCount: number;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
