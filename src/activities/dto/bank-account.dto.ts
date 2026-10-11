import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Banco de Chile' })
  @IsString()
  @MinLength(2, { message: 'Indica el banco' })
  @MaxLength(80)
  @Transform(trim)
  bankName: string;

  @ApiProperty({ example: 'Cuenta Vista' })
  @IsString()
  @MinLength(2, { message: 'Indica el tipo de cuenta' })
  @MaxLength(60)
  @Transform(trim)
  accountType: string;

  @ApiProperty({ example: '00-061-12262-78' })
  @IsString()
  @MinLength(1, { message: 'Indica el número de cuenta' })
  @MaxLength(40)
  @Transform(trim)
  accountNumber: string;

  @ApiProperty({ example: 'Comunidad Galadhrym' })
  @IsString()
  @MinLength(2, { message: 'Indica el titular' })
  @MaxLength(120)
  @Transform(trim)
  holderName: string;

  @ApiProperty({ example: '65.123.456-7' })
  @IsString()
  @MinLength(3, { message: 'Indica el RUT del titular' })
  @MaxLength(20)
  @Transform(trim)
  holderRut: string;

  @ApiPropertyOptional({ example: 'tesoreria@galadhrym.cl' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail({}, { message: 'Correo del titular inválido' })
  @Transform(trim)
  holderEmail?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {}
