import { IsString, MinLength, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEqualTo } from '../../logger/decorators/is-equal-to.decorator';

export class ChangePasswordDto {
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

  @ApiProperty({
    description: 'Confirmación de la nueva contraseña',
    example: 'NuevaContraseña123',
  })
  @IsString()
  @IsNotEmpty({ message: 'La confirmación de contraseña es requerida' })
  @IsEqualTo('password', {
    message: 'La confirmación de contraseña no coincide con la contraseña',
  })
  confirmPassword: string;
}
