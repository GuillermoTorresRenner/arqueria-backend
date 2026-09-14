import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/// Una zona de puntuación del blanco. Las modalidades del club están por definir,
/// así que las zonas son datos, no código.
export class ScoringZoneDto {
  @ApiProperty({ example: 'X', description: 'Etiqueta que ve el juez' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: 10, description: 'Puntos que otorga' })
  @IsInt()
  @Min(0)
  value: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Zona interior; se cuenta aparte para desempates',
  })
  @IsOptional()
  @IsBoolean()
  isInner?: boolean;
}

export class CreateScoringFormatDto {
  @ApiProperty({ example: 'WA 18m indoor' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 3, description: 'Flechas por serie' })
  @IsInt()
  @Min(1)
  arrowsPerEnd: number;

  @ApiProperty({ example: 20, description: 'Series por ronda' })
  @IsInt()
  @Min(1)
  endsPerRound: number;

  @ApiProperty({ example: 10, description: 'Puntaje máximo de una flecha' })
  @IsInt()
  @Min(1)
  maxPerArrow: number;

  @ApiProperty({ type: [ScoringZoneDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScoringZoneDto)
  zones: ScoringZoneDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateScoringFormatDto extends PartialType(CreateScoringFormatDto) {}
