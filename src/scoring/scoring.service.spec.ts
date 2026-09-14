import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ScoreStatus } from '@prisma/client';
import { ScoringService } from './scoring.service';
import { Roles } from '../auth';

/// Zonas de un formato tipo World Archery, cargadas como datos.
const WA_ZONES = [
  { label: 'X', value: 10, isInner: true },
  { label: '10', value: 10 },
  { label: '9', value: 9 },
  { label: '8', value: 8 },
  { label: 'M', value: 0 },
];

describe('ScoringService', () => {
  let service: ScoringService;
  const resolve = (arrows: { label: string }[], zones = WA_ZONES) =>
    (service as any).resolveArrows(arrows, zones);

  beforeEach(() => {
    service = new ScoringService({} as any, {} as any);
  });

  describe('resolveArrows', () => {
    it('suma el puntaje desde las zonas del formato', () => {
      const result = resolve([{ label: '10' }, { label: '9' }, { label: '8' }]);
      expect(result.total).toBe(27);
    });

    it('cuenta X e interiores por separado para el desempate', () => {
      const result = resolve([{ label: 'X' }, { label: '10' }, { label: '9' }]);
      expect(result.total).toBe(29);
      expect(result.innerTens).toBe(1);
      expect(result.tens).toBe(2); // X vale 10, así que cuenta como diez
    });

    it('trata el fallo como cero sin romper la serie', () => {
      const result = resolve([{ label: 'M' }, { label: 'M' }, { label: '8' }]);
      expect(result.total).toBe(8);
    });

    it('acepta la etiqueta sin distinguir mayúsculas', () => {
      expect(resolve([{ label: 'x' }]).total).toBe(10);
    });

    it('rechaza una zona que no existe en el formato', () => {
      expect(() => resolve([{ label: '11' }])).toThrow(BadRequestException);
    });

    it('nunca toma el puntaje del cliente: solo la etiqueta', () => {
      const result = resolve([{ label: '9', value: 999 } as any]);
      expect(result.total).toBe(9);
      expect(result.arrows[0]).toEqual({ label: '9', value: 9 });
    });

    it('funciona con un formato 3D totalmente distinto', () => {
      const zones3d = [
        { label: '11', value: 11, isInner: true },
        { label: '10', value: 10 },
        { label: '8', value: 8 },
        { label: '5', value: 5 },
        { label: 'M', value: 0 },
      ];
      const result = resolve([{ label: '11' }, { label: '5' }], zones3d);
      expect(result.total).toBe(16);
      expect(result.innerTens).toBe(1);
    });
  });

  describe('validaciones de serie', () => {
    it('rechaza una serie con menos flechas de las que exige el formato', () => {
      expect(() =>
        (service as any).assertArrowCount([{ label: '10' }], 3),
      ).toThrow(BadRequestException);
    });

    it('rechaza una serie con más flechas de las permitidas', () => {
      const arrows = [{ label: '10' }, { label: '9' }, { label: '8' }, { label: '7' }];
      expect(() => (service as any).assertArrowCount(arrows, 3)).toThrow(
        BadRequestException,
      );
    });

    it('rechaza un número de serie fuera del rango de la ronda', () => {
      expect(() => (service as any).assertEndNumber(21, 20)).toThrow(
        BadRequestException,
      );
    });

    it('acepta la última serie de la ronda', () => {
      expect(() => (service as any).assertEndNumber(20, 20)).not.toThrow();
    });
  });

  describe('permisos de carga', () => {
    const context = (groupId: string | null) => ({
      tournamentId: 't1',
      format: {} as any,
      registration: { groupId } as any,
    });

    it('el admin puede cargar cualquier puntaje', async () => {
      await expect(
        (service as any).assertCanScore(context('g1'), 'admin-1', Roles.ADMIN),
      ).resolves.toBeUndefined();
    });

    it('un socio no puede cargar puntajes', async () => {
      await expect(
        (service as any).assertCanScore(context('g1'), 'member-1', Roles.MEMBER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('el juez del grupo puede cargar', async () => {
      (service as any).prisma = {
        tournamentGroup: {
          findUnique: jest.fn().mockResolvedValue({ judgeId: 'judge-1' }),
        },
      };
      await expect(
        (service as any).assertCanScore(context('g1'), 'judge-1', Roles.JUDGE),
      ).resolves.toBeUndefined();
    });

    it('un juez no puede cargar puntajes de un grupo ajeno', async () => {
      (service as any).prisma = {
        tournamentGroup: {
          findUnique: jest.fn().mockResolvedValue({ judgeId: 'judge-2' }),
        },
      };
      await expect(
        (service as any).assertCanScore(context('g1'), 'judge-1', Roles.JUDGE),
      ).rejects.toThrow(ForbiddenException);
    });

    it('un juez no puede cargar si el arquero no tiene grupo', async () => {
      await expect(
        (service as any).assertCanScore(context(null), 'judge-1', Roles.JUDGE),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getLeaderboard', () => {
    const buildService = (scores: any[]) => {
      const svc = new ScoringService(
        {
          tournament: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ id: 't1', rounds: [{ id: 'r1' }] }),
          },
          score: { findMany: jest.fn().mockResolvedValue(scores) },
        } as any,
        {} as any,
      );
      return svc;
    };

    const score = (memberId: string, total: number, innerTens = 0, tens = 0) => ({
      memberId,
      total,
      innerTens,
      tens,
      member: {
        memberNumber: 1,
        user: { name: memberId, surname: '', avatar: null },
        categories: [],
      },
    });

    it('ordena por puntaje total descendente', async () => {
      const svc = buildService([score('ana', 250), score('beto', 280)]);
      const { entries } = await svc.getLeaderboard('t1');
      expect(entries.map((e: any) => e.name)).toEqual(['beto', 'ana']);
      expect(entries[0].position).toBe(1);
    });

    it('acumula las series de un mismo arquero', async () => {
      const svc = buildService([score('ana', 27), score('ana', 30)]);
      const { entries } = await svc.getLeaderboard('t1');
      expect(entries).toHaveLength(1);
      expect(entries[0].total).toBe(57);
      expect(entries[0].endsShot).toBe(2);
    });

    it('desempata por zonas interiores cuando el total es igual', async () => {
      const svc = buildService([
        score('ana', 280, 5),
        score('beto', 280, 9),
      ]);
      const { entries } = await svc.getLeaderboard('t1');
      expect(entries[0].name).toBe('beto');
    });

    it('si persiste el empate, desempata por dieces', async () => {
      const svc = buildService([
        score('ana', 280, 5, 12),
        score('beto', 280, 5, 20),
      ]);
      const { entries } = await svc.getLeaderboard('t1');
      expect(entries[0].name).toBe('beto');
    });

    it('devuelve ranking vacío si el torneo no tiene rondas', async () => {
      const svc = new ScoringService(
        {
          tournament: {
            findUnique: jest.fn().mockResolvedValue({ id: 't1', rounds: [] }),
          },
        } as any,
        {} as any,
      );
      const result = await svc.getLeaderboard('t1');
      expect(result.entries).toEqual([]);
    });
  });
});
