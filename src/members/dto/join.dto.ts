import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArcheryExperience } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// Formulario público «Súmate al club». Sin contraseña: se crea al validar el
/// correo, desde el enlace del email de bienvenida.
export class JoinClubDto {
  @ApiProperty({ example: 'Ana' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60)
  @Transform(trim)
  name: string;

  @ApiProperty({ example: 'Arquera' })
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60)
  @Transform(trim)
  surname: string;

  @ApiProperty({ example: '1995-04-21', description: 'AAAA-MM-DD' })
  @IsDateString(
    { strict: true },
    { message: 'La fecha de nacimiento no es válida' },
  )
  birthDate: string;

  @ApiProperty({ example: 'ana@correo.cl' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({ enum: ArcheryExperience })
  @IsEnum(ArcheryExperience, { message: 'Indica tu experiencia con el arco' })
  experience: ArcheryExperience;

  @ApiProperty({
    description: 'Debe ser true: aceptar recibir comunicaciones por email',
  })
  @Equals(true, {
    message: 'Debes aceptar recibir comunicaciones del club por email',
  })
  acceptCommunications: boolean;

  /// Campo trampa: invisible para personas, los bots lo rellenan.
  @ApiPropertyOptional({ description: 'Debe ir vacío (anti-spam)' })
  @IsOptional()
  @IsString()
  website?: string;
}
