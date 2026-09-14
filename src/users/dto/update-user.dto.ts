import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * Actualización de usuario. La contraseña queda fuera a propósito: se cambia
 * por su propio endpoint (`PATCH /users/:id/password`), que exige la actual
 * cuando el usuario se edita a sí mismo.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional({ description: 'Activa o desactiva la cuenta' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
