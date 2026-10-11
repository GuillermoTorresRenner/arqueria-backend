import { BadRequestException } from '@nestjs/common';
import { TournamentStatus } from '@prisma/client';
import { TournamentsService } from './tournaments.service';

describe('TournamentsService', () => {
  const build = (prisma: any = {}) => new TournamentsService(prisma as any);

  describe('transiciones de estado', () => {
    const assert = (from: TournamentStatus, to: TournamentStatus) =>
      (build() as any).assertTransition(from, to);

    it('permite abrir inscripciones desde borrador', () => {
      expect(() =>
        assert(TournamentStatus.DRAFT, TournamentStatus.REGISTRATION_OPEN),
      ).not.toThrow();
    });

    it('permite arrancar el torneo desde inscripciones abiertas', () => {
      expect(() =>
        assert(
          TournamentStatus.REGISTRATION_OPEN,
          TournamentStatus.IN_PROGRESS,
        ),
      ).not.toThrow();
    });

    it('permite finalizar un torneo en curso', () => {
      expect(() =>
        assert(TournamentStatus.IN_PROGRESS, TournamentStatus.FINISHED),
      ).not.toThrow();
    });

    it('permite cancelar mientras no haya terminado', () => {
      for (const from of [
        TournamentStatus.DRAFT,
        TournamentStatus.REGISTRATION_OPEN,
        TournamentStatus.IN_PROGRESS,
      ]) {
        expect(() => assert(from, TournamentStatus.CANCELLED)).not.toThrow();
      }
    });

    it('NO permite reabrir inscripciones de un torneo en curso', () => {
      expect(() =>
        assert(
          TournamentStatus.IN_PROGRESS,
          TournamentStatus.REGISTRATION_OPEN,
        ),
      ).toThrow(BadRequestException);
    });

    it('NO permite revivir un torneo finalizado', () => {
      for (const to of [
        TournamentStatus.DRAFT,
        TournamentStatus.REGISTRATION_OPEN,
        TournamentStatus.IN_PROGRESS,
      ]) {
        expect(() => assert(TournamentStatus.FINISHED, to)).toThrow(
          BadRequestException,
        );
      }
    });

    it('NO permite revivir un torneo cancelado', () => {
      expect(() =>
        assert(TournamentStatus.CANCELLED, TournamentStatus.IN_PROGRESS),
      ).toThrow(BadRequestException);
    });

    it('NO permite saltarse la apertura de inscripciones', () => {
      expect(() =>
        assert(TournamentStatus.DRAFT, TournamentStatus.IN_PROGRESS),
      ).toThrow(BadRequestException);
    });

    it('acepta que el estado no cambie', () => {
      expect(() =>
        assert(TournamentStatus.FINISHED, TournamentStatus.FINISHED),
      ).not.toThrow();
    });

    it('el mensaje de error indica qué transiciones son posibles', () => {
      expect(() =>
        assert(TournamentStatus.DRAFT, TournamentStatus.FINISHED),
      ).toThrow(/Transiciones posibles/);
    });

    it('avisa de que un estado final no admite cambios', () => {
      expect(() =>
        assert(TournamentStatus.FINISHED, TournamentStatus.DRAFT),
      ).toThrow(/estado final/);
    });
  });

  it('el detalle público no expone la cuenta bancaria, solo los montos', async () => {
    const prisma = {
      tournament: {
        findUnique: jest.fn(async () => ({
          id: 't1',
          slug: 'copa',
          bankAccountId: 'b1',
          paymentInfo: {
            accountNumber: '00012345678',
            fees: [{ label: 'Socio', amount: 15000 }],
          },
        })),
      },
    };
    const result: any = await build(prisma).findBySlug('copa');
    expect(result.paymentInfo).toBeUndefined();
    expect(result.bankAccountId).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('00012345678');
    expect(result.fees).toEqual([{ label: 'Socio', amount: 15000 }]);
  });

  describe('dianas', () => {
    it('rechaza zonas con la misma etiqueta', () => {
      const prisma = { scoringFormat: { create: jest.fn() } };
      expect(() =>
        build(prisma).createFormat({
          name: 'Diana turca',
          zones: [
            { label: '1', value: 1 },
            { label: '1', value: 2 },
          ],
        }),
      ).toThrow(/repetidas: 1/);
      expect(prisma.scoringFormat.create).not.toHaveBeenCalled();
    });

    it('no borra una diana que usa alguna categoría', async () => {
      const prisma = {
        scoringFormat: {
          findUnique: jest.fn(async () => ({ id: 'f1' })),
          delete: jest.fn(),
        },
        tournamentCategory: { count: jest.fn(async () => 2) },
      };
      await expect(build(prisma).removeFormat('f1')).rejects.toThrow(
        /2 categoría/,
      );
      expect(prisma.scoringFormat.delete).not.toHaveBeenCalled();
    });
  });
});
