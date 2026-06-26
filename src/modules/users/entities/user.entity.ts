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
  vehicleType?: VehicleType;
  bankName?: string;
  accountNumber?: string;
}
