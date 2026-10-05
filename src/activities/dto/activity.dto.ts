import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ActivityType, RegistrationStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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

/// Datos para pagar la inscripción por transferencia
export class PaymentInfoDto {
  @ApiPropertyOptional({ example: 'Banco Estado' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  bankName?: string;

  @ApiPropertyOptional({ example: 'Cuenta Vista / CuentaRUT' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  accountType?: string;

  @ApiPropertyOptional({ example: '12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(trim)
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'Comunidad Galadhrym' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  holderName?: string;

  @ApiPropertyOptional({ example: '65.123.456-7' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trim)
  holderRut?: string;

  @ApiPropertyOptional({ example: 'arqueria.galadhrym@gmail.com' })
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsEmail({}, { message: 'Correo del titular inválido' })
  @Transform(trim)
  holderEmail?: string;

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
