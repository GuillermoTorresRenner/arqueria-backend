import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MemberStatus, ArcheryExperience } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({ description: 'Usuario existente al que se vincula el socio' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ example: '12.345.678-9' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ example: '1990-05-21' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: '+56912345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({ description: 'Fin de vigencia de la membresía' })
  @IsOptional()
  @IsDateString()
  membershipEnd?: string;

  @ApiPropertyOptional({ type: [String], description: 'IDs de categorías' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateMemberDto extends PartialType(CreateMemberDto) {}

export class FilterMemberDto {
  @ApiPropertyOptional({ enum: MemberStatus })
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @ApiPropertyOptional({
    description:
      'Busca por nombre, apellido o email. Con varias palabras, cada una debe aparecer en alguno de esos campos («ana arquera»).',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ArcheryExperience })
  @IsOptional()
  @IsEnum(ArcheryExperience)
  experience?: ArcheryExperience;

  @ApiPropertyOptional({ description: 'Filtra por categoría' })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
