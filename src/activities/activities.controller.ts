import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActiveUser, ActiveUserData, Auth, Roles } from '../auth';
import { ActivitiesService } from './activities.service';
import { PlacesService } from './places.service';
import {
  ActivityTournamentsService,
  MAX_DOCUMENT_SIZE,
} from './activity-tournaments.service';
import {
  ActivityRangeDto,
  CancelActivityDto,
  CreateActivityDto,
  CreatePlaceDto,
  GeocodeQueryDto,
  RegistrationStatusDto,
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
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly tournaments: ActivityTournamentsService,
  ) {}

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

  @Post(':id/registration')
  @Auth()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Preinscribirse en un torneo',
    description:
      'Queda pendiente de pago; recibe por correo los datos de transferencia y la indicación de enviar el comprobante.',
  })
  register(@Param('id') id: string, @ActiveUser() user: ActiveUserData) {
    return this.tournaments.register(id, user.userID);
  }

  @Delete(':id/registration')
  @Auth()
  @ApiOperation({
    summary: 'Retirar la preinscripción (solo si no está pagada)',
  })
  withdraw(@Param('id') id: string, @ActiveUser() user: ActiveUserData) {
    return this.tournaments.withdraw(id, user.userID);
  }

  // ---------- Administración ----------

  @Get('payment-defaults')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Datos de pago del último torneo',
    description: 'Para precargarlos al crear uno nuevo.',
  })
  paymentDefaults() {
    return this.activitiesService.paymentDefaults();
  }

  @Patch('registrations/:registrationId')
  @Auth([Roles.ADMIN])
  @ApiOperation({
    summary: 'Confirmar el pago de una inscripción (o devolverla a pendiente)',
    description:
      'Al confirmar, el socio recibe un correo de inscripción confirmada.',
  })
  setRegistrationStatus(
    @Param('registrationId') registrationId: string,
    @Body() { status }: RegistrationStatusDto,
    @ActiveUser() user: ActiveUserData,
  ) {
    return this.tournaments.setRegistrationStatus(
      registrationId,
      status,
      user.userID,
    );
  }

  @Delete('registrations/:registrationId')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar una inscripción' })
  removeRegistration(@Param('registrationId') registrationId: string) {
    return this.tournaments.removeRegistration(registrationId);
  }

  @Post(':id/documents')
  @Auth([Roles.ADMIN])
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Subir un reglamento o bases del torneo',
    description: 'PDF, Word, PowerPoint, Excel u OpenDocument; hasta 20 MB.',
  })
  addDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.tournaments.addDocument(id, file);
  }

  @Delete('documents/:documentId')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar un documento (borra también el archivo)' })
  removeDocument(@Param('documentId') documentId: string) {
    return this.tournaments.removeDocument(documentId);
  }

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

  @Post(':id/cancel')
  @Auth([Roles.ADMIN])
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancelar actividad, evento o torneo',
    description:
      'Sigue visible en el calendario marcada como cancelada, con su causal. Opcionalmente avisa por correo.',
  })
  cancel(@Param('id') id: string, @Body() dto: CancelActivityDto) {
    return this.activitiesService.cancel(id, dto);
  }

  @Post(':id/restore')
  @Auth([Roles.ADMIN])
  @HttpCode(200)
  @ApiOperation({ summary: 'Reactivar una actividad cancelada' })
  restore(@Param('id') id: string) {
    return this.activitiesService.restore(id);
  }

  @Delete(':id')
  @Auth([Roles.ADMIN])
  @ApiOperation({ summary: 'Eliminar actividad' })
  remove(@Param('id') id: string) {
    return this.activitiesService.remove(id);
  }
}
