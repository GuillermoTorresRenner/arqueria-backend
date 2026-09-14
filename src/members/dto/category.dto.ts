import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CategoryKind } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ enum: CategoryKind, example: CategoryKind.DIVISION })
  @IsEnum(CategoryKind)
  kind: CategoryKind;

  @ApiProperty({ example: 'RECURVO' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Arco recurvo' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  minAge?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  maxAge?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
