import { MembersService } from './members.service';

describe('MembersService.findAll (búsqueda)', () => {
  const build = () => {
    const prisma = { member: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new MembersService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { prisma, service };
  };
  const whereOf = (prisma: any) =>
    prisma.member.findMany.mock.calls[0][0].where;

  it('cada palabra debe aparecer en nombre, apellido o correo', async () => {
    const { prisma, service } = build();
    await service.findAll({ search: '  ana   arquera ' });
    const { user } = whereOf(prisma);
    expect(user.AND).toHaveLength(2);
    expect(user.AND[0].OR).toEqual([
      { name: { contains: 'ana', mode: 'insensitive' } },
      { surname: { contains: 'ana', mode: 'insensitive' } },
      { email: { contains: 'ana', mode: 'insensitive' } },
    ]);
    expect(user.AND[1].OR[0].name.contains).toBe('arquera');
  });

  it('filtra por experiencia y estado a la vez', async () => {
    const { prisma, service } = build();
    await service.findAll({ experience: 'NONE', status: 'ACTIVE' });
    expect(whereOf(prisma)).toEqual({ experience: 'NONE', status: 'ACTIVE' });
  });

  it('una búsqueda vacía no añade condiciones', async () => {
    const { prisma, service } = build();
    await service.findAll({ search: '   ' });
    expect(whereOf(prisma)).toEqual({});
  });
});
