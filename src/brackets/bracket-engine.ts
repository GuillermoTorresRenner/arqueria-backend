/**
 * Reglas del cuadro de eliminación directa, sin base de datos: a partir de las
 * flechas o disparos cargados deciden quién gana cada enfrentamiento, qué
 * enfrentamientos extra necesita una ronda impar y cómo se arma la siguiente.
 *
 * Reglamento del club:
 * - Puntaje: cada arquero tira las flechas de la ronda y gana la suma mayor.
 *   Si empatan, tandas de desempate (muerte súbita) hasta que alguien gane.
 * - Duelos: gana el primero que abate las dianas fijadas. En cada disparo el
 *   punto es de quien abatió primero o, si fue simultáneo, de quien quedó más
 *   cerca del centro; si no se puede separar, nadie suma y se sigue tirando.
 * - Ronda impar: un sorteo deja a uno sin rival, que se enfrenta al mejor
 *   perdedor (más puntos en Puntaje, más dianas abatidas en Duelos). Si varios
 *   perdedores empatan, juegan una minironda entre ellos.
 * - Los perdedores de semifinales disputan el 3.er lugar.
 */

export type Mode = 'SCORE' | 'KNOCKDOWN';
export type Kind =
  'REGULAR' | 'REPECHAGE' | 'PLAYOFF' | 'THIRD_PLACE' | 'FINAL';
export type Phase = 'REGULAR' | 'SHOOT_OFF';

export interface Shot {
  entryId: string;
  phase: Phase;
  sequence: number;
  /// Puntaje: puntos de la zona. Duelos: 1 si se llevó el punto del disparo.
  value: number;
  /// Duelos: abatió su diana
  hit?: boolean | null;
}

export interface MatchRules {
  mode: Mode;
  kind: Kind;
  /// Flechas por arquero (Puntaje y minirondas)
  arrows: number;
  /// Duelos: dianas para ganar
  targetsToWin: number;
  /// Flechas por arquero en cada tanda de desempate
  shootOffArrows: number;
}

export interface MatchEvaluation {
  status: 'PENDING' | 'IN_PROGRESS' | 'FINISHED';
  winnerEntryId: string | null;
  /// Puntos de la fase regular: suma de flechas, o puntos de duelo
  totals: Record<string, number>;
  /// Dianas abatidas (Duelos y minirondas de Duelos)
  hits: Record<string, number>;
  /// Desempate en curso: la tanda que falta y quiénes la tiran
  shootOff: { tanda: number; entryIds: string[] } | null;
}

/// ¿Se gana llegando primero a N (duelo) o por la suma mayor?
export function isRace(rules: Pick<MatchRules, 'mode' | 'kind'>) {
  return rules.mode === 'KNOCKDOWN' && rules.kind !== 'PLAYOFF';
}

const sum = (shots: Shot[]) => shots.reduce((total, s) => total + s.value, 0);

export function evaluateMatch(
  entryIds: string[],
  shots: Shot[],
  rules: MatchRules,
): MatchEvaluation {
  const regular = shots.filter((s) => s.phase === 'REGULAR');
  const of = (id: string, list: Shot[]) => list.filter((s) => s.entryId === id);
  const totals = Object.fromEntries(
    entryIds.map((id) => [id, sum(of(id, regular))]),
  );
  const hits = Object.fromEntries(
    entryIds.map((id) => [id, of(id, regular).filter((s) => s.hit).length]),
  );
  const base = { totals, hits, shootOff: null };
  const started = shots.length > 0;

  if (isRace(rules)) {
    const winner = entryIds.find((id) => totals[id] >= rules.targetsToWin);
    return winner
      ? { ...base, status: 'FINISHED', winnerEntryId: winner }
      : {
          ...base,
          status: started ? 'IN_PROGRESS' : 'PENDING',
          winnerEntryId: null,
        };
  }

  // Suma mayor tras tirar todos sus flechas
  const complete = entryIds.every(
    (id) => of(id, regular).length >= rules.arrows,
  );
  if (!complete) {
    return {
      ...base,
      status: started ? 'IN_PROGRESS' : 'PENDING',
      winnerEntryId: null,
    };
  }
  let leaders = topOf(entryIds, (id) => totals[id]);

  // Desempate por tandas entre los que siguen empatados
  const shootOff = shots.filter((s) => s.phase === 'SHOOT_OFF');
  const k = rules.shootOffArrows;
  for (let tanda = 1; leaders.length > 1; tanda++) {
    const inTanda = (id: string) =>
      of(id, shootOff).filter(
        (s) => s.sequence > (tanda - 1) * k && s.sequence <= tanda * k,
      );
    if (!leaders.every((id) => inTanda(id).length >= k)) {
      return {
        ...base,
        status: 'IN_PROGRESS',
        winnerEntryId: null,
        shootOff: { tanda, entryIds: leaders },
      };
    }
    leaders = topOf(leaders, (id) => sum(inTanda(id)));
  }
  return { ...base, status: 'FINISHED', winnerEntryId: leaders[0] };
}

