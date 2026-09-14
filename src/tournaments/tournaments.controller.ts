import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActiveUser, ActiveUserData, Auth, Roles } from '../auth';
import { TournamentsService } from './tournaments.service';
import {
  AssignMemberDto,
  CreateGroupDto,
  CreateRegistrationDto,
  CreateRoundDto,
  CreateScoringFormatDto,
  CreateTournamentDto,
  DrawGroupsDto,
  DuplicateTournamentDto,
  FilterTournamentDto,
  UpdateGroupDto,
  UpdateRegistrationStatusDto,
  UpdateRoundDto,
  UpdateScoringFormatDto,
  UpdateTournamentDto,
  UpdateTournamentStatusDto,
} from './dto';

@ApiTags('Torneos')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  // ---------- Formatos de puntuación ----------

  @Get('formats')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Formatos de puntuación' })
  findAllFormats(@Query('onlyActive') onlyActive?: string) {
    return this.tournamentsService.findAllFormats(onlyActive === 'true');
  }

  @Post('formats')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Crear formato de puntuación',
    description:
      'Las zonas son datos: permite definir cualquier modalidad sin tocar código.',
  })
  createFormat(@Body() dto: CreateScoringFormatDto) {
    return this.tournamentsService.createFormat(dto);
  }

  @Get('formats/:id')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Detalle de un formato de puntuación' })
  findFormat(@Param('id') id: string) {
    return this.tournamentsService.findFormat(id);
  }

  @Patch('formats/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar formato de puntuación' })
  updateFormat(@Param('id') id: string, @Body() dto: UpdateScoringFormatDto) {
    return this.tournamentsService.updateFormat(id, dto);
  }

  @Delete('formats/:id')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Eliminar formato de puntuación',
    description: 'Falla si algún torneo lo usa; en ese caso, desactívalo.',
  })
  removeFormat(@Param('id') id: string) {
    return this.tournamentsService.removeFormat(id);
  }

  // ---------- Público ----------

  @Get('public')
  @ApiOperation({ summary: 'Torneos publicados' })
  findAllPublic() {
    return this.tournamentsService.findAllPublic();
  }

  @Get('public/:slug')
  @ApiOperation({ summary: 'Detalle público de un torneo' })
  findBySlug(@Param('slug') slug: string) {
    return this.tournamentsService.findBySlug(slug);
  }

  // ---------- Administración ----------

  @Get()
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({
    summary: 'Listado de torneos',
    description: 'Paginado, con filtros por estado, texto, fechas y formato.',
  })
  findAll(@Query() filter: FilterTournamentDto) {
    return this.tournamentsService.findAll(filter);
  }

  @Get(':id')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Detalle de un torneo' })
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @Post()
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear torneo' })
  create(@Body() dto: CreateTournamentDto) {
    return this.tournamentsService.create(dto);
  }

  @Patch(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar torneo' })
  update(@Param('id') id: string, @Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.update(id, dto);
  }

  @Get(':id/stats')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({
    summary: 'Resumen del torneo',
    description:
      'Inscripciones, grupos, avance de puntajes y arqueros sin asignar.',
  })
  getStats(@Param('id') id: string) {
    return this.tournamentsService.getStats(id);
  }

  @Patch(':id/status')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Cambiar el estado del torneo',
    description:
      'Valida la transición: un torneo finalizado o cancelado no vuelve atrás.',
  })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTournamentStatusDto,
  ) {
    return this.tournamentsService.updateStatus(id, dto.status);
  }

  @Post(':id/duplicate')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Duplicar un torneo',
    description: 'Copia sus rondas y configuración como borrador.',
  })
  duplicate(@Param('id') id: string, @Body() dto: DuplicateTournamentDto) {
    return this.tournamentsService.duplicate(
      id,
      dto.slug,
      dto.name,
      dto.startsAt,
    );
  }

  @Patch(':id/cancel')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Cancelar torneo',
    description:
      'Alternativa no destructiva a eliminarlo: conserva el historial.',
  })
  cancel(@Param('id') id: string) {
    return this.tournamentsService.cancel(id);
  }

  @Delete(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Eliminar torneo',
    description:
      'Si tiene puntajes registrados exige ?force=true, porque el borrado ' +
      'arrastra todo su historial de resultados.',
  })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  remove(@Param('id') id: string, @Query('force') force?: string) {
    return this.tournamentsService.remove(id, force === 'true');
  }

  // ---------- Rondas ----------

  @Get(':id/rounds')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Rondas del torneo' })
  findRounds(@Param('id') id: string) {
    return this.tournamentsService.findRounds(id);
  }

  @Post(':id/rounds')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear ronda' })
  createRound(@Param('id') id: string, @Body() dto: CreateRoundDto) {
    return this.tournamentsService.createRound(id, dto);
  }

  @Patch('rounds/:roundId')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar ronda' })
  updateRound(@Param('roundId') roundId: string, @Body() dto: UpdateRoundDto) {
    return this.tournamentsService.updateRound(roundId, dto);
  }

  @Delete('rounds/:roundId')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Eliminar ronda',
    description: 'Si tiene puntajes registrados exige ?force=true.',
  })
  @ApiQuery({ name: 'force', required: false, type: Boolean })
  removeRound(
    @Param('roundId') roundId: string,
    @Query('force') force?: string,
  ) {
    return this.tournamentsService.removeRoundSafe(roundId, force === 'true');
  }

  // ---------- Inscripciones ----------

  @Get(':id/registrations')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Inscripciones del torneo' })
  findRegistrations(@Param('id') id: string) {
    return this.tournamentsService.findRegistrations(id);
  }

  @Post(':id/registrations')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Inscribir a un socio' })
  register(@Param('id') id: string, @Body() dto: CreateRegistrationDto) {
    return this.tournamentsService.register(id, dto);
  }

  @Delete('registrations/:registrationId')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Eliminar una inscripción',
    description:
      'Si el arquero ya tiene puntajes, se marca como retirado en lugar de ' +
      'borrarlo, para no perder sus resultados.',
  })
  removeRegistration(@Param('registrationId') registrationId: string) {
    return this.tournamentsService.removeRegistration(registrationId);
  }

  @Patch('registrations/:registrationId/status')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Cambiar estado de una inscripción' })
  updateRegistrationStatus(
    @Param('registrationId') registrationId: string,
    @Body() dto: UpdateRegistrationStatusDto,
  ) {
    return this.tournamentsService.updateRegistrationStatus(
      registrationId,
      dto.status,
    );
  }

  // ---------- Grupos y sorteo ----------

  @Get(':id/groups')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({
    summary: 'Grupos del torneo',
    description: 'Con su juez asignado y los arqueros de cada uno.',
  })
  findGroups(@Param('id') id: string) {
    return this.tournamentsService.findGroups(id);
  }

  @Get('groups/:groupId')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({ summary: 'Detalle de un grupo' })
  findGroup(@Param('groupId') groupId: string) {
    return this.tournamentsService.findGroup(groupId);
  }

  @Post(':id/groups')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Crear grupo' })
  createGroup(@Param('id') id: string, @Body() dto: CreateGroupDto) {
    return this.tournamentsService.createGroup(id, dto);
  }

  @Patch('groups/:groupId')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar grupo o asignarle juez' })
  updateGroup(@Param('groupId') groupId: string, @Body() dto: UpdateGroupDto) {
    return this.tournamentsService.updateGroup(groupId, dto);
  }

  @Delete('groups/:groupId')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar grupo' })
  removeGroup(@Param('groupId') groupId: string) {
    return this.tournamentsService.removeGroup(groupId);
  }

  @Post(':id/draw')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Sortear grupos',
    description:
      'Reemplaza los grupos existentes. Queda registrado con su semilla para poder auditarlo.',
  })
  drawGroups(
    @Param('id') id: string,
    @Body() dto: DrawGroupsDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.tournamentsService.drawGroups(id, dto, user.userID);
  }

  @Get(':id/draws')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Historial de sorteos del torneo' })
  findDraws(@Param('id') id: string) {
    return this.tournamentsService.findDraws(id);
  }

  @Patch(':id/assign')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Reasignar manualmente a un arquero' })
  assignMember(@Param('id') id: string, @Body() dto: AssignMemberDto) {
    return this.tournamentsService.assignMember(id, dto);
  }
}
