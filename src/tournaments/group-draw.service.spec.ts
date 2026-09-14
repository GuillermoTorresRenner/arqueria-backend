import { BadRequestException } from '@nestjs/common';
import { GroupDrawService } from './group-draw.service';

describe('GroupDrawService', () => {
  const service = new GroupDrawService();
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `reg-${i + 1}`);

  it('reparte a todos los inscritos sin perder ni duplicar a nadie', () => {
    const registrationIds = ids(23);
    const { groups } = service.draw({ registrationIds, groupCount: 4 });

    const assigned = groups.flat();
    expect(assigned).toHaveLength(registrationIds.length);
    expect(new Set(assigned).size).toBe(registrationIds.length);
    expect([...assigned].sort()).toEqual([...registrationIds].sort());
  });

  it('equilibra los grupos: se diferencian como mucho en un integrante', () => {
    const { groups } = service.draw({
      registrationIds: ids(10),
      groupCount: 3,
    });
    const sizes = groups.map((g) => g.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('es reproducible: la misma semilla da el mismo sorteo', () => {
    const registrationIds = ids(15);
    const first = service.draw({
      registrationIds,
      groupCount: 3,
      seed: 'copa-2026',
    });
    const second = service.draw({
      registrationIds,
      groupCount: 3,
      seed: 'copa-2026',
    });
    expect(second.groups).toEqual(first.groups);
    expect(second.seed).toBe('copa-2026');
  });

  it('semillas distintas producen repartos distintos', () => {
    const registrationIds = ids(20);
    const a = service.draw({
      registrationIds,
      groupCount: 4,
      seed: 'semilla-a',
    });
    const b = service.draw({
      registrationIds,
      groupCount: 4,
      seed: 'semilla-b',
    });
    expect(b.groups).not.toEqual(a.groups);
  });

  it('genera y devuelve una semilla cuando no se le pasa una', () => {
    const { seed } = service.draw({ registrationIds: ids(8), groupCount: 2 });
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it('rechaza sortear sin inscripciones', () => {
    expect(() => service.draw({ registrationIds: [], groupCount: 2 })).toThrow(
      BadRequestException,
    );
  });

  it('rechaza más grupos que inscritos', () => {
    expect(() =>
      service.draw({ registrationIds: ids(3), groupCount: 5 }),
    ).toThrow(BadRequestException);
  });

  it('admite un único grupo', () => {
    const { groups } = service.draw({ registrationIds: ids(6), groupCount: 1 });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(6);
  });

  it('no deja el orden de entrada intacto (realmente baraja)', () => {
    const registrationIds = ids(40);
    const { groups } = service.draw({
      registrationIds,
      groupCount: 1,
      seed: 'mezcla',
    });
    expect(groups[0]).not.toEqual(registrationIds);
  });

  it('no muta el array recibido', () => {
    const registrationIds = ids(10);
    const copy = [...registrationIds];
    service.draw({ registrationIds, groupCount: 2, seed: 'x' });
    expect(registrationIds).toEqual(copy);
  });
});
