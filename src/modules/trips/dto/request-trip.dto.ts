import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RequestTripDto {
  @IsString()
  @IsNotEmpty()
  driverTagNumber: string;

  @IsNumber()
  @IsPositive()
  fare: number;

  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
