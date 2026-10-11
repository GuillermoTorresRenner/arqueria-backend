import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DrawMethod, ShotPhase } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DrawDto {
  @ApiProperty({
    enum: DrawMethod,
    description:
      'ALGORITHM: sortea el sistema · MANUAL: lo que salió de la tómbola',
  })
  @IsEnum(DrawMethod)
  method: DrawMethod;

  @ApiPropertyOptional({
    description:
      'ALGORITHM: semilla para reproducir el sorteo; si falta, se genera',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  seed?: string;

  @ApiPropertyOptional({
    example: [
      [3, 7],
      [1, 12],
    ],
    description: 'MANUAL, primera ronda: pares por número de participante',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(256)
  @IsArray({ each: true })
  @ArrayMinSize(2, { each: true })
  @ArrayMaxSize(2, { each: true })
  pairs?: number[][];

  @ApiPropertyOptional({
    example: 5,
    description: 'MANUAL: número que quedó sin rival',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bye?: number | null;
}

export class UpdateRoundDto {
  @ApiPropertyOptional({
    example: 6,
    description: 'Puntaje: flechas por arquero',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  arrowsPerArcher?: number;

  @ApiPropertyOptional({ example: 3, description: 'Duelos: dianas para ganar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  targetsToWin?: number;
}

export class ShotInputDto {
  @ApiProperty({ description: 'MatchEntry del arquero' })
  @IsString()
  entryId: string;

  @ApiProperty({ enum: ShotPhase })
  @IsEnum(ShotPhase)
  phase: ShotPhase;

  @ApiProperty({ example: 1, description: 'N.º de flecha o disparo, desde 1' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  sequence: number;

  @ApiPropertyOptional({
    example: '2',
    description: 'Puntaje: zona de la diana',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zoneLabel?: string;

  @ApiPropertyOptional({ description: 'Duelos: abatió su diana' })
  @IsOptional()
  @IsBoolean()
  hit?: boolean;

  @ApiPropertyOptional({
    description:
      'Duelos: se lleva el punto (abatió primero o, si fue simultáneo, quedó más al centro)',
  })
  @IsOptional()
  @IsBoolean()
  point?: boolean;
}

export class RecordShotsDto {
  @ApiProperty({ type: [ShotInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShotInputDto)
  shots: ShotInputDto[];
}

export class DeleteShotDto {
  @ApiProperty({ enum: ShotPhase })
  @IsEnum(ShotPhase)
  phase: ShotPhase;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence: number;

  @ApiPropertyOptional({ description: 'Puntaje: de qué arquero es la flecha' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || undefined)
  entryId?: string;
}
