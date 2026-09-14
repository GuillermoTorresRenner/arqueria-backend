import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveUser, ActiveUserData, Auth, Roles } from '../auth';
import { ScoringService } from './scoring.service';
import { CreateScoreDto, UpdateScoreDto } from './dto';

@ApiTags('Puntuación')
@Controller('scoring')
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Get('leaderboard/:tournamentId')
  @ApiOperation({
    summary: 'Ranking del torneo',
    description: 'Público: alimenta el marcador en vivo.',
  })
  getLeaderboard(@Param('tournamentId') tournamentId: string) {
    return this.scoringService.getLeaderboard(tournamentId);
  }

  @Get('rounds/:roundId')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Series de una ronda' })
  findByRound(@Param('roundId') roundId: string) {
    return this.scoringService.findByRound(roundId);
  }

  @Get('rounds/:roundId/members/:memberId')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Series de un arquero en una ronda' })
  findByMember(
    @Param('roundId') roundId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.scoringService.findByMember(roundId, memberId);
  }

  @Post()
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({
    summary: 'Registrar una serie',
    description:
      'El juez indica la zona de cada flecha; el puntaje lo calcula el servidor.',
  })
  create(@Body() dto: CreateScoreDto, @ActiveUser() user: ActiveUserData) {
    return this.scoringService.create(dto, user.userID, user.role);
  }

  @Patch(':id')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Corregir o validar una serie' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScoreDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.scoringService.update(id, dto, user.userID, user.role);
  }

  @Delete(':id')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Eliminar una serie' })
  remove(@Param('id') id: string, @ActiveUser() user: ActiveUserData) {
    return this.scoringService.remove(id, user.role);
  }
}
