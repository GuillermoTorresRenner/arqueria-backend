import {
  advancing,
  buildRoundMatches,
  drawFromShuffle,
  evaluateMatch,
  isRoundComplete,
  MatchRules,
  planDerived,
  podium,
  RoundMatch,
  semifinalLosers,
  Shot,
  validateDraw,
} from './bracket-engine';

const SCORE: MatchRules = {
  mode: 'SCORE',
  kind: 'REGULAR',
  arrows: 3,
  targetsToWin: 3,
  shootOffArrows: 1,
};
const DUEL: MatchRules = { ...SCORE, mode: 'KNOCKDOWN' };

const arrows = (
  entryId: string,
  values: number[],
  phase: Shot['phase'] = 'REGULAR',
  from = 1,
) => values.map((value, i) => ({ entryId, phase, sequence: from + i, value }));

describe('evaluateMatch · Puntaje', () => {
  it('sin flechas está pendiente y a medias sigue en curso', () => {
    expect(evaluateMatch(['a', 'b'], [], SCORE).status).toBe('PENDING');
    const half = evaluateMatch(
      ['a', 'b'],
      [...arrows('a', [2, 2, 2]), ...arrows('b', [1])],
      SCORE,
    );
    expect(half).toMatchObject({ status: 'IN_PROGRESS', winnerEntryId: null });
  });

  it('gana la suma mayor tras tirar todas las flechas', () => {
    const r = evaluateMatch(
      ['a', 'b'],
      [...arrows('a', [2, 1, 0]), ...arrows('b', [2, 2, 0])],
      SCORE,
    );
    expect(r).toMatchObject({
      status: 'FINISHED',
      winnerEntryId: 'b',
      totals: { a: 3, b: 4 },
    });
  });

  it('empate: pide tandas de desempate hasta que alguien gane', () => {
    const tied = [...arrows('a', [2, 1, 1]), ...arrows('b', [1, 2, 1])];
    expect(evaluateMatch(['a', 'b'], tied, SCORE)).toMatchObject({
      status: 'IN_PROGRESS',
      shootOff: { tanda: 1, entryIds: ['a', 'b'] },
    });
    // Tanda 1 vuelve a empatar
    const t1 = [
      ...tied,
      ...arrows('a', [1], 'SHOOT_OFF'),
      ...arrows('b', [1], 'SHOOT_OFF'),
    ];
    expect(evaluateMatch(['a', 'b'], t1, SCORE).shootOff).toEqual({
      tanda: 2,
      entryIds: ['a', 'b'],
    });
    // Tanda 2 la gana b
    const t2 = [
      ...t1,
      ...arrows('a', [0], 'SHOOT_OFF', 2),
      ...arrows('b', [2], 'SHOOT_OFF', 2),
    ];
    expect(evaluateMatch(['a', 'b'], t2, SCORE)).toMatchObject({
      status: 'FINISHED',
      winnerEntryId: 'b',
    });
  });

  it('tandas de varias flechas cuentan la suma de la tanda', () => {
    const rules = { ...SCORE, shootOffArrows: 2 };
    const shots = [
      ...arrows('a', [1, 1, 1]),
      ...arrows('b', [1, 1, 1]),
      ...arrows('a', [2, 0], 'SHOOT_OFF'),
      ...arrows('b', [1], 'SHOOT_OFF'),
    ];
    expect(evaluateMatch(['a', 'b'], shots, rules).status).toBe('IN_PROGRESS');
    shots.push(...arrows('b', [2], 'SHOOT_OFF', 2));
    expect(evaluateMatch(['a', 'b'], shots, rules)).toMatchObject({
      winnerEntryId: 'b',
    });
  });

  it('minironda de tres: el desempate sigue solo entre los que empatan arriba', () => {
    const rules = { ...SCORE, kind: 'PLAYOFF' as const, arrows: 1 };
    const shots = [
      ...arrows('a', [2]),
      ...arrows('b', [2]),
      ...arrows('c', [1]),
    ];
    expect(evaluateMatch(['a', 'b', 'c'], shots, rules).shootOff).toEqual({
      tanda: 1,
      entryIds: ['a', 'b'],
    });
    shots.push(
      ...arrows('a', [0], 'SHOOT_OFF'),
      ...arrows('b', [1], 'SHOOT_OFF'),
    );
    expect(evaluateMatch(['a', 'b', 'c'], shots, rules).winnerEntryId).toBe(
      'b',
    );
  });
});

