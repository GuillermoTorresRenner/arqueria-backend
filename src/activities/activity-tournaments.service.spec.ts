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
        instructions: 'Indica tu nombre',
        fees: [{ label: 'Socio', amount: 10000 }],
      },
      bankAccount: {
        id: 'b1',
        bankName: 'Banco de Chile',
        accountType: 'Cuenta Vista',
        accountNumber: '00-061-12262-78',
        holderName: 'Eduardo Rivas',
        holderRut: '9.731.978-2',
        holderEmail: null,
        isActive: true,
      },
      categories: [{ id: 'c1', name: 'Tiro tradicional' }] as {
        id: string;
        name: string;
      }[],
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
    const prisma: any = {
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
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
        findMany: jest.fn(async (): Promise<any[]> => []),
        create: jest.fn(async () => ({ id: 'r1', status: 'PENDING' })),
        update: jest.fn(async ({ data }: any) => ({ id: 'r1', ...data })),
        count: jest.fn(async () => 0),
        delete: jest.fn(),
      },
      tournamentParticipant: {
        findUnique: jest.fn(async (): Promise<any> => null),
        count: jest.fn(async () => 4),
        create: jest.fn(async ({ data }: any) => ({ id: 'p1', ...data })),
        delete: jest.fn(),
      },
      draw: { count: jest.fn(async () => 0) },
      matchEntry: { count: jest.fn(async () => 0) },
      tournament: {
        create: jest.fn(async () => ({ id: 't2' })),
        update: jest.fn(),
        findUnique: jest.fn(async () => ({ bankAccountId: 'b1' })),
      },
      bankAccount: {
        findUnique: jest.fn(async (): Promise<any> => tournament.bankAccount),
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
    const { prisma, email, service } = build();
    await expect(service.register('a1', 'u1')).resolves.toEqual({
      status: 'PENDING',
      number: 5,
      category: 'Tiro tradicional',
      emailSent: true,
    });
    // Ya había 4 participantes: recibe el número siguiente
    expect(prisma.tournamentParticipant.create).toHaveBeenCalledWith({
      data: { tournamentId: 't1', memberId: 'm1', number: 5 },
    });
    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: { tournamentId: 't1', memberId: 'm1', categoryId: 'c1' },
    });
    expect(email.sendTournamentRegistrationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@x.cl',
        memberName: 'Ana Arquera',
        paymentInfo: {
          bankName: 'Banco de Chile',
          accountType: 'Cuenta Vista',
          accountNumber: '00-061-12262-78',
          holderName: 'Eduardo Rivas',
          holderRut: '9.731.978-2',
          holderEmail: undefined,
          instructions: 'Indica tu nombre',
          fees: [{ label: 'Socio', amount: 10000 }],
        },
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
    tournament.maxParticipants = 4;
    await expect(service.register('a1', 'u1')).rejects.toThrow(/cupo/);
  });

  it('en otra categoría conserva su número y no ocupa cupo', async () => {
    const { prisma, service, tournament } = build();
    tournament.maxParticipants = 4;
    tournament.categories.push({ id: 'c2', name: 'Duelos' });
    prisma.tournamentParticipant.findUnique.mockResolvedValueOnce({
      id: 'p1',
      number: 2,
    });
    await expect(service.register('a1', 'u1', 'c2')).resolves.toMatchObject({
      number: 2,
      category: 'Duelos',
    });
    expect(prisma.tournamentParticipant.create).not.toHaveBeenCalled();
    expect(prisma.registration.create).toHaveBeenCalledWith({
      data: { tournamentId: 't1', memberId: 'm1', categoryId: 'c2' },
    });
  });

  it('con varias categorías hay que elegir una', async () => {
    const { service, tournament } = build();
    tournament.categories.push({ id: 'c2', name: 'Duelos' });
    await expect(service.register('a1', 'u1')).rejects.toThrow(/Elige/);
    await expect(service.register('a1', 'u1', 'otra')).rejects.toThrow(
      /no existe/,
    );
  });

  it('al retirarse antes del sorteo, los números siguientes bajan uno', async () => {
    const { prisma, service } = build();
    prisma.registration.findMany.mockResolvedValueOnce([
      { id: 'r1', status: 'PENDING', tournamentId: 't1', memberId: 'm1' },
    ]);
    prisma.tournamentParticipant.findUnique.mockResolvedValueOnce({
      id: 'p1',
      number: 3,
      _count: { matchEntries: 0 },
    });
    await service.withdraw('a1', 'u1');
    expect(prisma.registration.delete).toHaveBeenCalledWith({
      where: { id: 'r1' },
    });
    expect(prisma.tournamentParticipant.delete).toHaveBeenCalledWith({
      where: { id: 'p1' },
    });
    // Corre la serie en dos pasos (por el índice único)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual(['t1', 3]);
  });

  it('tras el sorteo los números quedan fijos', async () => {
    const { prisma, service } = build();
    prisma.registration.findMany.mockResolvedValueOnce([
      { id: 'r1', status: 'PENDING', tournamentId: 't1', memberId: 'm1' },
    ]);
    prisma.tournamentParticipant.findUnique.mockResolvedValueOnce({
      id: 'p1',
      number: 3,
      _count: { matchEntries: 0 },
    });
    prisma.draw.count.mockResolvedValueOnce(1);
    await service.withdraw('a1', 'u1');
    expect(prisma.tournamentParticipant.delete).toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('si sigue inscrito en otra categoría conserva su número', async () => {
    const { prisma, service } = build();
    prisma.registration.findMany.mockResolvedValueOnce([
      { id: 'r1', status: 'PENDING', tournamentId: 't1', memberId: 'm1' },
    ]);
    prisma.registration.count.mockResolvedValueOnce(1);
    await service.withdraw('a1', 'u1', 'c1');
    expect(prisma.registration.findMany).toHaveBeenCalledWith({
      where: { tournamentId: 't1', memberId: 'm1', categoryId: 'c1' },
    });
    expect(prisma.tournamentParticipant.delete).not.toHaveBeenCalled();
  });

  it('el admin no puede quitar a quien ya está en el cuadro', async () => {
    const { prisma, service } = build();
    prisma.registration.findUnique.mockResolvedValueOnce({
      id: 'r1',
      tournamentId: 't1',
      memberId: 'm1',
      categoryId: 'c1',
    });
    prisma.matchEntry.count.mockResolvedValueOnce(1);
    await expect(service.removeRegistration('r1')).rejects.toThrow(
      /en el cuadro/,
    );
    expect(prisma.registration.delete).not.toHaveBeenCalled();
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
    prisma.registration.findMany.mockResolvedValueOnce([
      { id: 'r1', status: 'CONFIRMED' },
    ]);
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

  it('asigna una cuenta guardada y guarda aparte instrucciones y montos', async () => {
    const { prisma, service, activity } = build();
    await service.sync(activity as any, {
      bankAccountId: 'b1',
      paymentInfo: {
        instructions: '  Indica tu nombre ',
        fees: [
          { label: 'Socio', amount: 10000 },
          { label: ' ', amount: 0 },
        ],
      },
    });
    const data = (prisma.tournament.update.mock.calls as any)[0][0].data;
    expect(data.bankAccountId).toBe('b1');
    expect(data.paymentInfo).toEqual({
      instructions: 'Indica tu nombre',
      fees: [{ label: 'Socio', amount: 10000 }],
    });
  });

  it('una cuenta desactivada se conserva pero no se elige en otro torneo', async () => {
    const { prisma, service, activity, tournament } = build();
    prisma.bankAccount.findUnique.mockResolvedValue({
      ...tournament.bankAccount,
      isActive: false,
    });
    // El torneo ya la tenía: se puede guardar sin cambiarla
    await expect(
      service.sync(activity as any, { bankAccountId: 'b1' }),
    ).resolves.toBeUndefined();
    // Uno nuevo no puede elegirla
    await expect(
      service.sync({ ...activity, tournamentId: null } as any, {
        bankAccountId: 'b1',
      }),
    ).rejects.toThrow(/desactivada/);
    expect(prisma.tournament.create).not.toHaveBeenCalled();
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
