import { IsOptional, IsString } from 'class-validator';

export class CancelTripDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
