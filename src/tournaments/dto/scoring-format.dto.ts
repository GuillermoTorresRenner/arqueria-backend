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

/// Una zona de la diana. Las modalidades son datos, no código.
export class ScoringZoneDto {
  @ApiProperty({ example: '2', description: 'Etiqueta que ve el juez' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: 2, description: 'Puntos que otorga' })
  @IsInt()
  @Min(0)
  value: number;
}

export class CreateScoringFormatDto {
  @ApiProperty({ example: 'Diana turca 0-1-2' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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

export class UpdateScoringFormatDto extends PartialType(
  CreateScoringFormatDto,
) {}
