import { IsOptional, IsString } from 'class-validator';

export class RejectDriverDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