describe('evaluateMatch · Duelos', () => {
  const volley = (
    sequence: number,
    point: 'a' | 'b' | null,
    hits: string[] = point ? [point] : [],
  ) =>
    ['a', 'b'].map((entryId) => ({
      entryId,
      phase: 'REGULAR' as const,
      sequence,
      value: point === entryId ? 1 : 0,
      hit: hits.includes(entryId),
    }));

  it('gana el primero que llega a las dianas fijadas', () => {
    const shots = [
      ...volley(1, 'a'),
      ...volley(2, 'b'),
      ...volley(3, 'a'),
      ...volley(4, 'a'),
    ];
    expect(evaluateMatch(['a', 'b'], shots, DUEL)).toMatchObject({
      status: 'FINISHED',
      winnerEntryId: 'a',
      totals: { a: 3, b: 1 },
    });
  });

  it('un disparo sin punto (nadie abatió o empate al centro) no suma', () => {
    const shots = [
      ...volley(1, null),
      ...volley(2, null, ['a', 'b']),
      ...volley(3, 'b', ['a', 'b']),
    ];
    const r = evaluateMatch(['a', 'b'], shots, DUEL);
    expect(r).toMatchObject({
      status: 'IN_PROGRESS',
      totals: { a: 0, b: 1 },
      hits: { a: 2, b: 2 },
    });
  });
});

describe('ronda impar', () => {
  const match = (
    order: number,
    a: string,
    b: string,
    winner: string | null,
    scores: [number, number],
  ): RoundMatch => ({
    kind: 'REGULAR',
    order,
    participantIds: [a, b],
    winnerId: winner,
    scores: { [a]: scores[0], [b]: scores[1] },
    hasShots: true,
  });

  it('espera a que terminen los enfrentamientos del cuadro', () => {
    expect(
      planDerived('z', [
        match(0, 'a', 'b', 'a', [5, 3]),
        match(1, 'c', 'd', null, [0, 0]),
      ]),
    ).toEqual({
      playoff: null,
      repechage: null,
    });
  });

  it('el mejor perdedor va al repechaje contra el que quedó sin rival', () => {
    const matches = [
      match(0, 'a', 'b', 'a', [5, 3]),
      match(1, 'c', 'd', 'c', [6, 4]),
    ];
    expect(planDerived('z', matches)).toEqual({
      playoff: null,
      repechage: ['z', 'd'],
    });
  });

  it('perdedores empatados juegan una minironda; su ganador va al repechaje', () => {
    const matches = [
      match(0, 'a', 'b', 'a', [5, 4]),
      match(1, 'c', 'd', 'c', [6, 4]),
    ];
    expect(planDerived('z', matches)).toEqual({
      playoff: ['b', 'd'],
      repechage: null,
    });
    matches.push({
      kind: 'PLAYOFF',
      order: 0,
      participantIds: ['b', 'd'],
      winnerId: 'd',
      scores: {},
      hasShots: true,
    });
    expect(planDerived('z', matches)).toEqual({
      playoff: ['b', 'd'],
      repechage: ['z', 'd'],
    });
  });

  it('pasan los ganadores en orden y el del repechaje ocupa el lugar del sin rival', () => {
    const matches: RoundMatch[] = [
      match(1, 'c', 'd', 'd', [1, 2]),
      match(0, 'a', 'b', 'a', [2, 1]),
      {
        kind: 'REPECHAGE',
        order: 0,
        participantIds: ['z', 'c'],
        winnerId: 'c',
        scores: {},
        hasShots: true,
      },
    ];
    expect(isRoundComplete('z', matches)).toBe(true);
    expect(advancing('z', matches)).toEqual(['a', 'd', 'c']);
  });
});

describe('armado de rondas', () => {
  it('con 2 es final; si vienen de semifinal, también 3.er lugar', () => {
    expect(buildRoundMatches(['a', 'b'], null).map((m) => m.kind)).toEqual([
      'FINAL',
    ]);
    expect(buildRoundMatches(['a', 'b'], null, ['c', 'd'])).toEqual([
      { kind: 'FINAL', order: 0, participantIds: ['a', 'b'] },
      { kind: 'THIRD_PLACE', order: 0, participantIds: ['c', 'd'] },
    ]);
  });

  it('impar: el sin rival espera y el resto se cruza de a dos en orden', () => {
    expect(
      buildRoundMatches(['a', 'b', 'c', 'd', 'e'], 'c').map(
        (m) => m.participantIds,
      ),
    ).toEqual([
      ['a', 'b'],
      ['d', 'e'],
    ]);
    expect(() => buildRoundMatches(['a', 'b', 'c'], null)).toThrow(/sortear/);
  });

  it('solo una ronda de 4 sin sin rival da perdedores de semifinal', () => {
    const m = (order: number, a: string, b: string, w: string): RoundMatch => ({
      kind: 'REGULAR',
      order,
      participantIds: [a, b],
      winnerId: w,
      scores: {},
      hasShots: true,
    });
    expect(
      semifinalLosers(4, null, [m(0, 'a', 'b', 'a'), m(1, 'c', 'd', 'd')]),
    ).toEqual(['b', 'c']);
    expect(semifinalLosers(3, 'z', [m(0, 'a', 'b', 'a')])).toBeNull();
  });
});

