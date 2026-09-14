import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

export interface DrawInput {
  registrationIds: string[];
  groupCount: number;
  seed?: string;
}

export interface DrawResult {
  seed: string;
  /// Un array por grupo, con los IDs de inscripción en el orden sorteado.
  groups: string[][];
}

/**
 * Sorteo aleatorio de grupos, reproducible a partir de su semilla.
 *
 * No usa Math.random(): un sorteo deportivo tiene que poder auditarse, y con la
 * semilla guardada cualquiera puede recalcular el mismo resultado y comprobar
 * que no se manipuló.
 */
@Injectable()
export class GroupDrawService {
  draw({ registrationIds, groupCount, seed }: DrawInput): DrawResult {
    if (registrationIds.length === 0) {
      throw new BadRequestException('No hay inscripciones para sortear');
    }
    if (groupCount < 1) {
      throw new BadRequestException('Se requiere al menos un grupo');
    }
    if (groupCount > registrationIds.length) {
      throw new BadRequestException(
        `No se pueden formar ${groupCount} grupos con ${registrationIds.length} inscripciones`,
      );
    }

    const actualSeed = seed ?? randomBytes(16).toString('hex');
    const shuffled = this.shuffle([...registrationIds], actualSeed);

    // Reparto por turnos: con 10 arqueros y 3 grupos quedan 4/3/3, nunca 8/1/1.
    const groups: string[][] = Array.from({ length: groupCount }, () => []);
    shuffled.forEach((id, index) => {
      groups[index % groupCount].push(id);
    });

    return { seed: actualSeed, groups };
  }

  /// Fisher-Yates con un PRNG determinista derivado de la semilla.
  private shuffle<T>(items: T[], seed: string): T[] {
    const random = this.createRandom(seed);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /// PRNG xorshift128 sembrado con SHA-256 de la semilla.
  private createRandom(seed: string): () => number {
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
}
