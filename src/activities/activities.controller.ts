import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveUser, ActiveUserData, Auth, Roles } from '../auth';
import { ActivitiesService } from './activities.service';
import { PlacesService } from './places.service';
import {
  ActivityRangeDto,
  CreateActivityDto,
  CreatePlaceDto,
  GeocodeQueryDto,
  ReverseGeocodeDto,
  UpcomingQueryDto,
  UpdateActivityDto,
  UpdatePlaceDto,
  WeatherPreviewDto,
} from './dto';

@ApiTags('Lugares')
@Controller('places')
@Auth([Roles.ADMIN])
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  @ApiOperation({ summary: 'Lugares guardados, incluidos los inactivos' })
  findAll() {
    return this.placesService.findAll();
  }

  @Get('geocode')
  @ApiOperation({
    summary: 'Buscar direcciones y lugares',
    description: 'OpenStreetMap (Nominatim), acotado al país del club.',
  })
  geocode(@Query() { q }: GeocodeQueryDto) {
    return this.placesService.geocode(q);
  }

  @Get('reverse')
  @ApiOperation({ summary: 'Dirección de un punto marcado en el mapa' })
  reverse(@Query() { lat, lon }: ReverseGeocodeDto) {
    return this.placesService.reverse(lat, lon);
  }

  @Post()
  @ApiOperation({ summary: 'Crear lugar' })
  create(@Body() dto: CreatePlaceDto) {
    return this.placesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar o desactivar lugar' })
  update(@Param('id') id: string, @Body() dto: UpdatePlaceDto) {
    return this.placesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar lugar',
    description: 'Solo si no tiene actividades; si las tiene, se desactiva.',
  })
  remove(@Param('id') id: string) {
    return this.placesService.remove(id);
  }
}

@ApiTags('Actividades')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // ---------- Público ----------

  @Get('upcoming')
  @ApiOperation({ summary: 'Próximas actividades (home)' })
  findUpcoming(@Query() { limit }: UpcomingQueryDto) {
    return this.activitiesService.findUpcoming(limit);
  }

  @Get(':id/weather')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60 * 1000 } })
  @ApiOperation({
    summary: 'Pronóstico del tiempo para la actividad',
    description:
      'Open-Meteo, en las horas de la actividad. Disponible 16 días antes.',
  })
  weather(@Param('id') id: string) {
    return this.activitiesService.weatherFor(id);
  }

  // ---------- Socios ----------

  @Get('member')
  @Auth()
  @ApiOperation({
    summary: 'Calendario del socio',
    description:
      'Próximas actividades, indicando a cuáles confirmó asistencia.',
  })
  findForMember(@ActiveUser() user: ActiveUserData) {
    return this.activitiesService.findForMember(user.userID);
  }

  @Post(':id/attendance')
  @Auth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmar asistencia' })
  attend(@Param('id') id: string, @ActiveUser() user: ActiveUserData) {
    return this.activitiesService.setAttendance(id, user.userID, true);
  }

  @Delete(':id/attendance')
  @Auth()
  @ApiOperation({ summary: 'Cancelar la asistencia' })
  unattend(@Param('id') id: string, @ActiveUser() user: ActiveUserData) {
    return this.activitiesService.setAttendance(id, user.userID, false);
  }

  // ---------- Administración ----------

  @Get('weather-preview')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Pronóstico antes de guardar la actividad' })
  weatherPreview(@Query() dto: WeatherPreviewDto) {
    return this.activitiesService.weatherPreview(
      dto.placeId,
      dto.startsAt,
      dto.endsAt,
    );
  }

  @Get()
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actividades de un rango de fechas (calendario)' })
  findRange(@Query() { from, to }: ActivityRangeDto) {
    return this.activitiesService.findRange(from, to);
  }

  @Get(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Detalle con la lista de asistentes' })
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Post()
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Agendar actividad',
    description:
      'Con notifyMembers=true avisa por correo a los socios activos.',
  })
  create(@Body() dto: CreateActivityDto, @ActiveUser() user: ActiveUserData) {
    return this.activitiesService.create(dto, user.userID);
  }

  @Patch(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Actualizar actividad' })
  update(@Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(id, dto);
  }

  @Post(':id/notify')
  @Auth([Roles.ADMIN])
  @HttpCode(200)
  @ApiOperation({
    summary: 'Avisar ahora a los socios',
    description:
      'Primer aviso o uno nuevo (por ejemplo, tras cambiar la hora).',
  })
  notify(@Param('id') id: string) {
    return this.activitiesService.notifyNow(id);
  }

  @Delete(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar actividad' })
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(id);
  }
}
