/**
 * Reglas del cuadro de eliminación directa, sin base de datos: a partir de las
 * flechas o disparos cargados deciden quién gana cada enfrentamiento, qué
 * pasa directo por bye y cómo se arma la siguiente ronda.
 *
 * Reglamento del club:
 * - Puntaje: cada arquero tira las flechas de la ronda y gana la suma mayor.
 *   Si empatan, tandas de desempate (muerte súbita) hasta que alguien gane.
 * - Duelos: gana el primero que abate las dianas fijadas. En cada disparo el
 *   punto es de quien abatió primero o, si fue simultáneo, de quien quedó más
 *   cerca del centro; si no se puede separar, nadie suma y se sigue tirando.
 * - Sistema bye: si los inscritos no son potencia de 2, el sorteo deja pasar
 *   directo a la segunda ronda a los que faltan para completar el cuadro
 *   (13 arqueros → cuadro de 16 → 3 byes). Desde ahí todas las rondas son
 *   pares.
 * - Los perdedores de semifinales disputan el 3.er lugar.
 */

export type Mode = 'SCORE' | 'KNOCKDOWN';
export type Kind = 'REGULAR' | 'THIRD_PLACE' | 'FINAL';
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
  /// Flechas por arquero (Puntaje)
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
  /// Dianas abatidas (Duelos)
  hits: Record<string, number>;
  /// Desempate en curso: la tanda que falta y quiénes la tiran
  shootOff: { tanda: number; entryIds: string[] } | null;
}

/// ¿Se gana llegando primero a N (duelo) o por la suma mayor?
export function isRace(rules: Pick<MatchRules, 'mode'>) {
  return rules.mode === 'KNOCKDOWN';
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

// ---------- Rondas ----------

/// Tamaño del cuadro: la potencia de 2 que alcanza a todos los arqueros
export function bracketSize(count: number) {
  let size = 1;
  while (size < count) size *= 2;
  return size;
}

/// Cuántos pasan directo a la segunda ronda (bye) para completar el cuadro
export function byeCount(count: number) {
  return bracketSize(count) - count;
}

export interface RoundMatch {
  kind: Kind;
  order: number;
  /// Participantes del enfrentamiento, en orden de lado
  participantIds: string[];
  /// null mientras no termina
  winnerId: string | null;
}

/// La ronda terminó: todos sus enfrentamientos tienen ganador
export function isRoundComplete(matches: RoundMatch[]) {
  return matches.length > 0 && matches.every((m) => m.winnerId);
}

/**
 * Recorre los arqueros de una ronda en orden de cuadro: cada bye ocupa un
 * lugar y cada enfrentamiento, dos seguidos.
 */
function slots(entrants: string[], byeIds: string[]) {
  const byes = new Set(byeIds);
  const result: ({ bye: string } | { pair: [string, string] })[] = [];
  for (let i = 0; i < entrants.length;) {
    if (byes.has(entrants[i])) {
      result.push({ bye: entrants[i] });
      i += 1;
      continue;
    }
    const pair: [string, string] = [entrants[i], entrants[i + 1]];
    if (!pair[1] || byes.has(pair[1]))
      throw new Error('El orden del cuadro deja a un arquero sin rival');
    result.push({ pair });
    i += 2;
  }
  return result;
}

/// Quiénes pasan, en orden de cuadro: cada bye y cada ganador conservan su
/// lugar, así la ronda siguiente se cruza de a dos
export function advancing(
  entrants: string[],
  byeIds: string[],
  matches: RoundMatch[],
): string[] {
  const regular = matches.filter((m) => m.kind === 'REGULAR');
  let order = 0;
  return slots(entrants, byeIds).map((slot) => {
    if ('bye' in slot) return slot.bye;
    const current = order++;
    return regular.find((m) => m.order === current)!.winnerId!;
  });
}

export interface NewMatch {
  kind: Kind;
  order: number;
  participantIds: string[];
}

/**
 * Enfrentamientos de una ronda a partir de sus arqueros en orden de cuadro.
 * - 2 arqueros: final, más el 3.er lugar si vienen de una semifinal (4 → 2).
 * - Si no son potencia de 2 (solo la primera ronda), los byes pasan directo
 *   y el resto se cruza de a dos en su orden.
 */
export function buildRoundMatches(
  entrants: string[],
  byeIds: string[],
  semifinalLosers: string[] | null = null,
): NewMatch[] {
  if (entrants.length < 2)
    throw new Error('Una ronda necesita al menos dos arqueros');
  if (byeIds.length !== byeCount(entrants.length)) {
    throw new Error(
      `Con ${entrants.length} arqueros deben pasar ${byeCount(entrants.length)} por bye`,
    );
  }
  if (byeIds.some((id) => !entrants.includes(id)))
    throw new Error('Un bye no está entre los arqueros de la ronda');
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
  return slots(entrants, byeIds)
    .filter((slot) => 'pair' in slot)
    .map((slot, order) => ({
      kind: 'REGULAR',
      order,
      participantIds: [...slot.pair],
    }));
}

/// Perdedores de una ronda de 4 sin byes: van por el 3.er lugar
export function semifinalLosers(
  entrantsCount: number,
  byeIds: string[],
  matches: RoundMatch[],
): string[] | null {
  if (entrantsCount !== 4 || byeIds.length) return null;
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
 * tercer puesto o, con 3 arqueros (una semifinal y un bye), del único
 * perdedor de esa semifinal.
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
    const semifinals = previousRound.filter((m) => m.kind === 'REGULAR');
    if (semifinals.length === 1) thirdPlace = loserOf(semifinals[0]);
  }
  return {
    first: final?.winnerId ?? null,
    second: loserOf(final),
    third: thirdPlace,
  };
}

