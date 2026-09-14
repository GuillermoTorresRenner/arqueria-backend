import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Roles } from '../../auth/roles.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'arquero@galadhrym.cl' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({
    example: 'Arquero2026!',
    description: 'Mínimo 6 caracteres, con minúscula, mayúscula y número.',
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
  })
  password: string;

  @ApiProperty({ example: 'Guillermo' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'Torres' })
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  surname: string;

  @ApiPropertyOptional({
    example: '+56912345678',
    description: 'Formato internacional o nacional; 8 a 15 dígitos.',
  })
  @IsOptional()
  @IsString()
  // Acepta espacios, guiones y paréntesis al escribir; se validan solo los dígitos.
  @Matches(/^\+?[\d\s()-]{8,20}$/, {
    message: 'El teléfono no tiene un formato válido',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  phone?: string;

  @ApiProperty({ enum: Roles, example: 'MEMBER' })
  @IsEnum(Roles, { message: 'El rol debe ser ADMIN, JUDGE o MEMBER' })
  role: Roles;
}
