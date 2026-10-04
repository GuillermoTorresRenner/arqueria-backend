import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ActivityTournamentsService,
  utf8Name,
} from './activity-tournaments.service';

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe('ActivityTournamentsService', () => {
  const build = () => {
    const tournament = {
      id: 't1',
      status: 'REGISTRATION_OPEN',
      registrationEnd: null as Date | null,
      maxParticipants: null as number | null,
      paymentInfo: {
        bankName: 'Banco Estado',
        fees: [{ label: 'Socio', amount: 10000 }],
      },
    };
    const activity = {
      id: 'a1',
      type: 'TOURNAMENT',
      title: 'Copa Galadhrym',
      startsAt: future(72),
      endsAt: future(78),
      place: null,
      tournamentId: 't1',
      tournament,
    };
    const prisma = {
      activity: {
        findUnique: jest.fn(async () => activity),
        update: jest.fn(),
      },
      member: {
        findUnique: jest.fn(async () => ({
          id: 'm1',
          status: 'ACTIVE',
          user: { email: 'ana@x.cl', name: 'Ana', surname: 'Arquera' },
        })),
      },
      registration: {
        findUnique: jest.fn(async (): Promise<any> => null),
        create: jest.fn(async () => ({ id: 'r1', status: 'PENDING' })),
        update: jest.fn(async ({ data }: any) => ({ id: 'r1', ...data })),
        count: jest.fn(async () => 0),
        delete: jest.fn(),
      },
      tournament: {
        create: jest.fn(async () => ({ id: 't2' })),
        update: jest.fn(),
      },
      tournamentDocument: { findMany: jest.fn(async () => []) },
    };
    const email = {
      sendTournamentRegistrationEmail: jest.fn(async () => true),
      sendTournamentConfirmedEmail: jest.fn(async () => true),
    };
    const upload = { saveFile: jest.fn(), removeFile: jest.fn() };
    const service = new ActivityTournamentsService(
      prisma as any,
      email as any,
      upload as any,
    );
    return { prisma, email, upload, service, activity, tournament };
  };

  it('la inscripción queda pendiente y llega el correo con los datos de pago', async () => {
    const { prisma, email, service, tournament } = build();
    await expect(service.register('a1', 'u1')).resolves.toEqual({
      status: 'PENDING',
      emailSent: true,
    });
    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: { tournamentId: 't1', memberId: 'm1' },
    });
    expect(email.sendTournamentRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@x.cl',
        memberName: 'Ana Arquera',
        paymentInfo: tournament.paymentInfo,
      }),
    );
  });

  it('no deja inscribirse dos veces ni pasado el cierre o el cupo', async () => {
    const { prisma, service, tournament } = build();
    prisma.registration.findUnique.mockResolvedValueOnce({ status: 'PENDING' });
    await expect(service.register('a1', 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    tournament.registrationEnd = new Date(Date.now() - 1000);
    await expect(service.register('a1', 'u1')).rejects.toThrow(/cerró/);

    tournament.registrationEnd = null;
    tournament.maxParticipants = 2;
    prisma.registration.count.mockResolvedValueOnce(2);
    await expect(service.register('a1', 'u1')).rejects.toThrow(/cupo/);
  });

  it('un socio suspendido no se inscribe', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'SUSPENDED',
      user: {},
    } as any);
    await expect(service.register('a1', 'u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('una inscripción pagada no se retira desde la cuenta', async () => {
    const { prisma, service } = build();
    prisma.registration.findUnique.mockResolvedValueOnce({
      id: 'r1',
      status: 'CONFIRMED',
    });
    await expect(service.withdraw('a1', 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.registration.delete).not.toHaveBeenCalled();
  });

  it('confirmar el pago deja inscrito y avisa al socio', async () => {
    const { prisma, email, service, activity } = build();
    prisma.registration.findUnique.mockResolvedValueOnce({
      id: 'r1',
      status: 'PENDING',
      confirmedAt: null,
      confirmedById: null,
      member: { user: { email: 'ana@x.cl', name: 'Ana' } },
      tournament: { activity },
    });
    const r = await service.setRegistrationStatus('r1', 'CONFIRMED', 'admin1');
    expect(r).toMatchObject({ status: 'CONFIRMED', emailSent: true });
    const data = prisma.registration.update.mock.calls[0][0].data;
    expect(data.confirmedById).toBe('admin1');
    expect(data.confirmedAt).toBeInstanceOf(Date);
    expect(email.sendTournamentConfirmedEmail).toHaveBeenCalled();
  });

  it('un torneo con inscritos no puede pasar a ser actividad', async () => {
    const { prisma, service, activity } = build();
    prisma.registration.count.mockResolvedValueOnce(3);
    await expect(
      service.sync({ ...activity, type: 'ACTIVITY' } as any, undefined),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('crea la ficha del torneo abierta a inscripciones', async () => {
    const { prisma, service, activity } = build();
    await service.sync({ ...activity, tournamentId: null } as any, {
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const data = (prisma.tournament.create.mock.calls as any)[0][0].data;
    expect(data).toMatchObject({
      name: 'Copa Galadhrym',
      status: 'REGISTRATION_OPEN',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(data.slug).toMatch(/^copa-galadhrym-[0-9a-f]{6}$/);
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { tournamentId: 't2' },
    });
  });

  it('rechaza archivos que no son documentos', async () => {
    const { service, upload } = build();
    await expect(
      service.addDocument('a1', { originalname: 'x.html', size: 10 } as any),
    ).rejects.toThrow(/Formato no permitido/);
    expect(upload.saveFile).not.toHaveBeenCalled();
  });

  it('recupera nombres UTF-8 leídos como latin1', () => {
    expect(utf8Name(Buffer.from('Reglamento año.pdf').toString('latin1'))).toBe(
      'Reglamento año.pdf',
    );
    expect(utf8Name('Reglamento año.pdf')).toBe('Reglamento año.pdf');
  });
});
