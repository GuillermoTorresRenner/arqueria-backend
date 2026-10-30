import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CategoryMode,
  MatchKind,
  Prisma,
  RegistrationStatus,
  Role,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { ScoringGateway } from '../scoring/scoring.gateway';
import { newSeed, seededShuffle } from '../tournaments/seeded-random';
import {
  advancing,
  bracketOrder,
  buildRoundMatches,
  DrawResult,
  drawFromShuffle,
  evaluateMatch,
  isRace,
  isRoundComplete,
  MatchEvaluation,
  MatchRules,
  podium,
  roundLabel,
  RoundMatch,
  semifinalLosers,
  Shot,
  validateDraw,
} from './bracket-engine';
import { DeleteShotDto, DrawDto, RecordShotsDto, UpdateRoundDto } from './dto';

export interface Staff {
  userID: string;
  role: string;
}

const PARTICIPANT = {
  select: {
    id: true,
    number: true,
    member: { select: { user: { select: { name: true, surname: true } } } },
  },
} satisfies Prisma.TournamentParticipantDefaultArgs;

const MATCHES = {
  orderBy: [{ kind: 'asc' }, { order: 'asc' }],
  include: {
    entries: {
      orderBy: { slot: 'asc' },
      include: { participant: PARTICIPANT },
    },
    shots: {
      orderBy: [{ phase: 'asc' }, { sequence: 'asc' }],
      include: { recordedBy: { select: { name: true, surname: true } } },
    },
  },
} satisfies Prisma.BracketRound$matchesArgs;

const CATEGORY = {
  include: {
    tournament: {
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        judges: { select: { userId: true } },
      },
    },
    scoringFormat: true,
    judge: { select: { id: true, name: true, surname: true } },
    rounds: {
      orderBy: { number: 'asc' },
      include: {
        closedBy: { select: { name: true, surname: true } },
        draws: {
          orderBy: { createdAt: 'desc' },
          include: { drawnBy: { select: { name: true, surname: true } } },
        },
        matches: MATCHES,
      },
    },
  },
} satisfies Prisma.TournamentCategoryDefaultArgs;

type CategoryFull = Prisma.TournamentCategoryGetPayload<typeof CATEGORY>;
type RoundFull = CategoryFull['rounds'][number];
type MatchFull = RoundFull['matches'][number];
type ParticipantRow = Prisma.TournamentParticipantGetPayload<
  typeof PARTICIPANT
>;

const fullName = (p: {
  member: { user: { name: string | null; surname: string | null } };
}) => [p.member.user.name, p.member.user.surname].filter(Boolean).join(' ');

/// Con artículo, para los mensajes («en la final»)
const KIND_LABEL: Record<MatchKind, string> = {
  REGULAR: 'el enfrentamiento',
  THIRD_PLACE: 'el duelo por el 3.er lugar',
  FINAL: 'la final',
};

/**
 * Cuadro de eliminación directa de cada categoría: sorteo de la primera ronda,
 * byes para completar el cuadro, carga de flechas y disparos, cierre
 * (auditoría) de cada ronda y armado de la siguiente.
 */
