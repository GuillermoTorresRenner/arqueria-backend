import { ApiProperty } from '@nestjs/swagger';
import { TournamentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTournamentStatusDto {
  @ApiProperty({ enum: TournamentStatus })
  @IsEnum(TournamentStatus)
  status: TournamentStatus;
}