describe('sorteo', () => {
  it('valida que cada número aparezca una vez y el sin rival según la paridad', () => {
    const numbers = [1, 2, 3, 4, 5];
    expect(
      validateDraw(numbers, {
        pairs: [
          [1, 4],
          [2, 5],
        ],
        bye: 3,
      }),
    ).toBeNull();
    expect(
      validateDraw(numbers, {
        pairs: [
          [1, 4],
          [2, 5],
        ],
        bye: null,
      }),
    ).toMatch(/sin rival/);
    expect(
      validateDraw(numbers, {
        pairs: [
          [1, 4],
          [1, 5],
        ],
        bye: 3,
      }),
    ).toMatch(/más de una vez/);
    expect(validateDraw(numbers, { pairs: [[1, 4]], bye: 3 })).toMatch(
      /Falta ubicar: n.º 2, n.º 5/,
    );
    expect(
      validateDraw(numbers, {
        pairs: [
          [1, 9],
          [2, 5],
        ],
        bye: 3,
      }),
    ).toMatch(/n.º 9 no está/);
    expect(validateDraw([1, 2], { pairs: [[1, 2]], bye: 3 })).toMatch(
      /n.º 3 no está/,
    );
  });

  it('el algoritmo empareja de a dos y deja al último sin rival', () => {
    expect(drawFromShuffle([4, 1, 3, 2, 5])).toEqual({
      pairs: [
        [4, 1],
        [3, 2],
      ],
      bye: 5,
    });
    expect(drawFromShuffle([2, 1])).toEqual({ pairs: [[2, 1]], bye: null });
  });
});

/**
 * Simula torneos completos con resultados al azar: el cuadro siempre termina,
 * con un campeón y un podio de arqueros distintos, y nadie juega después de
 * quedar eliminado.
 */
describe('simulación de torneos completos', () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const play = (
    kind: RoundMatch['kind'],
    order: number,
    ids: string[],
  ): RoundMatch => {
    const winner = ids[Math.floor(random() * ids.length)];
    // Puntajes chicos: provocan empates entre perdedores y minirondas
    const scores = Object.fromEntries(
      ids.map((id) => [id, Math.floor(random() * 3)]),
    );
    return {
      kind,
      order,
      participantIds: ids,
      winnerId: winner,
      scores,
      hasShots: true,
    };
  };

  for (let n = 2; n <= 16; n++) {
    it(`${n} arqueros`, () => {
      const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
      const eliminated = new Set<string>();
      let entrants = ids;
      let previous: {
        matches: RoundMatch[];
        count: number;
        bye: string | null;
      } | null = null;
      let rounds: RoundMatch[][] = [];

      for (let guard = 0; guard < 20; guard++) {
        const bye =
          entrants.length % 2 === 1 && entrants.length > 2
            ? entrants[entrants.length - 1]
            : null;
        const losers = previous
          ? semifinalLosers(previous.count, previous.bye, previous.matches)
          : null;
        const built = buildRoundMatches(entrants, bye, losers);
        const matches = built.map((m) =>
          play(m.kind, m.order, m.participantIds),
        );
        let plan = planDerived(bye, matches);
        if (plan.playoff) {
          matches.push(play('PLAYOFF', 0, plan.playoff));
          plan = planDerived(bye, matches);
        }
        if (plan.repechage)
          matches.push(play('REPECHAGE', 0, [...plan.repechage]));
        expect(isRoundComplete(bye, matches)).toBe(true);
        for (const m of matches) {
          for (const id of m.participantIds)
            expect(eliminated.has(id)).toBe(false);
        }
        rounds.push(matches);
        if (matches.some((m) => m.kind === 'FINAL')) break;

        const next = advancing(bye, matches);
        for (const id of entrants) if (!next.includes(id)) eliminated.add(id);
        // Los perdedores de semifinal siguen vivos para el 3.er lugar
        const sf = semifinalLosers(entrants.length, bye, matches);
        sf?.forEach((id) => eliminated.delete(id));
        previous = { matches, count: entrants.length, bye };
        entrants = next;
      }

      const final = rounds[rounds.length - 1];
      const result = podium(
        final,
        rounds.length > 1 ? rounds[rounds.length - 2] : null,
      );
      expect(result.first).toBeTruthy();
      expect(result.second).toBeTruthy();
      if (n >= 3) expect(result.third).toBeTruthy();
      const placed = [result.first, result.second, result.third].filter(
        Boolean,
      );
      expect(new Set(placed).size).toBe(placed.length);
      rounds = [];
    });
  }
});