/// Nombre de la ronda según el tamaño de su cuadro
export function roundLabel(entrantsCount: number, number: number) {
  const size = bracketSize(entrantsCount);
  if (size === 2) return 'Final';
  if (size === 4) return 'Semifinal';
  if (size === 8) return 'Cuartos de final';
  if (size === 16) return 'Octavos de final';
  return `Ronda ${number}`;
}

// ---------- Sorteo ----------

export interface DrawResult {
  /// Pares por número de participante
  pairs: [number, number][];
  /// Números que pasan directo a la segunda ronda
  byes: number[];
}

/**
 * Valida un sorteo de primera ronda (de la tómbola o del algoritmo): cada
 * número aparece una sola vez y los byes completan el cuadro a potencia de 2.
 */
export function validateDraw(
  numbers: number[],
  draw: DrawResult,
): string | null {
  const used = [...draw.pairs.flat(), ...draw.byes];
  const pool = new Set(numbers);
  const seen = new Set<number>();
  for (const n of used) {
    if (!pool.has(n))
      return `El n.º ${n} no está entre los inscritos confirmados`;
    if (seen.has(n)) return `El n.º ${n} aparece más de una vez`;
    seen.add(n);
  }
  const byes = byeCount(numbers.length);
  if (draw.byes.length !== byes) {
    return byes
      ? `Con ${numbers.length} inscritos el cuadro es de ${bracketSize(numbers.length)}: ${byes === 1 ? 'pasa 1' : `pasan ${byes}`} por bye`
      : `Con ${numbers.length} inscritos nadie pasa por bye`;
  }
  const missing = numbers.filter((n) => !seen.has(n));
  if (missing.length)
    return `Falta ubicar: ${missing.map((n) => `n.º ${n}`).join(', ')}`;
  return null;
}

/// Sorteo por algoritmo: se baraja con la semilla, los primeros pasan por bye
/// y el resto se empareja de a dos
export function drawFromShuffle(shuffled: number[]): DrawResult {
  const byes = shuffled.slice(0, byeCount(shuffled.length));
  const rest = shuffled.slice(byes.length);
  const pairs: [number, number][] = [];
  for (let i = 0; i < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]]);
  return { pairs, byes };
}

/**
 * Orden de cuadro de la primera ronda: se intercalan byes y enfrentamientos
 * para que, en la segunda, cada bye espere al ganador de un enfrentamiento
 * mientras alcancen (los que sobran se cruzan entre sí).
 */
export function bracketOrder<T>(pairs: [T, T][], byes: T[]): T[] {
  const order: T[] = [];
  for (let i = 0; i < Math.max(pairs.length, byes.length); i++) {
    if (i < byes.length) order.push(byes[i]);
    if (i < pairs.length) order.push(...pairs[i]);
  }
  return order;
}
