import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TournamentStatus } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateTournamentDto {
  @ApiProperty({ example: 'copa-primavera-2026' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug solo admite minúsculas, números y guiones',
  })
  slug: string;

  @ApiProperty({ example: 'Copa Primavera 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Campo de tiro Galadhrym' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: '2026-10-12T09:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ description: 'Cierre de inscripciones' })
  @IsOptional()
  @IsDateString()
  registrationEnd?: string;

  @ApiProperty({ description: 'Formato de puntuación que rige el torneo' })
  @IsString()
  @IsNotEmpty()
  scoringFormatId: string;

  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional({
    default: false,
    description: 'Publica el marcador en vivo',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;
}

export class UpdateTournamentDto extends PartialType(CreateTournamentDto) {}

export class CreateRoundDto {
  @ApiProperty({ example: 'Clasificatoria' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ example: 18, description: 'Distancia en metros' })
  @IsOptional()
  @IsInt()
  @Min(0)
  distance?: number;
}

export class UpdateRoundDto extends PartialType(CreateRoundDto) {}

export class UpdateTournamentStatusDto {
  @ApiProperty({ enum: TournamentStatus })
  @IsEnum(TournamentStatus)
  status: TournamentStatus;
}

export class DuplicateTournamentDto {
  @ApiProperty({ example: 'copa-primavera-2027' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug solo admite minúsculas, números y guiones',
  })
  slug: string;

  @ApiProperty({ example: 'Copa Primavera 2027' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '2027-10-12T13:00:00.000Z' })
  @IsDateString()
  startsAt: string;
}
