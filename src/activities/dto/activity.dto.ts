import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ActivityType, CategoryMode, RegistrationStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// Videos de YouTube: watch?v=, youtu.be/, shorts/, embed/ y live/
export const YOUTUBE_URL =
  /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?(.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}/;

export class FeeDto {
  @ApiProperty({ example: 'Socio adulto' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(trim)
  label: string;

  @ApiProperty({ example: 15000, description: 'Monto en pesos' })
  @Type(() => Number)
  @IsInt({ message: 'El monto debe ser un número entero' })
  @Min(0)
  @Max(100_000_000)
  amount: number;
}

/// Lo propio del pago de cada torneo; la cuenta va en bankAccountId
export class PaymentInfoDto {
  @ApiPropertyOptional({
    example: 'Indica tu nombre en el asunto de la transferencia.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @ApiPropertyOptional({ type: [FeeDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FeeDto)
  fees?: FeeDto[];
}

/// Categoría de competencia del torneo. Sin id se crea; las que no vengan en
/// la lista se eliminan (si no tienen inscritos).
export class TournamentCategoryDto {
  @ApiPropertyOptional({ description: 'Categoría existente a actualizar' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Tiro tradicional' })
  @IsString()
  @MinLength(2, { message: 'Cada categoría necesita un nombre' })
  @MaxLength(60)
  @Transform(trim)
  name: string;

  @ApiProperty({ enum: CategoryMode, description: 'Puntaje o duelos' })
  @IsEnum(CategoryMode)
  mode: CategoryMode;

  @ApiPropertyOptional({
    description: 'Puntaje: diana (ver /tournaments/formats)',
  })
  @IsOptional()
  @IsString()
  scoringFormatId?: string | null;

  @ApiPropertyOptional({
    example: 3,
    description: 'Puntaje: flechas por arquero en cada ronda',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  arrowsPerArcher?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Duelos: dianas abatidas para ganar',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  targetsToWin?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Flechas por arquero en cada tanda de desempate',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  shootOffArrows?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Flechas por arquero en la minironda entre perdedores empatados',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  playoffArrows?: number;

  @ApiPropertyOptional({
    description: 'Juez de la categoría: uno de los jueces del torneo',
  })
  @IsOptional()
  @IsString()
  judgeId?: string | null;
}

/// Datos propios de un torneo
export class TournamentDetailsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Usuarios ADMIN o JUDGE que arbitran',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  judgeIds?: string[];

  @ApiPropertyOptional({ description: 'Reglamento redactado (HTML)' })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  rules?: string | null;

  @ApiPropertyOptional({
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(YOUTUBE_URL, { message: 'El enlace debe ser un video de YouTube' })
  youtubeUrl?: string | null;

  @ApiPropertyOptional({ description: 'Cierre de inscripciones' })
  @IsOptional()
  @IsDateString({}, { message: 'Fecha de cierre inválida' })
  registrationEnd?: string | null;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxParticipants?: number | null;

  @ApiPropertyOptional({
    type: [TournamentCategoryDto],
    description: 'Lista completa de categorías: reemplaza a las actuales',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'El torneo necesita al menos una categoría' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TournamentCategoryDto)
  categories?: TournamentCategoryDto[];

  @ApiPropertyOptional({
    description: 'Cuenta guardada a la que se transfiere (ver /bank-accounts)',
  })
  @IsOptional()
  @IsString()
  bankAccountId?: string | null;

  @ApiPropertyOptional({ type: PaymentInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentInfoDto)
  paymentInfo?: PaymentInfoDto | null;
}

export class CreateActivityDto {
  @ApiPropertyOptional({ enum: ActivityType, default: ActivityType.ACTIVITY })
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

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

  @ApiPropertyOptional({
    type: TournamentDetailsDto,
    description: 'Solo para type=TOURNAMENT',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TournamentDetailsDto)
  tournament?: TournamentDetailsDto;
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

export class RegistrationStatusDto {
  @ApiProperty({
    enum: [RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED],
    description: 'CONFIRMED: pago verificado, queda inscrito',
  })
  @IsIn([RegistrationStatus.PENDING, RegistrationStatus.CONFIRMED])
  status: 'PENDING' | 'CONFIRMED';
}

export class CancelActivityDto {
  @ApiPropertyOptional({
    example: 'Suspendida por lluvia: la reagendaremos pronto.',
    description: 'Causal que verán los socios (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Transform(trim)
  reason?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Avisar por correo: a todos los socios activos si la actividad se había anunciado; si no, a quienes confirmaron o se inscribieron.',
  })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

/// Categoría del torneo en la que se inscribe o de la que se retira. Si el
/// torneo tiene una sola, puede omitirse.
export class RegistrationCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}
