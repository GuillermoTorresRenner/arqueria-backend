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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, Roles } from '../auth';
import { TournamentsService } from './tournaments.service';
import {
  CreateScoringFormatDto,
  FilterTournamentDto,
  UpdateScoringFormatDto,
  UpdateTournamentStatusDto,
} from './dto';

@ApiTags('Torneos')
@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  // ---------- Dianas (formatos de puntuación) ----------

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
    description: 'Paginado, con filtros por estado, texto y fechas.',
  })
  findAll(@Query() filter: FilterTournamentDto) {
    return this.tournamentsService.findAll(filter);
  }

  @Get(':id')
  @Auth([Roles.ADMIN, Roles.JUDGE])
  @ApiOperation({
    summary: 'Detalle de un torneo',
    description: 'Con sus categorías y los participantes numerados.',
  })
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
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
}
