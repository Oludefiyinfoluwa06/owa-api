import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AuthorizeCardOtpDto {
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @IsString()
  @IsNotEmpty()
  tokenId: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}
