import {
  IsEmail,
  IsNotEmpty,
  IsPhoneNumber,
  MinLength,
  IsString,
  Length,
} from 'class-validator';

export class CreateStudentDto {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  fullName: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsPhoneNumber(null)
  phone: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;
}
