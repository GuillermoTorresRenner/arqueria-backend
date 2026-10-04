import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateActivityDto {
  @ApiProperty({ example: 'Jornada de tiro' })
  @IsString()
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(120)
  @Transform(trim)
  title: string;

  @ApiProperty({ example: '2026-10-11T13:00:00.000Z' })
  @IsDateString({}, { message: 'Fecha de inicio inválida' })
  startsAt: string;

  @ApiProperty({ example: '2026-10-11T16:00:00.000Z' })
  @IsDateString({}, { message: 'Fecha de término inválida' })
  endsAt: string;

  @ApiPropertyOptional({ description: 'Lugar guardado (ver /places)' })
  @IsOptional()
  @IsString()
  placeId?: string | null;

  @ApiPropertyOptional({
    description: 'HTML del editor: qué traer, cómo llegar…',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  recommendations?: string | null;

  @ApiPropertyOptional({
    default: false,
    description:
      'Avisar a los socios activos por correo. Si aún no se avisó, guardarlo en true envía el aviso.',
  })
  @IsOptional()
  @IsBoolean()
  notifyMembers?: boolean;
}

export class UpdateActivityDto extends PartialType(CreateActivityDto) {}

export class ActivityRangeDto {
  @ApiPropertyOptional({ example: '2026-09-28T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-09T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpcomingQueryDto {
  @ApiPropertyOptional({ default: 6, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class WeatherPreviewDto {
  @ApiProperty()
  @IsString()
  placeId: string;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  endsAt: string;
}
