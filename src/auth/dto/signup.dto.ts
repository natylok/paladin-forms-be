import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class SignupDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
} 