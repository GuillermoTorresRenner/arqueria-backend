import { ConflictException, NotFoundException } from '@nestjs/common';
import { MembersService } from './members.service';

describe('MembersService.remove', () => {
  const memberWith = (over: {
    role?: string;
    regs?: number;
    scores?: number;
    avatar?: string | null;
  }) => ({
    id: 'm1',
    user: {
      id: 'u1',
      userRoles: over.role ?? 'MEMBER',
      avatar: over.avatar ?? null,
    },
    _count: { registrations: over.regs ?? 0, scores: over.scores ?? 0 },
  });

  const build = (member: unknown) => {
    const prisma = {
      member: {
        findUnique: jest.fn().mockResolvedValue(member),
        delete: jest.fn().mockResolvedValue({}),
      },
      users: { delete: jest.fn().mockResolvedValue({}) },
    };
    const upload = { removeFile: jest.fn().mockResolvedValue(undefined) };
    const service = new MembersService(
      prisma as any,
      {} as any,
      {} as any,
      upload as any,
    );
    return { prisma, upload, service };
  };

  it('borra la cuenta del socio (la ficha cae en cascada) y su avatar', async () => {
    const { prisma, upload, service } = build(
      memberWith({ avatar: 'user_u1.webp' }),
    );
    await expect(service.remove('m1')).resolves.toEqual({
      message: 'Socio eliminado',
    });
    expect(prisma.users.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(upload.removeFile).toHaveBeenCalledWith('users_avatar/user_u1.webp');
  });

  it('se niega si participó en torneos, para no alterar resultados', async () => {
    const { prisma, service } = build(memberWith({ regs: 2, scores: 12 }));
    await expect(service.remove('m1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.users.delete).not.toHaveBeenCalled();
    expect(prisma.member.delete).not.toHaveBeenCalled();
  });

  it('con una cuenta del equipo solo borra la ficha, no el acceso al panel', async () => {
    const { prisma, service } = build(memberWith({ role: 'JUDGE' }));
    await service.remove('m1');
    expect(prisma.member.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(prisma.users.delete).not.toHaveBeenCalled();
  });

  it('no toca rutas arbitrarias aunque el avatar guardado sea raro', async () => {
    const { upload, service } = build(
      memberWith({ avatar: '../../dist/main.js' }),
    );
    await service.remove('m1');
    expect(upload.removeFile).not.toHaveBeenCalled();
  });

  it('404 si el socio no existe', async () => {
    const { service } = build(null);
    await expect(service.remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
