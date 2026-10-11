import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TournamentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateScoringFormatDto,
  FilterTournamentDto,
  UpdateScoringFormatDto,
} from './dto';

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Dianas (formatos de puntuación) ----------

  findAllFormats(onlyActive = false) {
    return this.prisma.scoringFormat.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: { name: 'asc' },
    });
  }

  async findFormat(id: string) {
    const format = await this.prisma.scoringFormat.findUnique({
      where: { id },
    });
    if (!format)
      throw new NotFoundException('Formato de puntuación no encontrado');
    return format;
  }

  createFormat(dto: CreateScoringFormatDto) {
    this.assertUniqueZones(dto.zones);
    return this.prisma.scoringFormat.create({
      data: { ...dto, zones: dto.zones as unknown as Prisma.InputJsonValue },
    });
  }

  async updateFormat(id: string, dto: UpdateScoringFormatDto) {
    await this.findFormat(id);
    if (dto.zones) this.assertUniqueZones(dto.zones);

    const { zones: newZones, ...rest } = dto;
    return this.prisma.scoringFormat.update({
      where: { id },
      data: {
        ...rest,
        ...(newZones
          ? { zones: newZones as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /**
   * Elimina una diana. Si alguna categoría la usa, se bloquea: el borrado
   * dejaría sin zonas a sus enfrentamientos. Para retirarla de circulación,
   * basta con desactivarla (`isActive: false`).
   */
  async removeFormat(id: string) {
    await this.findFormat(id);
    const inUse = await this.prisma.tournamentCategory.count({
      where: { scoringFormatId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `${inUse} categoría(s) de torneo usan esta diana. Desactívala en vez de borrarla.`,
      );
    }
    await this.prisma.scoringFormat.delete({ where: { id } });
    return { message: 'Formato eliminado' };
  }

  // ---------- Torneos ----------

  findAllPublic() {
    return this.prisma.tournament.findMany({
      where: {
        isPublic: true,
        status: {
          in: [
            TournamentStatus.REGISTRATION_OPEN,
            TournamentStatus.IN_PROGRESS,
            TournamentStatus.FINISHED,
          ],
        },
      },
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        location: true,
        startsAt: true,
        endsAt: true,
        status: true,
        _count: { select: { participants: true } },
      },
    });
  }

  async findAll(filter: FilterTournamentDto = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'startsAt',
      sortOrder = 'desc',
      search,
      from,
      to,
      ...rest
    } = filter;

    const where: Prisma.TournamentWhereInput = {};
    if (rest.status) where.status = rest.status;
    if (rest.isPublic !== undefined) where.isPublic = rest.isPublic;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (from || to) {
      where.startsAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          // La actividad del calendario: ahí se gestionan inscripciones y pagos
          activity: { select: { id: true, cancelledAt: true } },
          categories: {
            orderBy: { order: 'asc' },
            select: { id: true, name: true, mode: true },
          },
          _count: {
            select: { participants: true, registrations: true },
          },
        },
      }),
      this.prisma.tournament.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        categories: {
          orderBy: { order: 'asc' },
          include: {
            scoringFormat: true,
            judge: { select: { id: true, name: true, surname: true } },
            _count: { select: { registrations: true } },
          },
        },
        participants: {
          orderBy: { number: 'asc' },
          include: {
            member: {
              select: {
                id: true,
                memberNumber: true,
                user: { select: { name: true, surname: true } },
              },
            },
          },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    return tournament;
  }

  async findBySlug(slug: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { slug },
      include: {
        categories: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            mode: true,
            scoringFormat: { select: { name: true, zones: true } },
          },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    // Endpoint público: de los datos de pago solo salen los montos; la cuenta
    // bancaria se entrega por correo a quien se inscribe
    const { paymentInfo, bankAccountId: _bankAccountId, ...rest } = tournament;
    const fees =
      (paymentInfo as { fees?: { label: string; amount: number }[] } | null)
        ?.fees ?? [];
    return { ...rest, fees };
  }

  /**
   * Transiciones válidas del estado de un torneo.
   *
   * No es una regla arbitraria: sin esto se puede reabrir inscripciones de un
   * torneo ya disputado o volver a "borrador" uno con resultados publicados,
   * dejando el fixture público en un estado incoherente.
   */
  private static readonly STATUS_FLOW: Record<
    TournamentStatus,
    TournamentStatus[]
  > = {
    DRAFT: [TournamentStatus.REGISTRATION_OPEN, TournamentStatus.CANCELLED],
    REGISTRATION_OPEN: [
      TournamentStatus.DRAFT,
      TournamentStatus.IN_PROGRESS,
      TournamentStatus.CANCELLED,
    ],
    IN_PROGRESS: [TournamentStatus.FINISHED, TournamentStatus.CANCELLED],
    // Un torneo terminado o cancelado no vuelve atrás.
    FINISHED: [],
    CANCELLED: [],
  };

  private assertTransition(from: TournamentStatus, to: TournamentStatus) {
    if (from === to) return;
    const allowed = TournamentsService.STATUS_FLOW[from] ?? [];
    if (!allowed.includes(to)) {
      const LABELS: Record<TournamentStatus, string> = {
        DRAFT: 'borrador',
        REGISTRATION_OPEN: 'inscripciones abiertas',
        IN_PROGRESS: 'en curso',
        FINISHED: 'finalizado',
        CANCELLED: 'cancelado',
      };
      throw new BadRequestException(
        `No se puede pasar de "${LABELS[from]}" a "${LABELS[to]}".` +
          (allowed.length
            ? ` Transiciones posibles: ${allowed.map((s) => LABELS[s]).join(', ')}.`
            : ' Es un estado final.'),
      );
    }
  }

  /// Cambia el estado validando la transición.
  async updateStatus(id: string, status: TournamentStatus) {
    const tournament = await this.findOne(id);
    this.assertTransition(tournament.status, status);

    // Publicar el fixture al arrancar es lo que se espera por defecto.
    const shouldPublish =
      status === TournamentStatus.IN_PROGRESS && !tournament.isPublic;

    return this.prisma.tournament.update({
      where: { id },
      data: { status, ...(shouldPublish ? { isPublic: true } : {}) },
    });
  }

  /// Cada zona se elige por su etiqueta: dos iguales serían ambiguas
  private assertUniqueZones(zones: { label: string }[]) {
    const labels = zones.map((z) => z.label.trim());
    const repeated = labels.filter((l, i) => labels.indexOf(l) !== i);
    if (repeated.length > 0) {
      throw new BadRequestException(
        `Hay zonas repetidas: ${[...new Set(repeated)].join(', ')}`,
      );
    }
  }
}
