import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreatePlaceDto {
  @ApiProperty({ example: 'Parque Mahuida' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(80)
  @Transform(trim)
  name: string;

  @ApiPropertyOptional({
    example: 'Av. Alcalde Fernando Castillo Velasco 9300, La Reina',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  address?: string;

  @ApiPropertyOptional({
    example: -33.4489,
    description: 'Para el pronóstico del tiempo',
  })
  @IsOptional()
  @IsLatitude({ message: 'Latitud inválida' })
  latitude?: number | null;

  @ApiPropertyOptional({ example: -70.6693 })
  @IsOptional()
  @IsLongitude({ message: 'Longitud inválida' })
  longitude?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlaceDto extends PartialType(CreatePlaceDto) {}

export class GeocodeQueryDto {
  @ApiProperty({ example: 'La Reina' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(trim)
  q: string;
}
