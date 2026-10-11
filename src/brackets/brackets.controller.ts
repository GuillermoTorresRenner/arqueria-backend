import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveUser, ActiveUserData, Auth, Roles } from '../auth';
import { BracketsService } from './brackets.service';
import { DeleteShotDto, DrawDto, RecordShotsDto, UpdateRoundDto } from './dto';

@ApiTags('Cuadro de torneos')
@Controller('brackets')
export class BracketsController {
  constructor(private readonly brackets: BracketsService) {}

  // ---------- Público ----------

  @Get('public/:slug')
  @ApiOperation({
    summary: 'Fixture público de un torneo',
    description:
      'Cuadro de cada categoría con resultados y podio. En vivo por el socket /scoring.',
  })
  forPublic(@Param('slug') slug: string) {
    return this.brackets.forPublic(slug);
  }

  // ---------- Panel (admin y jueces) ----------

  @Get('tournaments/:tournamentId')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Cuadro de un torneo para el panel' })
  forStaff(
    @Param('tournamentId') id: string,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.brackets.forStaff(id, this.staff(user));
  }

  @Post('categories/:categoryId/draw')
  @Auth([Roles.ADMIN])
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sortear',
    description:
      'Primera ronda: todos los pares. Ronda impar posterior: quién queda sin rival. Por algoritmo (con semilla) o como salió de la tómbola.',
  })
  draw(
    @Param('categoryId') id: string,
    @Body() dto: DrawDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.brackets.draw(id, dto, this.staff(user));
  }

  @Delete('categories/:categoryId/draw')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Deshacer el último sorteo (sin resultados cargados)',
  })
  undoDraw(
    @Param('categoryId') id: string,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.brackets.undoDraw(id, this.staff(user));
  }

  @Patch('rounds/:roundId')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Flechas o dianas de una ronda, antes de empezarla',
  })
  updateRound(
    @Param('roundId') id: string,
    @Body() dto: UpdateRoundDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.brackets.updateRound(id, dto, this.staff(user));
  }

  @Post('rounds/:roundId/close')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cerrar la ronda (auditoría)',
    description:
      'El juez de la categoría o un admin la da por revisada; se arma la siguiente.',
  })
  close(@Param('roundId') id: string, @ActiveUser() user: ActiveUserData) {
    return this.brackets.closeRound(id, this.staff(user));
  }

  @Post('rounds/:roundId/reopen')
  @Auth([Roles.ADMIN])
  @HttpCode(200)
  @ApiOperation({ summary: 'Reabrir una ronda para corregirla' })
  reopen(@Param('roundId') id: string, @ActiveUser() user: ActiveUserData) {
    return this.brackets.reopenRound(id, this.staff(user));
  }

  @Get('matches/:matchId')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Enfrentamiento para la pantalla del juez' })
  match(@Param('matchId') id: string, @ActiveUser() user: ActiveUserData) {
    return this.brackets.matchDetail(id, this.staff(user));
  }

  @Put('matches/:matchId/shots')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({
    summary: 'Cargar o corregir flechas (Puntaje) o un disparo (Duelos)',
  })
  record(
    @Param('matchId') id: string,
    @Body() dto: RecordShotsDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.brackets.recordShots(id, dto, this.staff(user));
  }

  @Delete('matches/:matchId/shots')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Borrar una flecha o un disparo' })
  deleteShot(
    @Param('matchId') id: string,
    @Query() dto: DeleteShotDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.brackets.deleteShot(id, dto, this.staff(user));
  }

  private staff(user: ActiveUserData) {
    return { userID: user.userID, role: user.role };
  }
}
