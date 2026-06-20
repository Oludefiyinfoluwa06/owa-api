import { IsEmail, IsOptional, IsPhoneNumber } from 'class-validator';

export class ResendVerificationDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsPhoneNumber(null)
  phone?: string;
}
