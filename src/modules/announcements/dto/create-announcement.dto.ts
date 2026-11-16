import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAnnouncementDto {
  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsIn(['ALL', 'STUDENT', 'DRIVER'])
  audience?: 'ALL' | 'STUDENT' | 'DRIVER';
}
