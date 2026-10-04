import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { CreatePlaceDto, UpdatePlaceDto } from './dto';

@Injectable()
export class PlacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
  ) {}

  findAll() {
    return this.prisma.place.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { activities: true } } },
    });
  }

  async create(dto: CreatePlaceDto) {
    try {
      return await this.prisma.place.create({ data: dto });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: string, dto: UpdatePlaceDto) {
    await this.findOne(id);
    try {
      return await this.prisma.place.update({ where: { id }, data: dto });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /// Un lugar con actividades no se borra (perderían su ubicación): se
  /// desactiva para que deje de ofrecerse.
  async remove(id: string) {
    const place = await this.prisma.place.findUnique({
      where: { id },
      include: { _count: { select: { activities: true } } },
    });
    if (!place) throw new NotFoundException('Lugar no encontrado');
    if (place._count.activities > 0) {
      throw new ConflictException(
        `«${place.name}» tiene actividades agendadas y no se puede eliminar. Desactívalo para que no se ofrezca en las nuevas.`,
      );
    }
    await this.prisma.place.delete({ where: { id } });
    return { id };
  }

  async geocode(query: string) {
    try {
      return await this.weather.geocode(query);
    } catch {
      throw new BadGatewayException(
        'El buscador de ubicaciones no responde. Inténtalo más tarde o escribe las coordenadas.',
      );
    }
  }

  async findOne(id: string) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) throw new NotFoundException('Lugar no encontrado');
    return place;
  }

  private translate(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('Ya existe un lugar con ese nombre');
    }
    return error;
  }
}
