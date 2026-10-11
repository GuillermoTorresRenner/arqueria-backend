import { createHash, randomBytes } from 'crypto';

/**
 * Azar reproducible para los sorteos.
 *
 * No usa Math.random(): un sorteo deportivo tiene que poder auditarse, y con la
 * semilla guardada cualquiera puede recalcular el mismo resultado y comprobar
 * que no se manipuló.
 */

export function newSeed() {
  return randomBytes(16).toString('hex');
}

/// Fisher-Yates con un PRNG determinista derivado de la semilla. No modifica
/// el arreglo recibido.
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  const random = createRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/// PRNG xorshift128 sembrado con SHA-256 de la semilla.
function createRandom(seed: string): () => number {
  const hash = createHash('sha256').update(seed).digest();
  let x = hash.readUInt32LE(0) || 1;
  let y = hash.readUInt32LE(4) || 2;
  let z = hash.readUInt32LE(8) || 3;
  let w = hash.readUInt32LE(12) || 4;

  return () => {
    const t = x ^ (x << 11);
    x = y;
    y = z;
    z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w / 0x100000000;
  };
}
