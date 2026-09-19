import { IsIn, IsOptional } from 'class-validator';

export class SummaryQueryDto {
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'year'])
  period?: 'today' | 'week' | 'month' | 'year';
}
