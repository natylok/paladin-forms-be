import {
  IsEmail,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class GoogleAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string
}

export class AuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