function topOf(ids: string[], score: (id: string) => number) {
  const best = Math.max(...ids.map(score));
  return ids.filter((id) => score(id) === best);
}

/// Puntaje con el que se compara a los perdedores de una ronda impar
export function loserScore(
  evaluation: MatchEvaluation,
  entryId: string,
  mode: Mode,
) {
  return mode === 'KNOCKDOWN'
    ? evaluation.hits[entryId]
    : evaluation.totals[entryId];
}

// ---------- Rondas ----------

export interface RoundMatch {
  kind: Kind;
  order: number;
  /// Participantes del enfrentamiento, en orden de lado
  participantIds: string[];
  /// null mientras no termina
  winnerId: string | null;
  /// Puntaje de cada participante para elegir al mejor perdedor
  scores: Record<string, number>;
  hasShots: boolean;
}

export interface DerivedPlan {
  /// Minironda entre perdedores empatados por el mejor puntaje
  playoff: string[] | null;
  /// Repechaje: [sin rival, mejor perdedor]
  repechage: [string, string] | null;
}

/**
 * Enfrentamientos extra de una ronda impar. Mientras falte terminar los del
 * cuadro (o la minironda) no se define el repechaje.
 */
export function planDerived(
  byeId: string | null,
  matches: RoundMatch[],
): DerivedPlan {
  const none = { playoff: null, repechage: null };
  if (!byeId) return none;
  const regular = matches.filter((m) => m.kind === 'REGULAR');
  if (!regular.length || regular.some((m) => !m.winnerId)) return none;

  const losers = regular.flatMap((m) =>
    m.participantIds
      .filter((id) => id !== m.winnerId)
      .map((id) => ({ id, score: m.scores[id] ?? 0 })),
  );
  const best = Math.max(...losers.map((l) => l.score));
  const tied = losers.filter((l) => l.score === best).map((l) => l.id);
  if (tied.length === 1) return { playoff: null, repechage: [byeId, tied[0]] };

  const playoff = matches.find((m) => m.kind === 'PLAYOFF');
  return {
    playoff: tied,
    repechage: playoff?.winnerId ? [byeId, playoff.winnerId] : null,
  };
}

/// La ronda terminó: todos sus enfrentamientos, incluidos los extra, tienen ganador
export function isRoundComplete(byeId: string | null, matches: RoundMatch[]) {
  if (!matches.length || matches.some((m) => !m.winnerId)) return false;
  if (!byeId) return true;
  return matches.some((m) => m.kind === 'REPECHAGE');
}

/// Quiénes pasan, en orden de cuadro: el ganador del repechaje toma el lugar
/// del que quedó sin rival (al final)
export function advancing(
  byeId: string | null,
  matches: RoundMatch[],
): string[] {
  const regular = [...matches]
    .filter((m) => m.kind === 'REGULAR')
    .sort((a, b) => a.order - b.order)
    .map((m) => m.winnerId!);
  const repechage = matches.find((m) => m.kind === 'REPECHAGE');
  return byeId && repechage ? [...regular, repechage.winnerId!] : regular;
}

export interface NewMatch {
  kind: Kind;
  order: number;
  participantIds: string[];
}

/**
 * Enfrentamientos de una ronda a partir de sus arqueros en orden de cuadro.
 * - 2 arqueros: final, más el 3.er lugar si vienen de una semifinal (4 → 2).
 * - Par: de a dos en orden.
 * - Impar: el que quedó sin rival (ya sorteado) espera; el resto, de a dos.
 */
