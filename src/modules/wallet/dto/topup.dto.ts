import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

class CardDetailsDto {
  @IsString()
  number: string;

  @IsString()
  expiryMonth: string;

  @IsString()
  expiryYear: string;

  @IsOptional()
  @IsString()
  cvv?: string;
}

class TopupOptsDto {
  @IsOptional()
  @IsString()
  bankCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardDetailsDto)
  card?: CardDetailsDto;
}

export class TopupDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsIn(['bank', 'ussd', 'card'])
  method: 'bank' | 'ussd' | 'card';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TopupOptsDto)
  opts?: TopupOptsDto;
}
