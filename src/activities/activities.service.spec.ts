import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe('ActivitiesService', () => {
  const build = () => {
    const activity = {
      id: 'a1',
      title: 'Jornada de tiro',
      startsAt: future(48),
      endsAt: future(51),
      notifyMembers: false,
      notifiedAt: null as Date | null,
      place: null,
    };
    const prisma = {
      activity: {
        create: jest.fn(async ({ data }) => ({ ...activity, ...data })),
        update: jest.fn(async ({ data }) => ({ ...activity, ...data })),
        findUnique: jest.fn(async () => activity),
        findUniqueOrThrow: jest.fn(async () => activity),
        delete: jest.fn(),
      },
      place: { findUnique: jest.fn() },
      member: {
        findMany: jest.fn(async (_args?: any) => [
          { user: { email: 'a@x.cl', name: 'Ana' } },
          { user: { email: 'b@x.cl', name: 'Beto' } },
        ]),
        findUnique: jest.fn(),
      },
      activityAttendance: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(async () => 1),
      },
    };
    const email = { sendActivityEmail: jest.fn(async () => true) };
    const weather = {
      forActivity: jest.fn(async () => ({ available: false })),
    };
    const tournaments = {
      sync: jest.fn(async () => undefined),
      removeFor: jest.fn(),
    };
    const service = new ActivitiesService(
      prisma as any,
      email as any,
      weather as any,
      tournaments as any,
    );
    return { prisma, email, service, activity };
  };
  const flush = () => new Promise((r) => setImmediate(r));

  const dto = {
    title: 'Jornada de tiro',
    startsAt: future(48).toISOString(),
    endsAt: future(51).toISOString(),
  };

  it('crear sin avisar no escribe a nadie y deja la opción en false', async () => {
    const { prisma, email, service } = build();
    const r = await service.create({ ...dto, notifyMembers: false }, 'admin');
    expect(prisma.activity.create.mock.calls[0][0].data.notifyMembers).toBe(
      false,
    );
    expect(r.notification).toBeNull();
    await flush();
    expect(email.sendActivityEmail).not.toHaveBeenCalled();
  });

  it('crear avisando escribe a todos los socios activos', async () => {
    const { prisma, email, service } = build();
    const r = await service.create({ ...dto, notifyMembers: true }, 'admin');
    expect(r.notification).toEqual({ recipients: 2 });
    expect(prisma.member.findMany.mock.calls[0][0]?.where).toEqual({
      status: 'ACTIVE',
      user: { isActive: true },
    });
    await flush();
    await flush();
    expect(email.sendActivityEmail).toHaveBeenCalledTimes(2);
  });

  it('activar el aviso más tarde lo envía si aún no se avisó', async () => {
    const { service } = build();
    const r = await service.update('a1', { notifyMembers: true });
    expect(r.notification).toEqual({ recipients: 2 });
  });

  it('guardar otra vez una actividad ya avisada no repite el aviso', async () => {
    const { prisma, service, activity } = build();
    prisma.activity.update.mockResolvedValueOnce({
      ...activity,
      notifyMembers: true,
      notifiedAt: new Date(),
    });
    const r = await service.update('a1', { title: 'Otra' });
    expect(r.notification).toBeNull();
  });

  it('rechaza un término anterior al inicio', async () => {
    const { service } = build();
    await expect(
      service.create({ ...dto, endsAt: dto.startsAt }, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('solo los socios activos confirman asistencia', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.setAttendance('a1', 'u1', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'SUSPENDED',
    });
    await expect(
      service.setAttendance('a1', 'u1', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('en un torneo no se confirma asistencia: se inscribe', async () => {
    const { prisma, service, activity } = build();
    prisma.member.findUnique.mockResolvedValueOnce({
      id: 'm1',
      status: 'ACTIVE',
    });
    prisma.activity.findUnique.mockResolvedValueOnce({
      ...activity,
      type: 'TOURNAMENT',
    } as any);
    await expect(service.setAttendance('a1', 'u1', true)).rejects.toThrow(
      /inscribirse/,
    );
  });

  it('confirma y cancela la asistencia de un socio activo', async () => {
    const { prisma, service } = build();
    prisma.member.findUnique.mockResolvedValue({ id: 'm1', status: 'ACTIVE' });
    await expect(service.setAttendance('a1', 'u1', true)).resolves.toEqual({
      id: 'a1',
      attending: true,
      attendees: 1,
    });
    expect(prisma.activityAttendance.upsert).toHaveBeenCalled();
    await service.setAttendance('a1', 'u1', false);
    expect(prisma.activityAttendance.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 'a1', memberId: 'm1' },
    });
  });
});
