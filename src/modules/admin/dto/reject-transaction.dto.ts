import { IsOptional, IsString } from 'class-validator';

export class RejectTransactionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
