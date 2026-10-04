import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/**
 * Actualización de usuario. Nunca incluye la contraseña: el usuario cambia la
 * suya en PATCH /users/me/password o la recupera desde el correo.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({ description: 'Activa o desactiva la cuenta' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
