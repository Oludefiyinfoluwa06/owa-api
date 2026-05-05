import { IsNotEmpty, Length } from 'class-validator';

export class VerifyAccountDto {
  @IsNotEmpty()
  phone: string;

  @IsNotEmpty()
  @Length(4, 4)
  code: string;
}
