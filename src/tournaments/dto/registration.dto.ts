import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegistrationStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRegistrationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @ApiPropertyOptional({ enum: RegistrationStatus })
  @IsOptional()
  @IsEnum(RegistrationStatus)
  status?: RegistrationStatus;
}

export class UpdateRegistrationStatusDto {
  @ApiProperty({ enum: RegistrationStatus })
  @IsEnum(RegistrationStatus)
  status: RegistrationStatus;
}
