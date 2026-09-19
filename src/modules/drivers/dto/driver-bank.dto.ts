import { IsNotEmpty } from 'class-validator';

export class DriverBankDto {
  @IsNotEmpty()
  bankName: string;

  @IsNotEmpty()
  accountNumber: string;

  // Required: withdrawal can't resolve/disburse without it, so bank details
  // saved without a bankCode would only fail confusingly later, at payout time.
  @IsNotEmpty()
  bankCode: string;
}
