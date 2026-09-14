import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScoreStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ArrowDto {
  @ApiProperty({ example: 'X', description: 'Etiqueta de la zona' })
  @IsString()
  @IsNotEmpty()
  label: string;
}

export class CreateScoreDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  roundId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @ApiProperty({ example: 1, description: 'Número de serie dentro de la ronda' })
  @IsInt()
  @Min(1)
  endNumber: number;

  @ApiProperty({
    type: [ArrowDto],
    description:
      'Flechas de la serie. El backend resuelve el puntaje desde las zonas del formato.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ArrowDto)
  arrows: ArrowDto[];

  @ApiPropertyOptional({ enum: ScoreStatus })
  @IsOptional()
  @IsEnum(ScoreStatus)
  status?: ScoreStatus;
}

export class UpdateScoreDto {
  @ApiPropertyOptional({ type: [ArrowDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ArrowDto)
  arrows?: ArrowDto[];

  @ApiPropertyOptional({ enum: ScoreStatus })
  @IsOptional()
  @IsEnum(ScoreStatus)
  status?: ScoreStatus;
}
