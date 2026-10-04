import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Contraseña actual (obligatoria, también para un ADMIN)',
  })
  @IsString()
  @MinLength(1, { message: 'Debes indicar tu contraseña actual' })
  currentPassword: string;

  @ApiProperty({ example: 'NuevaClave2026!' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
  })
  newPassword: string;
}
