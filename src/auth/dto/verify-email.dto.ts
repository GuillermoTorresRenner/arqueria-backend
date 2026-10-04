import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Token del enlace del correo de bienvenida' })
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
