import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteRegistrationDto {
  @ApiProperty({ description: 'Token de registro recibido por email' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'Nueva contraseña del usuario',
    example: 'NuevaContraseña123',
    minLength: 6,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
  })
  password: string;

  @ApiProperty({ description: 'Nombre del cliente' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'Email de contacto del cliente' })
  @IsEmail()
  customerEmail: string;

  @ApiProperty({ description: 'Teléfono de contacto', required: false })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ description: 'ID del país' })
  @IsString()
  countryId: string;

  @ApiProperty({ description: 'Tipo de identificador fiscal', required: false })
  @IsOptional()
  @IsString()
  taxIdType?: string;

  @ApiProperty({ description: 'Identificador fiscal', required: false })
  @IsOptional()
  @IsString()
  taxIdentifier?: string;

  @ApiProperty({ description: 'Dirección', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Nombre de la empresa' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ description: 'Nombre comercial de la empresa' })
  @IsString()
  @IsNotEmpty()
  tradingName: string;

  @ApiProperty({ description: 'Identificador fiscal de la empresa' })
  @IsString()
  @IsNotEmpty()
  companyTaxIdentifier: string;

  @ApiProperty({ description: 'ID del sector', required: false })
  @IsOptional()
  @IsString()
  sectorId?: string;

  @ApiProperty({ description: 'ID de la industria', required: false })
  @IsOptional()
  @IsString()
  industryId?: string;

  @ApiProperty({ description: 'ID de la actividad', required: false })
  @IsOptional()
  @IsString()
  activityId?: string;

  @ApiProperty({ description: 'Nombre del usuario' })
  @IsString()
  @IsNotEmpty()
  userName: string;

  @ApiProperty({ description: 'Apellido del usuario' })
  @IsString()
  @IsNotEmpty()
  userSurname: string;

  @ApiProperty({
    description: 'Email del usuario (debe coincidir con el del token)',
  })
  @IsEmail()
  userEmail: string;

  @ApiProperty({
    description: 'Rol del usuario',
    enum: ['ADMIN', 'EXPERT', 'DATA_ENTRY', 'AUDITOR'],
  })
  @IsEnum(['ADMIN', 'EXPERT', 'DATA_ENTRY', 'AUDITOR'])
  userRole: 'ADMIN' | 'EXPERT' | 'DATA_ENTRY' | 'AUDITOR';
}
