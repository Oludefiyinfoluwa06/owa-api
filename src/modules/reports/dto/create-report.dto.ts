import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateReportDto {
  @IsIn(['DISPUTE', 'COMPLAINT'])
  type: 'DISPUTE' | 'COMPLAINT';

  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  transactionId?: string;
}
