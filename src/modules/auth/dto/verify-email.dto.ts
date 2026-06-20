import { IsEmail, IsNotEmpty, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @Length(4, 4)
  code: string;
}
