import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class SendPasswordResetDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class SendWelcomeEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  userName: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}

export class SendTestEmailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  message?: string;
}
