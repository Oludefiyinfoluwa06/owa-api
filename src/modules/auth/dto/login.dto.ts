import { IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  phone: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
