export type VehicleType = 'Bus' | 'Bike' | 'Keke';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: 'student' | 'driver';
  verified: boolean;
  verificationCode?: string; // 4-digit code
  recoveryKey?: string;

  // Driver-specific
  profilePicture?: string;
  driverTagNumber?: string;
  vehicleType?: VehicleType;

  // Banking
  bankName?: string;
  accountNumber?: string;
}
