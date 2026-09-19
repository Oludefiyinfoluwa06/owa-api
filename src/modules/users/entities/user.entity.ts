export type VehicleType = 'Bus' | 'Bike' | 'Keke';

export interface User {
  id: string;
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
  qrUrl?: string;
  vehicleType?: VehicleType;
  bankName?: string;
  accountNumber?: string;
  idCardVerified?: boolean;
  driversLicenseVerified?: boolean;
  verificationSessionId?: string;
  verificationStatus?: string;
  identityVerificationStatus?: string;
  identityVerificationMessage?: string;
  identityVerificationCheckedAt?: Date;
}
