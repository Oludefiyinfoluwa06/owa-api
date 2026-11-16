import { IsOptional, IsString } from 'class-validator';

export class ResolveReportDto {
  @IsOptional()
  @IsString()
  adminNote?: string;
}
