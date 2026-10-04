import { BadRequestException } from '@nestjs/common';
import { TournamentStatus } from '@prisma/client';
import { TournamentsService } from './tournaments.service';

describe('TournamentsService', () => {
  const build = (prisma: any = {}) =>
    new TournamentsService(prisma as any, {} as any);

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

  describe('remove', () => {
    const tournament = {
      id: 't1',
      name: 'Copa',
      status: TournamentStatus.FINISHED,
    };

    it('se niega a borrar un torneo con puntajes si no se fuerza', async () => {
      const service = build({
        score: { count: jest.fn().mockResolvedValue(48) },
        tournament: { delete: jest.fn() },
      });
      jest.spyOn(service, 'findOne').mockResolvedValue(tournament as any);

      await expect(service.remove('t1')).rejects.toThrow(BadRequestException);
      await expect(service.remove('t1')).rejects.toThrow(/48 series/);
    });

    it('borra sin objeción cuando no hay puntajes', async () => {
      const del = jest.fn().mockResolvedValue({});
      const service = build({
        score: { count: jest.fn().mockResolvedValue(0) },
        tournament: { delete: del },
      });
      jest.spyOn(service, 'findOne').mockResolvedValue(tournament as any);

      await expect(service.remove('t1')).resolves.toMatchObject({
        deletedScores: 0,
      });
      expect(del).toHaveBeenCalled();
    });

    it('borra con force aunque haya puntajes', async () => {
      const del = jest.fn().mockResolvedValue({});
      const service = build({
        score: { count: jest.fn().mockResolvedValue(48) },
        tournament: { delete: del },
      });
      jest.spyOn(service, 'findOne').mockResolvedValue(tournament as any);

      await expect(service.remove('t1', true)).resolves.toMatchObject({
        deletedScores: 48,
      });
      expect(del).toHaveBeenCalled();
    });
  });

  describe('removeRegistration', () => {
    it('marca como retirado al arquero que ya tiene puntajes', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = build({
        registration: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'r1',
            memberId: 'm1',
            tournamentId: 't1',
          }),
          update,
          delete: jest.fn(),
        },
        score: { count: jest.fn().mockResolvedValue(6) },
      });

      const out = await service.removeRegistration('r1');
      expect(out.withdrawn).toBe(true);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'WITHDRAWN', groupId: null },
        }),
      );
    });

    it('elimina la inscripción cuando no hay puntajes', async () => {
      const del = jest.fn().mockResolvedValue({});
      const service = build({
        registration: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'r1',
            memberId: 'm1',
            tournamentId: 't1',
          }),
          update: jest.fn(),
          delete: del,
        },
        score: { count: jest.fn().mockResolvedValue(0) },
      });

      const out = await service.removeRegistration('r1');
      expect(out.withdrawn).toBe(false);
      expect(del).toHaveBeenCalled();
    });
  });
  it('el detalle público no expone la cuenta bancaria, solo los montos', async () => {
    const prisma = {
      tournament: {
        findUnique: jest.fn(async () => ({
          id: 't1',
          slug: 'copa',
          paymentInfo: {
            accountNumber: '00012345678',
            fees: [{ label: 'Socio', amount: 15000 }],
          },
        })),
      },
    };
    const result: any = await build(prisma).findBySlug('copa');
    expect(result.paymentInfo).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('00012345678');
    expect(result.fees).toEqual([{ label: 'Socio', amount: 15000 }]);
  });
});
