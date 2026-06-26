import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DriverDetailsDto {
  @IsNotEmpty()
  @IsString()
  driverTagNumber: string;

  @IsOptional()
  @IsString()
  vehicleType: string;
}
