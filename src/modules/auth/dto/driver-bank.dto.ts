import { IsNotEmpty, IsOptional } from 'class-validator';

export class DriverBankDto {
  @IsNotEmpty()
  bankName: string;

  @IsNotEmpty()
  accountNumber: string;

  @IsOptional()
  bankCode?: string;
}
