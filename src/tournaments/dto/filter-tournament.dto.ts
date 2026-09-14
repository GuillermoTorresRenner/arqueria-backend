import { ApiPropertyOptional } from '@nestjs/swagger';
import { TournamentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class FilterTournamentDto {
  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional({ description: 'Busca por nombre, sede o slug' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Solo torneos publicados' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Desde esta fecha (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Hasta esta fecha (inclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtra por formato de puntuación' })
  @IsOptional()
  @IsString()
  scoringFormatId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    default: 'startsAt',
    enum: ['startsAt', 'name', 'createdAt', 'status'],
  })
  @IsOptional()
  @IsIn(['startsAt', 'name', 'createdAt', 'status'])
  sortBy?: string = 'startsAt';

  @ApiPropertyOptional({ default: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