export function buildRoundMatches(
  entrants: string[],
  byeId: string | null,
  semifinalLosers: string[] | null = null,
): NewMatch[] {
  if (entrants.length < 2)
    throw new Error('Una ronda necesita al menos dos arqueros');
  if (entrants.length === 2) {
    const final: NewMatch[] = [
      { kind: 'FINAL', order: 0, participantIds: [...entrants] },
    ];
    if (semifinalLosers?.length === 2) {
      final.push({
        kind: 'THIRD_PLACE',
        order: 0,
        participantIds: [...semifinalLosers],
      });
    }
    return final;
  }
  const odd = entrants.length % 2 === 1;
  if (odd && (!byeId || !entrants.includes(byeId))) {
    throw new Error('Una ronda impar necesita sortear quién queda sin rival');
  }
  if (!odd && byeId)
    throw new Error('Una ronda par no tiene arquero sin rival');
  const paired = entrants.filter((id) => id !== byeId);
  const matches: NewMatch[] = [];
  for (let i = 0; i < paired.length; i += 2) {
    matches.push({
      kind: 'REGULAR',
      order: i / 2,
      participantIds: [paired[i], paired[i + 1]],
    });
  }
  return matches;
}

/// Perdedores de una ronda de 4 sin arquero sin rival: van por el 3.er lugar
export function semifinalLosers(
  entrantsCount: number,
  byeId: string | null,
  matches: RoundMatch[],
): string[] | null {
  if (entrantsCount !== 4 || byeId) return null;
  const losers = matches
    .filter((m) => m.kind === 'REGULAR' && m.winnerId)
    .sort((a, b) => a.order - b.order)
    .flatMap((m) => m.participantIds.filter((id) => id !== m.winnerId));
  return losers.length === 2 ? losers : null;
}

export interface Podium {
  first: string | null;
  second: string | null;
  third: string | null;
}

/**
 * Podio de una categoría terminada. El 3.er lugar sale del duelo por el
 * tercer puesto o, si la penúltima ronda fue de 3 arqueros, del perdedor del
 * repechaje (el otro perdedor ya había caído en esa misma ronda).
 */
export function podium(
  finalRound: RoundMatch[],
  previousRound: RoundMatch[] | null,
): Podium {
  const final = finalRound.find((m) => m.kind === 'FINAL');
  const third = finalRound.find((m) => m.kind === 'THIRD_PLACE');
  const loserOf = (m?: RoundMatch) =>
    m?.winnerId
      ? (m.participantIds.find((id) => id !== m.winnerId) ?? null)
      : null;
  let thirdPlace = third?.winnerId ?? null;
  if (!third && previousRound) {
    const repechage = previousRound.find((m) => m.kind === 'REPECHAGE');
    thirdPlace = loserOf(repechage);
  }
  return {
    first: final?.winnerId ?? null,
    second: loserOf(final),
    third: thirdPlace,
  };
}

/// Nombre de la ronda según cuántos arqueros la juegan
export function roundLabel(entrantsCount: number, number: number) {
  if (entrantsCount === 2) return 'Final';
  if (entrantsCount <= 4) return 'Semifinal';
  if (entrantsCount <= 8) return 'Cuartos de final';
  if (entrantsCount <= 16) return 'Octavos de final';
  return `Ronda ${number}`;
}

// ---------- Sorteo ----------

export interface DrawResult {
  /// Pares por número de participante
  pairs: [number, number][];
  bye: number | null;
}

/**
 * Valida un sorteo de primera ronda (de la tómbola o del algoritmo): cada
 * número aparece una sola vez y, si son impares, uno queda sin rival.
 */
export function validateDraw(
  numbers: number[],
  draw: DrawResult,
): string | null {
  const used = [...draw.pairs.flat(), ...(draw.bye !== null ? [draw.bye] : [])];
  const pool = new Set(numbers);
  const seen = new Set<number>();
  for (const n of used) {
    if (!pool.has(n))
      return `El n.º ${n} no está entre los inscritos confirmados`;
    if (seen.has(n)) return `El n.º ${n} aparece más de una vez`;
    seen.add(n);
  }
  const odd = numbers.length % 2 === 1;
  if (odd && draw.bye === null)
    return 'Con inscritos impares, uno debe quedar sin rival';
  if (!odd && draw.bye !== null)
    return 'Con inscritos pares, nadie queda sin rival';
  const missing = numbers.filter((n) => !seen.has(n));
  if (missing.length)
    return `Falta ubicar: ${missing.map((n) => `n.º ${n}`).join(', ')}`;
  return null;
}

/// Sorteo por algoritmo: se baraja con la semilla y se empareja de a dos; si
/// son impares, el último queda sin rival
export function drawFromShuffle(shuffled: number[]): DrawResult {
  const odd = shuffled.length % 2 === 1;
  const paired = odd ? shuffled.slice(0, -1) : shuffled;
  const pairs: [number, number][] = [];
  for (let i = 0; i < paired.length; i += 2)
    pairs.push([paired[i], paired[i + 1]]);
  return { pairs, bye: odd ? shuffled[shuffled.length - 1] : null };
}
