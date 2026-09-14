import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Paralela A' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ description: 'Juez responsable del grupo' })
  @IsOptional()
  @IsString()
  judgeId?: string;
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}

export class DrawGroupsDto {
  @ApiProperty({ example: 4, description: 'Cantidad de grupos a formar' })
  @IsInt()
  @Min(1)
  groupCount: number;

  @ApiPropertyOptional({
    description:
      'Semilla del sorteo. Si se omite se genera una; queda guardada para poder reproducirlo.',
  })
  @IsOptional()
  @IsString()
  seed?: string;
}

export class AssignMemberDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  registrationId: string;

  @ApiPropertyOptional({ description: 'Grupo destino; null lo deja sin asignar' })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ description: 'Posición dentro del grupo' })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}
