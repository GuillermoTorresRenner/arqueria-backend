import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RegistrationStatus, TournamentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupDrawService } from './group-draw.service';
import {
  AssignMemberDto,
  CreateGroupDto,
  CreateRegistrationDto,
  CreateRoundDto,
  CreateScoringFormatDto,
  CreateTournamentDto,
  DrawGroupsDto,
  FilterTournamentDto,
  UpdateGroupDto,
  UpdateRoundDto,
  UpdateScoringFormatDto,
  UpdateTournamentDto,
} from './dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawService: GroupDrawService,
  ) {}

  // ---------- Formatos de puntuación ----------

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
    this.assertZonesFitMax(dto.zones, dto.maxPerArrow);
    return this.prisma.scoringFormat.create({
      data: { ...dto, zones: dto.zones as unknown as Prisma.InputJsonValue },
    });
  }

  async updateFormat(id: string, dto: UpdateScoringFormatDto) {
    const current = await this.findFormat(id);
    const zones = dto.zones ?? (current.zones as any);
    const max = dto.maxPerArrow ?? current.maxPerArrow;
    this.assertZonesFitMax(zones, max);

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
   * Elimina un formato de puntuación. Si algún torneo lo usa, se bloquea:
   * la relación es obligatoria y el borrado dejaría torneos huérfanos.
   * Para retirarlo de circulación, basta con desactivarlo (`isActive: false`).
   */
  async removeFormat(id: string) {
    await this.findFormat(id);
    const inUse = await this.prisma.tournament.count({
      where: { scoringFormatId: id },
    });
    if (inUse > 0) {
      throw new BadRequestException(
        `${inUse} torneo(s) usan este formato. Desactívalo en vez de borrarlo.`,
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
        _count: { select: { registrations: true } },
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
    if (rest.scoringFormatId) where.scoringFormatId = rest.scoringFormatId;

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
          scoringFormat: { select: { id: true, name: true } },
          _count: {
            select: { registrations: true, groups: true, rounds: true },
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
        scoringFormat: true,
        rounds: { orderBy: { order: 'asc' } },
        groups: {
          orderBy: { order: 'asc' },
          include: {
            judge: { select: { id: true, name: true, surname: true } },
            registrations: { include: { member: { include: { user: true } } } },
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
        scoringFormat: true,
        rounds: { orderBy: { order: 'asc' } },
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    return tournament;
  }

  async create(dto: CreateTournamentDto) {
    await this.findFormat(dto.scoringFormatId);
    return this.prisma.tournament.create({
      data: {
        ...dto,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        registrationEnd: dto.registrationEnd
          ? new Date(dto.registrationEnd)
          : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateTournamentDto) {
    const current = await this.findOne(id);
    if (dto.scoringFormatId) await this.findFormat(dto.scoringFormatId);
    if (dto.status) this.assertTransition(current.status, dto.status);

    return this.prisma.tournament.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        registrationEnd: dto.registrationEnd
          ? new Date(dto.registrationEnd)
          : undefined,
      },
    });
  }

  /**
   * Elimina un torneo. Si ya tiene puntajes cargados exige `force`: el borrado
   * en cascada se llevaría por delante todo el historial de resultados, y eso
   * no debe poder ocurrir por un clic accidental.
   */
  async remove(id: string, force = false) {
    const tournament = await this.findOne(id);

    const scoreCount = await this.prisma.score.count({
      where: { round: { tournamentId: id } },
    });

    if (scoreCount > 0 && !force) {
      throw new BadRequestException(
        `El torneo tiene ${scoreCount} series registradas. ` +
          'Cancélalo en vez de borrarlo, o repite la operación con force=true ' +
          'si de verdad quieres eliminar también sus resultados.',
      );
    }

    await this.prisma.tournament.delete({ where: { id } });
    return {
      message: 'Torneo eliminado',
      deletedScores: scoreCount,
      name: tournament.name,
    };
  }

  /// Alternativa no destructiva al borrado.
  async cancel(id: string) {
    await this.findOne(id);
    return this.prisma.tournament.update({
      where: { id },
      data: { status: TournamentStatus.CANCELLED },
    });
  }

  /**
   * Transiciones válidas del estado de un torneo.
   *
   * No es una regla arbitraria: sin esto se puede reabrir inscripciones de un
   * torneo ya disputado o volver a "borrador" uno con resultados publicados,
   * dejando el marcador público en un estado incoherente.
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

    // Publicar el marcador al arrancar es lo que se espera por defecto.
    const shouldPublish =
      status === TournamentStatus.IN_PROGRESS && !tournament.isPublic;

    return this.prisma.tournament.update({
      where: { id },
      data: { status, ...(shouldPublish ? { isPublic: true } : {}) },
    });
  }

  /// Duplica un torneo con sus rondas: crear la edición siguiente a mano es
  /// tedioso y propenso a olvidos.
  async duplicate(id: string, slug: string, name: string, startsAt: string) {
    const source = await this.findOne(id);

    const existing = await this.prisma.tournament.findUnique({
      where: { slug },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un torneo con el slug "${slug}"`,
      );
    }

    return this.prisma.tournament.create({
      data: {
        slug,
        name,
        description: source.description,
        location: source.location,
        startsAt: new Date(startsAt),
        scoringFormatId: source.scoringFormatId,
        maxParticipants: source.maxParticipants,
        status: TournamentStatus.DRAFT,
        isPublic: false,
        rounds: {
          create: source.rounds.map((round) => ({
            name: round.name,
            order: round.order,
            distance: round.distance,
          })),
        },
      },
      include: { rounds: true },
    });
  }

  /// Resumen para la ficha del torneo en el panel.
  async getStats(id: string) {
    const tournament = await this.findOne(id);

    const [registrations, confirmed, withdrawn, scores, groupsWithJudge] =
      await this.prisma.$transaction([
        this.prisma.registration.count({ where: { tournamentId: id } }),
        this.prisma.registration.count({
          where: { tournamentId: id, status: RegistrationStatus.CONFIRMED },
        }),
        this.prisma.registration.count({
          where: { tournamentId: id, status: RegistrationStatus.WITHDRAWN },
        }),
        this.prisma.score.count({ where: { round: { tournamentId: id } } }),
        this.prisma.tournamentGroup.count({
          where: { tournamentId: id, judgeId: { not: null } },
        }),
      ]);

    const groups = tournament.groups.length;
    const rounds = tournament.rounds.length;
    const expectedEnds =
      confirmed * rounds * (tournament.scoringFormat?.endsPerRound ?? 0);

    return {
      registrations: { total: registrations, confirmed, withdrawn },
      groups: { total: groups, withJudge: groupsWithJudge },
      rounds,
      scores: {
        recorded: scores,
        expected: expectedEnds,
        progress:
          expectedEnds > 0 ? Math.round((scores / expectedEnds) * 100) : 0,
      },
      unassigned: await this.prisma.registration.count({
        where: {
          tournamentId: id,
          groupId: null,
          status: { not: RegistrationStatus.WITHDRAWN },
        },
      }),
    };
  }

  // ---------- Rondas ----------

  async createRound(tournamentId: string, dto: CreateRoundDto) {
    await this.findOne(tournamentId);
    const order = dto.order ?? (await this.nextRoundOrder(tournamentId));
    return this.prisma.round.create({
      data: { ...dto, order, tournamentId },
    });
  }

  async updateRound(id: string, dto: UpdateRoundDto) {
    await this.findRound(id);
    return this.prisma.round.update({ where: { id }, data: dto });
  }

  async removeRound(id: string) {
    await this.findRound(id);
    await this.prisma.round.delete({ where: { id } });
    return { message: 'Ronda eliminada' };
  }

  async findRound(id: string) {
    const round = await this.prisma.round.findUnique({ where: { id } });
    if (!round) throw new NotFoundException('Ronda no encontrada');
    return round;
  }

  async findRounds(tournamentId: string) {
    await this.findOne(tournamentId);
    return this.prisma.round.findMany({
      where: { tournamentId },
      orderBy: { order: 'asc' },
      include: { _count: { select: { scores: true } } },
    });
  }

  /// Una ronda con puntajes no se borra sin confirmación explícita.
  async removeRoundSafe(id: string, force = false) {
    await this.findRound(id);
    const scoreCount = await this.prisma.score.count({
      where: { roundId: id },
    });
    if (scoreCount > 0 && !force) {
      throw new BadRequestException(
        `La ronda tiene ${scoreCount} series registradas. ` +
          'Repite con force=true si quieres borrarlas también.',
      );
    }
    await this.prisma.round.delete({ where: { id } });
    return { message: 'Ronda eliminada', deletedScores: scoreCount };
  }

  // ---------- Inscripciones ----------

  async register(tournamentId: string, dto: CreateRegistrationDto) {
    const tournament = await this.findOne(tournamentId);

    if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Las inscripciones no están abiertas');
    }
    if (
      tournament.registrationEnd &&
      tournament.registrationEnd.getTime() < Date.now()
    ) {
      throw new BadRequestException('El plazo de inscripción ya venció');
    }

    const member = await this.prisma.member.findUnique({
      where: { id: dto.memberId },
    });
    if (!member) throw new NotFoundException('Socio no encontrado');
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException('El socio no está activo');
    }

    const existing = await this.prisma.registration.findUnique({
      where: {
        tournamentId_memberId: { tournamentId, memberId: dto.memberId },
      },
    });
    if (existing) throw new BadRequestException('El socio ya está inscrito');

    if (tournament.maxParticipants) {
      const count = await this.prisma.registration.count({
        where: { tournamentId, status: { not: RegistrationStatus.WITHDRAWN } },
      });
      if (count >= tournament.maxParticipants) {
        throw new BadRequestException('El torneo alcanzó su cupo máximo');
      }
    }

    return this.prisma.registration.create({
      data: { tournamentId, memberId: dto.memberId, status: dto.status },
      include: { member: { include: { user: true } } },
    });
  }

  findRegistrations(tournamentId: string) {
    return this.prisma.registration.findMany({
      where: { tournamentId },
      include: {
        member: {
          include: { user: true, categories: { include: { category: true } } },
        },
        group: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Elimina una inscripción. Si el arquero ya tiene puntajes, se marca como
   * retirado en lugar de borrarlo: sus resultados forman parte del historial.
   */
  async removeRegistration(id: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
    });
    if (!registration) throw new NotFoundException('Inscripción no encontrada');

    const scoreCount = await this.prisma.score.count({
      where: {
        memberId: registration.memberId,
        round: { tournamentId: registration.tournamentId },
      },
    });

    if (scoreCount > 0) {
      await this.prisma.registration.update({
        where: { id },
        data: { status: RegistrationStatus.WITHDRAWN, groupId: null },
      });
      return {
        message: `El arquero tiene ${scoreCount} series registradas: se marcó como retirado en vez de eliminarlo.`,
        withdrawn: true,
      };
    }

    await this.prisma.registration.delete({ where: { id } });
    return { message: 'Inscripción eliminada', withdrawn: false };
  }

  async updateRegistrationStatus(id: string, status: RegistrationStatus) {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
    });
    if (!registration) throw new NotFoundException('Inscripción no encontrada');
    return this.prisma.registration.update({ where: { id }, data: { status } });
  }

  // ---------- Grupos ----------

  async createGroup(tournamentId: string, dto: CreateGroupDto) {
    await this.findOne(tournamentId);
    if (dto.judgeId) await this.assertIsJudge(dto.judgeId);
    const order = dto.order ?? (await this.nextGroupOrder(tournamentId));
    return this.prisma.tournamentGroup.create({
      data: { ...dto, order, tournamentId },
    });
  }

  async updateGroup(id: string, dto: UpdateGroupDto) {
    await this.findGroup(id);
    if (dto.judgeId) await this.assertIsJudge(dto.judgeId);
    return this.prisma.tournamentGroup.update({ where: { id }, data: dto });
  }

  async removeGroup(id: string) {
    await this.findGroup(id);
    await this.prisma.tournamentGroup.delete({ where: { id } });
    return { message: 'Grupo eliminado' };
  }

  async findGroups(tournamentId: string) {
    await this.findOne(tournamentId);
    return this.prisma.tournamentGroup.findMany({
      where: { tournamentId },
      orderBy: { order: 'asc' },
      include: {
        judge: { select: { id: true, name: true, surname: true, email: true } },
        registrations: {
          orderBy: { position: 'asc' },
          include: { member: { include: { user: true } } },
        },
      },
    });
  }

  async findGroup(id: string) {
    const group = await this.prisma.tournamentGroup.findUnique({
      where: { id },
      include: {
        registrations: { include: { member: { include: { user: true } } } },
      },
    });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    return group;
  }

  /**
   * Sortea los grupos del torneo. Borra los grupos previos y crea unos nuevos,
   * dejando registrado el sorteo con su semilla para que sea auditable.
   */
  async drawGroups(
    tournamentId: string,
    dto: DrawGroupsDto,
    drawnById?: string,
  ) {
    const tournament = await this.findOne(tournamentId);

    if (tournament.status === TournamentStatus.FINISHED) {
      throw new BadRequestException('El torneo ya finalizó');
    }

    const registrations = await this.prisma.registration.findMany({
      where: {
        tournamentId,
        status: { not: RegistrationStatus.WITHDRAWN },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const result = this.drawService.draw({
      registrationIds: registrations.map((r) => r.id),
      groupCount: dto.groupCount,
      seed: dto.seed,
    });

    return this.prisma.$transaction(async (tx) => {
      // Al borrar los grupos, las inscripciones quedan sin asignar (onDelete: SetNull)
      await tx.tournamentGroup.deleteMany({ where: { tournamentId } });

      const created = [];
      for (let i = 0; i < result.groups.length; i++) {
        const group = await tx.tournamentGroup.create({
          data: {
            tournamentId,
            name: `Grupo ${String.fromCharCode(65 + i)}`,
            order: i,
          },
        });

        await Promise.all(
          result.groups[i].map((registrationId, position) =>
            tx.registration.update({
              where: { id: registrationId },
              data: { groupId: group.id, position: position + 1 },
            }),
          ),
        );

        created.push({ groupId: group.id, registrationIds: result.groups[i] });
      }

      await tx.groupDraw.create({
        data: {
          tournamentId,
          seed: result.seed,
          strategy: 'RANDOM',
          result: created as unknown as Prisma.InputJsonValue,
          drawnById,
        },
      });

      return {
        seed: result.seed,
        groups: created,
      };
    });
  }

  /// Reasignación manual: siempre hace falta mover a quien no llegó.
  async assignMember(tournamentId: string, dto: AssignMemberDto) {
    await this.findOne(tournamentId);

    const registration = await this.prisma.registration.findUnique({
      where: { id: dto.registrationId },
    });
    if (!registration || registration.tournamentId !== tournamentId) {
      throw new NotFoundException('Inscripción no encontrada en este torneo');
    }

    if (dto.groupId) {
      const group = await this.prisma.tournamentGroup.findUnique({
        where: { id: dto.groupId },
      });
      if (!group || group.tournamentId !== tournamentId) {
        throw new NotFoundException('Grupo no encontrado en este torneo');
      }
    }

    return this.prisma.registration.update({
      where: { id: dto.registrationId },
      data: { groupId: dto.groupId ?? null, position: dto.position ?? null },
    });
  }

  findDraws(tournamentId: string) {
    return this.prisma.groupDraw.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
      include: {
        drawnBy: { select: { id: true, name: true, surname: true } },
      },
    });
  }

  // ---------- Helpers ----------

  private assertZonesFitMax(zones: any[], maxPerArrow: number) {
    const invalid = (zones ?? []).filter((z) => z.value > maxPerArrow);
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Estas zonas superan el máximo por flecha (${maxPerArrow}): ${invalid
          .map((z) => z.label)
          .join(', ')}`,
      );
    }
  }

  private async assertIsJudge(userId: string) {
    const user = await this.prisma.users.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario juez no encontrado');
    if (user.userRoles !== 'JUDGE' && user.userRoles !== 'ADMIN') {
      throw new BadRequestException(
        'El usuario asignado debe tener rol JUDGE o ADMIN',
      );
    }
  }

  private async nextRoundOrder(tournamentId: string) {
    const last = await this.prisma.round.findFirst({
      where: { tournamentId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? -1) + 1;
  }

  private async nextGroupOrder(tournamentId: string) {
    const last = await this.prisma.tournamentGroup.findFirst({
      where: { tournamentId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? -1) + 1;
  }
}
