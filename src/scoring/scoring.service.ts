import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ScoreStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth';
import { ScoringGateway } from './scoring.gateway';
import { ArrowDto, CreateScoreDto, UpdateScoreDto } from './dto';

interface ScoringZone {
  label: string;
  value: number;
  isInner?: boolean;
}

interface ResolvedArrows {
  arrows: { label: string; value: number }[];
  total: number;
  innerTens: number;
  tens: number;
}

@Injectable()
export class ScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ScoringGateway,
  ) {}

  async create(dto: CreateScoreDto, userId: string, role: Roles) {
    const context = await this.loadContext(dto.roundId, dto.memberId);
    await this.assertCanScore(context, userId, role);

    this.assertEndNumber(dto.endNumber, context.format.endsPerRound);
    this.assertArrowCount(dto.arrows, context.format.arrowsPerEnd);
    const resolved = this.resolveArrows(dto.arrows, context.format.zones);

    const existing = await this.prisma.score.findUnique({
      where: {
        roundId_memberId_endNumber: {
          roundId: dto.roundId,
          memberId: dto.memberId,
          endNumber: dto.endNumber,
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        `La serie ${dto.endNumber} ya fue registrada para este arquero`,
      );
    }

    const score = await this.prisma.score.create({
      data: {
        roundId: dto.roundId,
        memberId: dto.memberId,
        endNumber: dto.endNumber,
        arrows: resolved.arrows as unknown as Prisma.InputJsonValue,
        total: resolved.total,
        innerTens: resolved.innerTens,
        tens: resolved.tens,
        status: dto.status ?? ScoreStatus.DRAFT,
        recordedById: userId,
      },
    });

    await this.publish(context.tournamentId);
    return score;
  }

  async update(id: string, dto: UpdateScoreDto, userId: string, role: Roles) {
    const score = await this.prisma.score.findUnique({ where: { id } });
    if (!score) throw new NotFoundException('Serie no encontrada');

    const context = await this.loadContext(score.roundId, score.memberId);
    await this.assertCanScore(context, userId, role);

    // Una serie validada por un admin no la reabre un juez.
    if (score.status === ScoreStatus.VALIDATED && role !== Roles.ADMIN) {
      throw new ForbiddenException(
        'La serie fue validada; solo un administrador puede modificarla',
      );
    }

    const data: Prisma.ScoreUpdateInput = {};

    if (dto.arrows) {
      this.assertArrowCount(dto.arrows, context.format.arrowsPerEnd);
      const resolved = this.resolveArrows(dto.arrows, context.format.zones);
      data.arrows = resolved.arrows as unknown as Prisma.InputJsonValue;
      data.total = resolved.total;
      data.innerTens = resolved.innerTens;
      data.tens = resolved.tens;
    }

    if (dto.status) {
      data.status = dto.status;
      if (dto.status === ScoreStatus.VALIDATED) {
        if (role !== Roles.ADMIN) {
          throw new ForbiddenException('Solo un administrador valida series');
        }
        data.validatedBy = { connect: { id: userId } };
        data.validatedAt = new Date();
      }
    }

    const updated = await this.prisma.score.update({ where: { id }, data });
    await this.publish(context.tournamentId);
    return updated;
  }

  async remove(id: string, role: Roles) {
    const score = await this.prisma.score.findUnique({ where: { id } });
    if (!score) throw new NotFoundException('Serie no encontrada');
    if (score.status === ScoreStatus.VALIDATED && role !== Roles.ADMIN) {
      throw new ForbiddenException('La serie fue validada');
    }

    const context = await this.loadContext(score.roundId, score.memberId);
    await this.prisma.score.delete({ where: { id } });
    await this.publish(context.tournamentId);
    return { message: 'Serie eliminada' };
  }

  findByRound(roundId: string) {
    return this.prisma.score.findMany({
      where: { roundId },
      include: { member: { include: { user: true } } },
      orderBy: [{ memberId: 'asc' }, { endNumber: 'asc' }],
    });
  }

  findByMember(roundId: string, memberId: string) {
    return this.prisma.score.findMany({
      where: { roundId, memberId },
      orderBy: { endNumber: 'asc' },
    });
  }

  /**
   * Ranking del torneo. Suma las series de todas sus rondas y desempata por
   * cantidad de zonas interiores y luego de dieces, que es el criterio habitual.
   */
  async getLeaderboard(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { rounds: { select: { id: true } } },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');

    const roundIds = tournament.rounds.map((r) => r.id);
    if (roundIds.length === 0) {
      return { tournamentId, updatedAt: new Date(), entries: [] };
    }

    const scores = await this.prisma.score.findMany({
      where: { roundId: { in: roundIds } },
      include: {
        member: {
          include: {
            user: { select: { name: true, surname: true, avatar: true } },
            categories: { include: { category: true } },
          },
        },
      },
    });

    const byMember = new Map<string, any>();
    for (const score of scores) {
      const entry = byMember.get(score.memberId) ?? {
        memberId: score.memberId,
        memberNumber: score.member.memberNumber,
        name: `${score.member.user.name ?? ''} ${score.member.user.surname ?? ''}`.trim(),
        avatar: score.member.user.avatar,
        categories: score.member.categories.map((c) => c.category.label),
        total: 0,
        innerTens: 0,
        tens: 0,
        endsShot: 0,
      };

      entry.total += score.total;
      entry.innerTens += score.innerTens;
      entry.tens += score.tens;
      entry.endsShot += 1;
      byMember.set(score.memberId, entry);
    }

    const entries = [...byMember.values()]
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.innerTens - a.innerTens ||
          b.tens - a.tens ||
          a.name.localeCompare(b.name),
      )
      .map((entry, index) => ({ ...entry, position: index + 1 }));

    return { tournamentId, updatedAt: new Date(), entries };
  }

  // ---------- Internos ----------

  private async publish(tournamentId: string) {
    const leaderboard = await this.getLeaderboard(tournamentId);
    this.gateway.emitLeaderboard(tournamentId, leaderboard);
  }

  private async loadContext(roundId: string, memberId: string) {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { tournament: { include: { scoringFormat: true } } },
    });
    if (!round) throw new NotFoundException('Ronda no encontrada');

    const registration = await this.prisma.registration.findUnique({
      where: {
        tournamentId_memberId: {
          tournamentId: round.tournamentId,
          memberId,
        },
      },
      include: { group: true },
    });
    if (!registration) {
      throw new BadRequestException(
        'El arquero no está inscrito en este torneo',
      );
    }
    if (registration.status === 'WITHDRAWN') {
      throw new BadRequestException('El arquero se retiró del torneo');
    }

    return {
      tournamentId: round.tournamentId,
      format: {
        ...round.tournament.scoringFormat,
        zones: round.tournament.scoringFormat.zones as unknown as ScoringZone[],
      },
      registration,
    };
  }

  /// Un juez solo carga los puntajes del grupo que tiene asignado.
  private async assertCanScore(
    context: Awaited<ReturnType<ScoringService['loadContext']>>,
    userId: string,
    role: Roles,
  ) {
    if (role === Roles.ADMIN) return;
    if (role !== Roles.JUDGE) {
      throw new ForbiddenException('No tienes permisos para cargar puntajes');
    }

    const groupId = context.registration.groupId;
    if (!groupId) {
      throw new ForbiddenException(
        'El arquero no tiene grupo asignado; solo un administrador puede cargar su puntaje',
      );
    }

    const group = await this.prisma.tournamentGroup.findUnique({
      where: { id: groupId },
      select: { judgeId: true },
    });
    if (group?.judgeId !== userId) {
      throw new ForbiddenException('No eres el juez asignado a este grupo');
    }
  }

  private assertEndNumber(endNumber: number, endsPerRound: number) {
    if (endNumber > endsPerRound) {
      throw new BadRequestException(
        `La ronda tiene ${endsPerRound} series; recibida la ${endNumber}`,
      );
    }
  }

  private assertArrowCount(arrows: ArrowDto[], arrowsPerEnd: number) {
    if (arrows.length !== arrowsPerEnd) {
      throw new BadRequestException(
        `La serie debe tener ${arrowsPerEnd} flechas; se recibieron ${arrows.length}`,
      );
    }
  }

  /// El puntaje lo resuelve el servidor desde las zonas del formato: el cliente
  /// solo dice qué zona tocó cada flecha, nunca cuánto vale.
  private resolveArrows(
    arrows: ArrowDto[],
    zones: ScoringZone[],
  ): ResolvedArrows {
    const byLabel = new Map(zones.map((z) => [z.label.toUpperCase(), z]));

    const resolved = arrows.map((arrow) => {
      const zone = byLabel.get(arrow.label.toUpperCase());
      if (!zone) {
        throw new BadRequestException(
          `Zona "${arrow.label}" inválida para este formato. Válidas: ${zones
            .map((z) => z.label)
            .join(', ')}`,
        );
      }
      return zone;
    });

    return {
      arrows: resolved.map((z) => ({ label: z.label, value: z.value })),
      total: resolved.reduce((sum, z) => sum + z.value, 0),
      innerTens: resolved.filter((z) => z.isInner).length,
      tens: resolved.filter((z) => z.value === 10).length,
    };
  }
}
