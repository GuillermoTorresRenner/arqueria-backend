import {
  advancing,
  bracketOrder,
  bracketSize,
  buildRoundMatches,
  byeCount,
  drawFromShuffle,
  evaluateMatch,
  isRoundComplete,
  MatchRules,
  podium,
  roundLabel,
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

describe('sistema bye', () => {
  const match = (order: number, a: string, b: string, winner: string) => ({
    kind: 'REGULAR' as const,
    order,
    participantIds: [a, b],
    winnerId: winner,
  });

  it('completa el cuadro a la potencia de 2 siguiente', () => {
    expect([2, 3, 4, 5, 8, 9, 13, 16].map(bracketSize)).toEqual([
      2, 4, 4, 8, 8, 16, 16, 16,
    ]);
    expect([2, 3, 4, 5, 8, 9, 13, 16].map(byeCount)).toEqual([
      0, 1, 0, 3, 0, 7, 3, 0,
    ]);
  });

  it('intercala byes y enfrentamientos en el orden de cuadro', () => {
    // 6 arqueros: 2 byes y 2 enfrentamientos
    expect(
      bracketOrder(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        ['x', 'y'],
      ),
    ).toEqual(['x', 'a', 'b', 'y', 'c', 'd']);
    // 5 arqueros: sobran byes y se cruzan entre sí en la segunda ronda
    expect(bracketOrder([['a', 'b']], ['x', 'y', 'z'])).toEqual([
      'x',
      'a',
      'b',
      'y',
      'z',
    ]);
  });

  it('los byes no juegan y el resto se cruza de a dos en orden', () => {
    const entrants = ['x', 'a', 'b', 'y', 'c', 'd'];
    expect(
      buildRoundMatches(entrants, ['x', 'y']).map((m) => m.participantIds),
    ).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(() => buildRoundMatches(entrants, ['x'])).toThrow(/2 por bye/);
    expect(() => buildRoundMatches(['a', 'b', 'c'], [])).toThrow(/bye/);
  });

  it('pasan byes y ganadores conservando su lugar en el cuadro', () => {
    const entrants = ['x', 'a', 'b', 'y', 'c', 'd'];
    const matches = [match(1, 'c', 'd', 'd'), match(0, 'a', 'b', 'a')];
    expect(isRoundComplete(matches)).toBe(true);
    const next = advancing(entrants, ['x', 'y'], matches);
    expect(next).toEqual(['x', 'a', 'y', 'd']);
    // Cada bye espera al ganador de un enfrentamiento
    expect(buildRoundMatches(next, []).map((m) => m.participantIds)).toEqual([
      ['x', 'a'],
      ['y', 'd'],
    ]);
  });

  it('una ronda con enfrentamientos sin terminar no está completa', () => {
    expect(isRoundComplete([])).toBe(false);
    expect(
      isRoundComplete([{ ...match(0, 'a', 'b', 'a'), winnerId: null }]),
    ).toBe(false);
  });

  it('nombra la ronda por el tamaño del cuadro', () => {
    expect(roundLabel(13, 1)).toBe('Octavos de final');
    expect(roundLabel(5, 1)).toBe('Cuartos de final');
    expect(roundLabel(3, 1)).toBe('Semifinal');
  });
});

describe('armado de rondas', () => {
  it('con 2 es final; si vienen de semifinal, también 3.er lugar', () => {
    expect(buildRoundMatches(['a', 'b'], []).map((m) => m.kind)).toEqual([
      'FINAL',
    ]);
    expect(buildRoundMatches(['a', 'b'], [], ['c', 'd'])).toEqual([
      { kind: 'FINAL', order: 0, participantIds: ['a', 'b'] },
      { kind: 'THIRD_PLACE', order: 0, participantIds: ['c', 'd'] },
    ]);
  });

  it('solo una ronda de 4 sin byes da perdedores de semifinal', () => {
    const m = (order: number, a: string, b: string, w: string): RoundMatch => ({
      kind: 'REGULAR',
      order,
      participantIds: [a, b],
      winnerId: w,
    });
    expect(
      semifinalLosers(4, [], [m(0, 'a', 'b', 'a'), m(1, 'c', 'd', 'd')]),
    ).toEqual(['b', 'c']);
    expect(semifinalLosers(3, ['z'], [m(0, 'a', 'b', 'a')])).toBeNull();
  });
});

describe('sorteo', () => {
  it('valida que cada número aparezca una vez y los byes que completan el cuadro', () => {
    const numbers = [1, 2, 3, 4, 5, 6];
    const pairs: [number, number][] = [
      [1, 4],
      [2, 5],
    ];
    expect(validateDraw(numbers, { pairs, byes: [3, 6] })).toBeNull();
    expect(validateDraw(numbers, { pairs, byes: [3] })).toMatch(
      /cuadro es de 8: pasan 2 por bye/,
    );
    expect(
      validateDraw(numbers, {
        pairs: [
          [1, 4],
          [1, 5],
        ],
        byes: [3, 6],
      }),
    ).toMatch(/más de una vez/);
    expect(validateDraw(numbers, { pairs: [[1, 4]], byes: [3, 6] })).toMatch(
      /Falta ubicar: n.º 2, n.º 5/,
    );
    expect(
      validateDraw(numbers, {
        pairs: [
          [1, 9],
          [2, 5],
        ],
        byes: [3, 6],
      }),
    ).toMatch(/n.º 9 no está/);
    expect(validateDraw([1, 2], { pairs: [[1, 2]], byes: [3] })).toMatch(
      /n.º 3 no está/,
    );
    expect(
      validateDraw([1, 2, 3, 4], { pairs: [[1, 2]], byes: [3, 4] }),
    ).toMatch(/nadie pasa por bye/);
  });

  it('el algoritmo da los byes a los primeros y empareja al resto', () => {
    expect(drawFromShuffle([4, 1, 3, 2, 5])).toEqual({
      pairs: [[2, 5]],
      byes: [4, 1, 3],
    });
    expect(drawFromShuffle([2, 1])).toEqual({ pairs: [[2, 1]], byes: [] });
  });
});

/**
 * Simula torneos completos con resultados al azar: el cuadro siempre termina,
 * con un campeón y un podio de arqueros distintos, nadie juega después de
 * quedar eliminado y, tras la primera ronda, todas son potencia de 2.
 */
describe('simulación de torneos completos', () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const play = (
    kind: RoundMatch['kind'],
    order: number,
    ids: string[],
  ): RoundMatch => ({
    kind,
    order,
    participantIds: ids,
    winnerId: ids[Math.floor(random() * ids.length)],
  });
  const shuffle = <T>(items: T[]) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };

  for (let n = 2; n <= 33; n++) {
    it(`${n} arqueros`, () => {
      const numbers = Array.from({ length: n }, (_, i) => i + 1);
      const draw = drawFromShuffle(shuffle(numbers));
      expect(validateDraw(numbers, draw)).toBeNull();
      const id = (k: number) => `p${k}`;
      let byes = draw.byes.map(id);
      let entrants = bracketOrder(
        draw.pairs.map(([a, b]) => [id(a), id(b)] as [string, string]),
        byes,
      );
      const eliminated = new Set<string>();
      let previous: {
        matches: RoundMatch[];
        count: number;
        byes: string[];
      } | null = null;
      const rounds: RoundMatch[][] = [];

      for (let guard = 0; guard < 20; guard++) {
        if (rounds.length) expect(byeCount(entrants.length)).toBe(0);
        const losers = previous
          ? semifinalLosers(previous.count, previous.byes, previous.matches)
          : null;
        const matches = buildRoundMatches(entrants, byes, losers).map((m) =>
          play(m.kind, m.order, m.participantIds),
        );
        expect(isRoundComplete(matches)).toBe(true);
        for (const m of matches) {
          for (const p of m.participantIds)
            expect(eliminated.has(p)).toBe(false);
        }
        rounds.push(matches);
        if (matches.some((m) => m.kind === 'FINAL')) break;

        const next = advancing(entrants, byes, matches);
        for (const p of entrants) if (!next.includes(p)) eliminated.add(p);
        // Los perdedores de semifinal siguen vivos para el 3.er lugar
        const sf = semifinalLosers(entrants.length, byes, matches);
        sf?.forEach((p) => eliminated.delete(p));
        previous = { matches, count: entrants.length, byes };
        entrants = next;
        byes = [];
      }

      // Ningún bye juega la primera ronda
      for (const b of draw.byes.map(id))
        expect(rounds[0].some((m) => m.participantIds.includes(b))).toBe(false);
      const result = podium(
        rounds[rounds.length - 1],
        rounds.length > 1 ? rounds[rounds.length - 2] : null,
      );
      expect(result.first).toBeTruthy();
      expect(result.second).toBeTruthy();
      if (n >= 3) expect(result.third).toBeTruthy();
      const placed = [result.first, result.second, result.third].filter(
        Boolean,
      );
      expect(new Set(placed).size).toBe(placed.length);
    });
  }
});