@Injectable()
export class BracketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly gateway: ScoringGateway,
  ) {}

  // ---------- Vistas ----------

  /// Todo el cuadro de un torneo para el panel (admin y jueces)
  async forStaff(tournamentId: string, user: Staff) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isPublic: true,
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    const categories = await this.prisma.tournamentCategory.findMany({
      where: { tournamentId },
      orderBy: { order: 'asc' },
      ...CATEGORY,
    });
    const people = await this.tournamentPeople(tournamentId);
    const confirmed = await this.prisma.registration.findMany({
      where: { tournamentId, status: RegistrationStatus.CONFIRMED },
      select: { categoryId: true, participant: PARTICIPANT },
      orderBy: { participant: { number: 'asc' } },
    });
    const pending = await this.prisma.registration.groupBy({
      by: ['categoryId'],
      where: { tournamentId, status: RegistrationStatus.PENDING },
      _count: true,
    });
    return {
      tournament,
      categories: categories.map((category) => ({
        ...this.categoryView(category, true, people),
        canScore: this.canScore(user, category),
        canAudit: this.canAudit(user, category),
        canManage: user.role === Role.ADMIN,
        confirmed: confirmed
          .filter((r) => r.categoryId === category.id)
          .map((r) => this.participantView(r.participant)),
        pendingCount:
          pending.find((p) => p.categoryId === category.id)?._count ?? 0,
      })),
    };
  }

  /// Fixture público: resultados sin el detalle de quién cargó cada flecha
  async forPublic(slug: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isPublic: true,
      },
    });
    if (!tournament) throw new NotFoundException('Torneo no encontrado');
    const categories = await this.prisma.tournamentCategory.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { order: 'asc' },
      ...CATEGORY,
    });
    const people = await this.tournamentPeople(tournament.id);
    return {
      tournament,
      categories: categories.map((c) => this.categoryView(c, false, people)),
    };
  }

  /// Un enfrentamiento con todo lo que necesita la pantalla del juez
  async matchDetail(matchId: string, user: Staff) {
    const { category, round, match } = await this.loadMatch(matchId);
    const rules = this.rules(category, round, match.kind);
    const evaluation = this.evaluate(match, rules);
    return {
      tournament: category.tournament,
      category: {
        id: category.id,
        name: category.name,
        mode: category.mode,
        zones: (category.scoringFormat?.zones ?? []) as {
          label: string;
          value: number;
        }[],
      },
      round: {
        id: round.id,
        number: round.number,
        label: roundLabel((round.entrants as string[]).length, round.number),
        closedAt: round.closedAt,
      },
      rules,
      canScore: this.canScore(user, category) && !round.closedAt,
      ...this.matchView(match, evaluation, true),
    };
  }

  // ---------- Sorteo ----------

  /**
   * Sorteo de la primera ronda: los pares y, si los inscritos no son potencia
   * de 2, quiénes pasan por bye. Por algoritmo con una semilla registrada o
   * como lo dictó la tómbola. Las rondas siguientes no se sortean.
   */
  async draw(categoryId: string, dto: DrawDto, user: Staff) {
    const category = await this.loadCategory(categoryId);
    if (category.rounds.length) {
      throw new ConflictException(
        `Los enfrentamientos de «${category.name}» ya se sortearon`,
      );
    }
    const registrations = await this.prisma.registration.findMany({
      where: { categoryId: category.id, status: RegistrationStatus.CONFIRMED },
      select: { participant: { select: { id: true, number: true } } },
    });
    const byNumber = new Map(
      registrations.map((r) => [r.participant.number, r.participant.id]),
    );
    const numbers = [...byNumber.keys()].sort((a, b) => a - b);
    if (numbers.length < 2) {
      throw new BadRequestException(
        'Se necesitan al menos dos inscritos con el pago confirmado',
      );
    }
    if (category.mode === CategoryMode.SCORE && !category.scoringFormatId) {
      throw new BadRequestException(
        `Elige la diana de «${category.name}» antes de sortear`,
      );
    }

    const seed =
      dto.method === 'ALGORITHM' ? dto.seed?.trim() || newSeed() : null;
    if (
      !seed &&
      ![...(dto.pairs ?? []).flat(), ...(dto.byes ?? [])].every(
        Number.isInteger,
      )
    ) {
      throw new BadRequestException(
        'Los pares y los byes deben ser números de participante',
      );
    }
    const result: DrawResult = seed
      ? drawFromShuffle(seededShuffle(numbers, seed))
      : {
          pairs: (dto.pairs ?? []) as [number, number][],
          byes: dto.byes ?? [],
        };
    const invalid = validateDraw(numbers, result);
    if (invalid) throw new BadRequestException(invalid);

    const id = (n: number) => byNumber.get(n)!;
    const entrants = bracketOrder(
      result.pairs.map(([a, b]) => [id(a), id(b)] as [string, string]),
      result.byes.map(id),
    );
    const byeIds = result.byes.map(id);

    await this.prisma.$transaction(async (tx) => {
      const round = await tx.bracketRound.create({
        data: {
          categoryId: category.id,
          number: 1,
          entrants,
          byeIds,
          ...this.roundRules(category),
        },
      });
      await tx.draw.create({
        data: {
          roundId: round.id,
          method: dto.method,
          seed,
          result: result as unknown as Prisma.InputJsonValue,
          drawnById: user.userID,
        },
      });
      await this.createMatches(
        tx,
        round.id,
        buildRoundMatches(entrants, byeIds),
      );
      // Con el primer sorteo el torneo está en curso y su fixture es público
      if (
        category.tournament.status === TournamentStatus.REGISTRATION_OPEN ||
        category.tournament.status === TournamentStatus.DRAFT
      ) {
        await tx.tournament.update({
          where: { id: category.tournament.id },
          data: { status: TournamentStatus.IN_PROGRESS, isPublic: true },
        });
      }
    });
    await this.audit(
      user,
      'BRACKET_DRAW',
      category.id,
      `Sorteo de «${category.name}»`,
      {
        method: dto.method,
        seed,
        result,
      },
    );
    this.changed(category.tournament.id, category.id);
    return { seed, ...result };
  }

  /// Deshace el sorteo mientras la primera ronda no tenga resultados
  async undoDraw(categoryId: string, user: Staff) {
    const category = await this.loadCategory(categoryId);
    const last = category.rounds[category.rounds.length - 1];
    if (!last) throw new BadRequestException('No hay un sorteo que deshacer');
    if (last.number > 1 || last.matches.some((m) => m.shots.length > 0)) {
      throw new ConflictException(
        'La primera ronda ya tiene resultados: no se puede deshacer el sorteo',
      );
    }
    await this.prisma.bracketRound.delete({ where: { id: last.id } });
    await this.audit(
      user,
      'BRACKET_UNDO_DRAW',
      last.id,
      `Sorteo deshecho en «${category.name}»`,
    );
    this.changed(category.tournament.id, category.id);
    return { ok: true };
  }

  // ---------- Rondas ----------

  /// Flechas o dianas de una ronda, antes de que empiece
  async updateRound(roundId: string, dto: UpdateRoundDto, user: Staff) {
    const round = await this.prisma.bracketRound.findUnique({
      where: { id: roundId },
      include: {
        category: { select: { id: true, name: true, tournamentId: true } },
        matches: { select: { _count: { select: { shots: true } } } },
      },
    });
    if (!round) throw new NotFoundException('Ronda no encontrada');
    if (round.closedAt || round.matches.some((m) => m._count.shots > 0)) {
      throw new ConflictException(
        'La ronda ya empezó: no se pueden cambiar sus flechas',
      );
    }
    const updated = await this.prisma.bracketRound.update({
      where: { id: roundId },
      data: {
        arrowsPerArcher:
          dto.arrowsPerArcher === undefined ? undefined : dto.arrowsPerArcher,
        targetsToWin:
          dto.targetsToWin === undefined ? undefined : dto.targetsToWin,
      },
    });
    await this.audit(
      user,
      'BRACKET_ROUND_RULES',
      roundId,
      `Reglas de la ronda ${round.number} de «${round.category.name}»`,
      dto,
    );
    this.changed(round.category.tournamentId, round.category.id);
    return updated;
  }

  /**
   * Auditoría: el juez de la categoría (o un admin) revisó los resultados y
   * cierra la ronda. Recién entonces se arma la siguiente, o termina la
   * categoría si era la final.
   */
  async closeRound(roundId: string, user: Staff) {
    const { category, round } = await this.loadRound(roundId);
    if (!this.canAudit(user, category)) {
      throw new ForbiddenException(
        'Solo el juez de la categoría o un admin cierra la ronda',
      );
    }
    if (round.closedAt) throw new ConflictException('La ronda ya está cerrada');
    const matches = this.roundMatches(category, round);
    if (!isRoundComplete(matches)) {
      throw new BadRequestException(
        'Faltan enfrentamientos por terminar en esta ronda',
      );
    }

    const isFinal = round.matches.some((m) => m.kind === MatchKind.FINAL);
    await this.prisma.$transaction(async (tx) => {
      await tx.bracketRound.update({
        where: { id: round.id },
        data: { closedAt: new Date(), closedById: user.userID },
      });
      if (!isFinal) {
        const entrants = advancing(
          round.entrants as string[],
          round.byeIds,
          matches,
        );
        const losers = semifinalLosers(
          (round.entrants as string[]).length,
          round.byeIds,
          matches,
        );
        const next = await tx.bracketRound.create({
          data: {
            categoryId: category.id,
            number: round.number + 1,
            entrants,
            ...this.roundRules(category),
          },
        });
        await this.createMatches(
          tx,
          next.id,
          buildRoundMatches(entrants, [], losers),
        );
      } else {
        await this.finishTournamentIfDone(tx, category.tournament.id);
      }
    });
    await this.audit(
      user,
      'BRACKET_ROUND_CLOSED',
      round.id,
      `Ronda ${round.number} de «${category.name}» cerrada`,
    );
    this.changed(category.tournament.id, category.id);
    return { ok: true };
  }

  /// Reabre una ronda para corregirla, si la siguiente no tiene resultados
  async reopenRound(roundId: string, user: Staff) {
    const { category, round } = await this.loadRound(roundId);
    if (!round.closedAt)
      throw new BadRequestException('La ronda no está cerrada');
    const next = category.rounds.find((r) => r.number === round.number + 1);
    if (next?.matches.some((m) => m.shots.length > 0)) {
      throw new ConflictException(
        'La ronda siguiente ya tiene resultados: reabre o corrige esa primero',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      if (next) await tx.bracketRound.delete({ where: { id: next.id } });
      await tx.bracketRound.update({
        where: { id: round.id },
        data: { closedAt: null, closedById: null },
      });
      if (category.tournament.status === TournamentStatus.FINISHED) {
        await tx.tournament.update({
          where: { id: category.tournament.id },
          data: { status: TournamentStatus.IN_PROGRESS },
        });
      }
    });
    await this.audit(
      user,
      'BRACKET_ROUND_REOPENED',
      round.id,
      `Ronda ${round.number} de «${category.name}» reabierta`,
    );
    this.changed(category.tournament.id, category.id);
    return { ok: true };
  }

  // ---------- Carga de resultados ----------

  /**
   * Graba flechas (Puntaje) o un disparo de cada arquero (Duelos). Se puede
   * corregir lo ya cargado mientras la ronda no esté cerrada; el ganador se
   * recalcula.
   */
  async recordShots(matchId: string, dto: RecordShotsDto, user: Staff) {
    const { category, round, match } = await this.loadMatch(matchId);
    this.assertCanWrite(user, category, round);
    const rules = this.rules(category, round, match.kind);
    const race = isRace(rules);
    const entryIds = new Set(match.entries.map((e) => e.id));
    const zones = (category.scoringFormat?.zones ?? []) as {
      label: string;
      value: number;
    }[];

    // Se aplican de a una sobre una copia, validando cada una con el estado al que llega
    const shots: Shot[] = match.shots.map((s) => this.toShot(s));
    // Si ya había ganador solo se corrige; un disparo de duelo llega completo,
    // aunque su punto sea el que da la victoria
    const finished =
      evaluateMatch([...entryIds], shots, rules).status === 'FINISHED';
    const key = (s: Pick<Shot, 'entryId' | 'phase' | 'sequence'>) =>
      `${s.entryId}|${s.phase}|${s.sequence}`;
    if (race) {
      const sequences = new Set(dto.shots.map((s) => s.sequence));
      if (sequences.size !== 1 || dto.shots.length !== match.entries.length) {
        throw new BadRequestException(
          'Un disparo de duelo se carga para ambos arqueros a la vez',
        );
      }
      if (dto.shots.filter((s) => s.point).length > 1) {
        throw new BadRequestException(
          'El punto de un disparo es de un solo arquero',
        );
      }
    }

    for (const input of dto.shots) {
      if (!entryIds.has(input.entryId)) {
        throw new BadRequestException(
          'Ese arquero no juega este enfrentamiento',
        );
      }
      const existing = shots.find((s) => key(s) === key(input));
      const before = evaluateMatch([...entryIds], shots, rules);
      let value: number;
      let hit: boolean | null = null;

      if (category.mode === CategoryMode.SCORE) {
        const zone = zones.find((z) => z.label === input.zoneLabel);
        if (!zone) throw new BadRequestException('Elige una zona de la diana');
        value = zone.value;
      } else {
        if (typeof input.hit !== 'boolean') {
          throw new BadRequestException('Indica si abatió la diana');
        }
        hit = input.hit;
        if (race && input.point && !hit) {
          throw new BadRequestException(
            'Solo se lleva el punto quien abatió su diana',
          );
        }
        value = race ? (input.point ? 1 : 0) : hit ? 1 : 0;
      }

      if (!existing) {
        if (finished) {
          throw new ConflictException(
            'El enfrentamiento ya tiene ganador: corrige lo cargado',
          );
        }
        if (input.phase === 'REGULAR') {
          const mine = shots.filter(
            (s) => s.entryId === input.entryId && s.phase === 'REGULAR',
          );
          if (
            !race &&
            (input.sequence > rules.arrows || mine.length >= rules.arrows)
          ) {
            throw new BadRequestException(
              `Son ${rules.arrows} flechas por arquero en esta ronda`,
            );
          }
          const last = Math.max(
            0,
            ...shots
              .filter((s) => s.phase === 'REGULAR')
              .map((s) => s.sequence),
          );
          if (race && input.sequence > last + 1) {
            throw new BadRequestException('Carga los disparos en orden');
          }
        } else {
          if (race)
            throw new BadRequestException(
              'En un duelo se sigue tirando: no hay tandas aparte',
            );
          const k = rules.shootOffArrows;
          const tanda = before.shootOff;
          if (
            !tanda ||
            !tanda.entryIds.includes(input.entryId) ||
            input.sequence <= (tanda.tanda - 1) * k ||
            input.sequence > tanda.tanda * k
          ) {
            throw new BadRequestException('Ese desempate no corresponde ahora');
          }
        }
      }

      const shot: Shot = {
        entryId: input.entryId,
        phase: input.phase,
        sequence: input.sequence,
        value,
        hit,
      };
      if (existing) Object.assign(existing, shot);
      else shots.push(shot);
    }

    await this.prisma.$transaction(
      dto.shots.map((input) => {
        const shot = shots.find((s) => key(s) === key(input))!;
        return this.prisma.matchShot.upsert({
          where: {
            entryId_phase_sequence: {
              entryId: shot.entryId,
              phase: shot.phase,
              sequence: shot.sequence,
            },
          },
          create: {
            matchId,
            entryId: shot.entryId,
            phase: shot.phase,
            sequence: shot.sequence,
            zoneLabel: input.zoneLabel ?? null,
            value: shot.value,
            hit: shot.hit ?? null,
            recordedById: user.userID,
          },
          update: {
            zoneLabel: input.zoneLabel ?? null,
            value: shot.value,
            hit: shot.hit ?? null,
            recordedById: user.userID,
          },
        });
      }),
    );
    const corrected = dto.shots.filter((input) =>
      match.shots.some(
        (s) =>
          s.entryId === input.entryId &&
          s.phase === input.phase &&
          s.sequence === input.sequence,
      ),
    );
    if (corrected.length) {
      await this.audit(
        user,
        'BRACKET_SHOT_CORRECTED',
        matchId,
        `Corrección en ${KIND_LABEL[match.kind]} de «${category.name}»`,
        {
          before: match.shots
            .filter((s) =>
              corrected.some(
                (c) =>
                  c.entryId === s.entryId &&
                  c.phase === s.phase &&
                  c.sequence === s.sequence,
              ),
            )
            .map((s) => this.toShot(s)),
          after: corrected,
        },
      );
    }
    return this.afterChange(category, round.id, matchId, user);
  }

  /// Borra una flecha (Puntaje) o un disparo completo (Duelos)
  async deleteShot(matchId: string, dto: DeleteShotDto, user: Staff) {
    const { category, round, match } = await this.loadMatch(matchId);
    this.assertCanWrite(user, category, round);
    const race = isRace(this.rules(category, round, match.kind));
    if (!race && !dto.entryId) {
      throw new BadRequestException('Indica de qué arquero es la flecha');
    }
    const removed = match.shots.filter(
      (s) =>
        s.phase === dto.phase &&
        s.sequence === dto.sequence &&
        (race || s.entryId === dto.entryId),
    );
    if (!removed.length) throw new NotFoundException('No hay nada cargado ahí');
    await this.prisma.matchShot.deleteMany({
      where: { id: { in: removed.map((s) => s.id) } },
    });
    await this.audit(
      user,
      'BRACKET_SHOT_DELETED',
      matchId,
      `Borrado en ${KIND_LABEL[match.kind]} de «${category.name}»`,
      {
        removed: removed.map((s) => this.toShot(s)),
      },
    );
    return this.afterChange(category, round.id, matchId, user);
  }

  // ---------- Internos ----------

  /// Recalcula el enfrentamiento y avisa al fixture
  private async afterChange(
    category: CategoryFull,
    roundId: string,
    matchId: string,
    user: Staff,
  ) {
    const fresh = await this.loadCategory(category.id);
    const round = fresh.rounds.find((r) => r.id === roundId)!;
    await this.syncMatchStatus(fresh, round);
    this.changed(fresh.tournament.id, fresh.id);
    return this.matchDetail(matchId, user);
  }

  /// Guarda estado y ganador de cada enfrentamiento de la ronda
  private async syncMatchStatus(category: CategoryFull, round: RoundFull) {
    const updates = round.matches.map((match) => {
      const evaluation = this.evaluate(
        match,
        this.rules(category, round, match.kind),
      );
      const winnerId = evaluation.winnerEntryId
        ? match.entries.find((e) => e.id === evaluation.winnerEntryId)!
            .participantId
        : null;
      const finished = evaluation.status === 'FINISHED';
      return this.prisma.match.update({
        where: { id: match.id },
        data: {
          status: evaluation.status,
          winnerId,
          startedAt:
            evaluation.status === 'PENDING'
              ? null
              : (match.startedAt ?? new Date()),
          finishedAt: finished ? (match.finishedAt ?? new Date()) : null,
        },
      });
    });
    await this.prisma.$transaction(updates);
  }

  private async createMatches(
    tx: Prisma.TransactionClient,
    roundId: string,
    matches: { kind: string; order: number; participantIds: string[] }[],
  ) {
    for (const m of matches) {
      await tx.match.create({
        data: {
          roundId,
          kind: m.kind as MatchKind,
          order: m.order,
          entries: {
            create: m.participantIds.map((participantId, i) => ({
              participantId,
              slot: i + 1,
            })),
          },
        },
      });
    }
  }

  private async finishTournamentIfDone(
    tx: Prisma.TransactionClient,
    tournamentId: string,
  ) {
    const categories = await tx.tournamentCategory.findMany({
      where: { tournamentId },
      select: {
        rounds: {
          orderBy: { number: 'desc' },
          take: 1,
          select: { closedAt: true, matches: { select: { kind: true } } },
        },
      },
    });
    const done = categories.every(
      (c) =>
        c.rounds[0]?.closedAt &&
        c.rounds[0].matches.some((m) => m.kind === MatchKind.FINAL),
    );
    if (done) {
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { status: TournamentStatus.FINISHED },
      });
    }
  }

  private assertCanWrite(
    user: Staff,
    category: CategoryFull,
    round: RoundFull,
  ) {
    if (!this.canScore(user, category)) {
      throw new ForbiddenException('No eres juez de esta categoría');
    }
    if (round.closedAt) {
      throw new ConflictException(
        'La ronda está cerrada: un admin debe reabrirla para corregir',
      );
    }
  }

  /// Admin, el juez de la categoría o, si no tiene, cualquier juez del torneo
  private canScore(user: Staff, category: CategoryFull) {
    if (user.role === Role.ADMIN) return true;
    if (category.judgeId) return category.judgeId === user.userID;
    return category.tournament.judges.some((j) => j.userId === user.userID);
  }

  private canAudit(user: Staff, category: CategoryFull) {
    return this.canScore(user, category);
  }

  /// Cada ronda guarda sus flechas y dianas al crearse: cambiar las de la
  /// categoría después solo afecta a las rondas siguientes
  private roundRules(category: CategoryFull) {
    return {
      arrowsPerArcher: category.arrowsPerArcher,
      targetsToWin: category.targetsToWin,
    };
  }

  private rules(
    category: CategoryFull,
    round: RoundFull,
    kind: MatchKind,
  ): MatchRules {
    return {
      mode: category.mode,
      kind,
      arrows: round.arrowsPerArcher ?? category.arrowsPerArcher,
      targetsToWin: round.targetsToWin ?? category.targetsToWin,
      shootOffArrows: category.shootOffArrows,
    };
  }

  private toShot(s: MatchFull['shots'][number]): Shot {
    return {
      entryId: s.entryId,
      phase: s.phase,
      sequence: s.sequence,
      value: s.value,
      hit: s.hit,
    };
  }

  private evaluate(match: MatchFull, rules: MatchRules) {
    return evaluateMatch(
      match.entries.map((e) => e.id),
      match.shots.map((s) => this.toShot(s)),
      rules,
    );
  }

  /// Los enfrentamientos de una ronda en el formato del motor (por participante)
  private roundMatches(category: CategoryFull, round: RoundFull): RoundMatch[] {
    return round.matches.map((match) => {
      const evaluation = this.evaluate(
        match,
        this.rules(category, round, match.kind),
      );
      const byEntry = new Map(
        match.entries.map((e) => [e.id, e.participantId]),
      );
      return {
        kind: match.kind,
        order: match.order,
        participantIds: match.entries.map((e) => e.participantId),
        winnerId: evaluation.winnerEntryId
          ? byEntry.get(evaluation.winnerEntryId)!
          : null,
      };
    });
  }

  /// people: todos los participantes del torneo (también los que pasaron por
  /// bye, que no están en ningún enfrentamiento de su ronda)
  private categoryView(
    category: CategoryFull,
    staff: boolean,
    people: Map<string, ParticipantRow>,
  ) {
    const show = (id: string | null) => {
      const p = id ? people.get(id) : undefined;
      return p ? this.participantView(p) : null;
    };
    const rounds = category.rounds.map((round) => {
      const entrants = round.entrants as string[];
      return {
        id: round.id,
        number: round.number,
        label: roundLabel(entrants.length, round.number),
        entrantsCount: entrants.length,
        /// En orden de cuadro
        entrants: entrants.map(show).filter(Boolean),
        byeIds: round.byeIds,
        /// Pasan directo a la ronda siguiente, en orden de cuadro
        byes: entrants
          .filter((id) => round.byeIds.includes(id))
          .map(show)
          .filter(Boolean),
        arrowsPerArcher: round.arrowsPerArcher ?? category.arrowsPerArcher,
        targetsToWin: round.targetsToWin ?? category.targetsToWin,
        complete: isRoundComplete(this.roundMatches(category, round)),
        closedAt: round.closedAt,
        ...(staff && {
          closedBy: round.closedBy,
          draws: round.draws.map((d) => ({
            id: d.id,
            method: d.method,
            seed: d.seed,
            result: d.result,
            drawnBy: d.drawnBy,
            createdAt: d.createdAt,
          })),
        }),
        matches: round.matches.map((match) =>
          this.matchView(
            match,
            this.evaluate(match, this.rules(category, round, match.kind)),
            staff,
          ),
        ),
      };
    });

    const last = category.rounds[category.rounds.length - 1];
    const finished = Boolean(
      last?.closedAt && last.matches.some((m) => m.kind === MatchKind.FINAL),
    );
    let result = null;
    if (finished) {
      const previous = category.rounds[category.rounds.length - 2];
      const places = podium(
        this.roundMatches(category, last),
        previous ? this.roundMatches(category, previous) : null,
      );
      result = {
        first: show(places.first),
        second: show(places.second),
        third: show(places.third),
      };
    }
    return {
      id: category.id,
      name: category.name,
      mode: category.mode,
      scoringFormat: category.scoringFormat
        ? {
            name: category.scoringFormat.name,
            zones: category.scoringFormat.zones,
          }
        : null,
      arrowsPerArcher: category.arrowsPerArcher,
      targetsToWin: category.targetsToWin,
      shootOffArrows: category.shootOffArrows,
      judge: category.judge,
      status: !category.rounds.length
        ? 'NOT_DRAWN'
        : finished
          ? 'FINISHED'
          : 'IN_PROGRESS',
      podium: result,
      rounds,
    };
  }

  private matchView(
    match: MatchFull,
    evaluation: MatchEvaluation,
    staff: boolean,
  ) {
    return {
      id: match.id,
      kind: match.kind,
      order: match.order,
      status: evaluation.status,
      shootOff: evaluation.shootOff,
      winnerEntryId: evaluation.winnerEntryId,
      updatedAt: match.updatedAt,
      entries: match.entries.map((e) => ({
        id: e.id,
        slot: e.slot,
        ...this.participantView(e.participant),
        total: evaluation.totals[e.id],
        hits: evaluation.hits[e.id],
        shootOffTotal: match.shots
          .filter((s) => s.entryId === e.id && s.phase === 'SHOOT_OFF')
          .reduce((t, s) => t + s.value, 0),
      })),
      shots: match.shots.map((s) => ({
        id: s.id,
        entryId: s.entryId,
        phase: s.phase,
        sequence: s.sequence,
        zoneLabel: s.zoneLabel,
        value: s.value,
        hit: s.hit,
        ...(staff && { recordedBy: s.recordedBy, updatedAt: s.updatedAt }),
      })),
    };
  }

  private participantView(p: ParticipantRow) {
    return { participantId: p.id, number: p.number, name: fullName(p) };
  }

  private async tournamentPeople(tournamentId: string) {
    const rows = await this.prisma.tournamentParticipant.findMany({
      where: { tournamentId },
      ...PARTICIPANT,
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  private async loadCategory(id: string): Promise<CategoryFull> {
    const category = await this.prisma.tournamentCategory.findUnique({
      where: { id },
      ...CATEGORY,
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  private async loadRound(roundId: string) {
    const row = await this.prisma.bracketRound.findUnique({
      where: { id: roundId },
      select: { categoryId: true },
    });
    if (!row) throw new NotFoundException('Ronda no encontrada');
    const category = await this.loadCategory(row.categoryId);
    return { category, round: category.rounds.find((r) => r.id === roundId)! };
  }

  private async loadMatch(matchId: string) {
    const row = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { roundId: true },
    });
    if (!row) throw new NotFoundException('Enfrentamiento no encontrado');
    const { category, round } = await this.loadRound(row.roundId);
    return {
      category,
      round,
      match: round.matches.find((m) => m.id === matchId)!,
    };
  }

  private changed(tournamentId: string, categoryId: string) {
    this.gateway.emitBracket(tournamentId, {
      tournamentId,
      categoryId,
      at: Date.now(),
    });
  }

  private audit(
    user: Staff,
    action: string,
    entityId: string,
    message: string,
    data?: unknown,
  ) {
    return this.logger.log({
      level: 'INFO',
      message,
      action,
      entityType: 'Bracket',
      entityId,
      userId: user.userID,
      data,
    });
  }
}
