import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description:
      'Contraseña actual. Obligatoria cuando el usuario cambia la suya; un ADMIN puede omitirla.',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ example: 'NuevaClave2026!' })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'La contraseña debe contener al menos una letra minúscula, una mayúscula y un número',
  })
  newPassword: string;
}
