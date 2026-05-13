import { IsNotEmpty, IsOptional, IsIn, IsString } from 'class-validator';

export class DriverDetailsDto {
  @IsOptional()
  @IsString()
  profilePicture?: string;

  @IsNotEmpty()
  @IsString()
  driverTagNumber: string;

  @IsIn(['Bus', 'Bike', 'Keke'])
  vehicleType: 'Bus' | 'Bike' | 'Keke';
}
