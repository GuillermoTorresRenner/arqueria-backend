import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

/// Contraseña elegida desde un enlace del correo (activación o recuperación).
export class SetPasswordDto {
  @ApiProperty({ description: 'Token del enlace recibido por correo' })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'Arquero2026',
    description: 'Mínimo 6 caracteres, con minúscula, mayúscula y número.',
  })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
  })
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@correo.cl' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;
}
