import { newSeed, seededShuffle } from './seeded-random';

describe('seededShuffle', () => {
  const numbers = Array.from({ length: 23 }, (_, i) => i + 1);

  it('no pierde ni duplica a nadie y no toca el original', () => {
    const copy = [...numbers];
    const shuffled = seededShuffle(numbers, 'copa-2026');
    expect([...shuffled].sort((a, b) => a - b)).toEqual(numbers);
    expect(numbers).toEqual(copy);
  });

  it('es reproducible: la misma semilla da el mismo orden', () => {
    expect(seededShuffle(numbers, 'copa-2026')).toEqual(
      seededShuffle(numbers, 'copa-2026'),
    );
  });

  it('semillas distintas dan órdenes distintos', () => {
    expect(seededShuffle(numbers, 'a')).not.toEqual(
      seededShuffle(numbers, 'b'),
    );
  });

  it('genera semillas nuevas en cada llamada', () => {
    expect(newSeed()).not.toBe(newSeed());
  });
});
