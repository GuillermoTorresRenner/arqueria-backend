import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BlockType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({ example: 'clx123abc' })
  @IsString()
  @IsNotEmpty()
  sectionId: string;

  @ApiProperty({ enum: BlockType, example: BlockType.HERO })
  @IsEnum(BlockType)
  type: BlockType;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Contenido del bloque; su forma depende de `type`.',
    example: { title: 'Club Galadhrym', subtitle: 'Arquería tradicional' },
  })
  @IsObject()
  data: Record<string, unknown>;
}

export class UpdateBlockDto extends PartialType(CreateBlockDto) {}

export class ReorderBlockDto {
  @ApiProperty({ example: 'clx123abc' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  order: number;
}
