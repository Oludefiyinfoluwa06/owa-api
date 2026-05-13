import { Schema, Document } from 'mongoose';

export type VehicleType = 'Bus' | 'Bike' | 'Keke';

export interface UserDocument extends Document {
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: 'student' | 'driver';
  verified: boolean;
  verificationCode?: string;
  recoveryKey?: string;
  profilePicture?: string;
  driverTagNumber?: string;
  vehicleType?: VehicleType;
  bankName?: string;
  accountNumber?: string;
  bankCode?: string;
}

export const UserSchema = new Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['student', 'driver'], default: 'student' },
    verified: { type: Boolean, default: false },
    verificationCode: { type: String },
    recoveryKey: { type: String },
    profilePicture: { type: String },
    driverTagNumber: { type: String },
    vehicleType: { type: String, enum: ['Bus', 'Bike', 'Keke'] },
    bankName: { type: String },
    accountNumber: { type: String },
    bankCode: { type: String },
  },
  { timestamps: true },
);
