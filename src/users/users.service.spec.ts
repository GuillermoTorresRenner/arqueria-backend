import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.enum';

describe('UsersService', () => {
  const emailMock = () => ({
    sendAccountInviteEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  });
  const tokensMock = () => ({
    create: jest.fn(async (_u, purpose) => `tok-${purpose}`),
    validity: jest.fn(() => '7 días'),
  });
  const buildService = (
    prisma: any = {},
    email = emailMock(),
    tokens = tokensMock(),
  ) =>
    new UsersService(
      prisma,
      { log: jest.fn(), logEmailEvent: jest.fn() } as any,
      {} as any,
      email as any,
      tokens as any,
    );

  describe('formatUserResponse', () => {
    const raw = {
      id: 'u1',
      email: 'arquero@galadhrym.cl',
      password: '$2b$10$hashsupersecreto',
      refreshToken: 'token-secreto',
      name: 'Ana',
      surname: 'Arquera',
      phone: '+56912345678',
      userRoles: 'JUDGE',
      avatar: null,
      isActive: true,
      emailVerified: false,
      lastConnection: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('nunca expone la contraseña ni el refresh token', () => {
      const out = buildService().formatUserResponse(raw) as Record<
        string,
        unknown
      >;
      expect(out).not.toHaveProperty('password');
      expect(out).not.toHaveProperty('refreshToken');
    });

    it('expone los campos del CRUD, incluido el teléfono', () => {
      const out = buildService().formatUserResponse(raw) as Record<
        string,
        unknown
      >;
      expect(out).toMatchObject({
        id: 'u1',
        email: 'arquero@galadhrym.cl',
        name: 'Ana',
        surname: 'Arquera',
        phone: '+56912345678',
        role: 'JUDGE',
      });
    });

    it('devuelve phone null cuando no está definido', () => {
      const out = buildService().formatUserResponse({
        ...raw,
        phone: undefined,
      }) as Record<string, unknown>;
      expect(out.phone).toBeNull();
    });
  });

  describe('changeOwnPassword', () => {
    const hash = bcrypt.hashSync('ClaveActual1', 10);
    const prismaWith = (update = jest.fn()) => ({
      users: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.cl',
          password: hash,
        }),
        update,
      },
    });

    it('rechaza una contraseña actual incorrecta (también a un admin)', async () => {
      const service = buildService(prismaWith());
      await expect(
        service.changeOwnPassword('u1', {
          currentPassword: 'Incorrecta1',
          newPassword: 'NuevaClave1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('guarda la nueva contraseña hasheada e invalida las sesiones', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = buildService(prismaWith(update));
      await expect(
        service.changeOwnPassword('u1', {
          currentPassword: 'ClaveActual1',
          newPassword: 'NuevaClave1',
        }),
      ).resolves.toEqual({ message: 'Contraseña actualizada' });

      const data = update.mock.calls[0][0].data;
      expect(bcrypt.compareSync('NuevaClave1', data.password)).toBe(true);
      expect(data.refreshToken).toBeNull();
    });

    it('falla si el usuario no existe', async () => {
      const service = buildService({
        users: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.changeOwnPassword('nope', {
          currentPassword: 'x',
          newPassword: 'NuevaClave1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('register', () => {
    const created = {
      id: 'u9',
      email: 'nuevo@galadhrym.cl',
      password: 'hash-aleatorio',
      name: 'Nuevo',
      surname: 'Arquero',
      phone: '+56900000000',
      userRoles: 'JUDGE',
      avatar: null,
      isActive: true,
      emailVerified: false,
      emailVerifiedAt: null,
      lastConnection: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prismaMock = () => ({
      users: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    });

    it('crea la cuenta sin que nadie elija la contraseña y envía la invitación', async () => {
      const prisma = prismaMock();
      const email = emailMock();
      const tokens = tokensMock();
      const service = buildService(prisma, email, tokens);

      const out = (await service.register({
        email: 'nuevo@galadhrym.cl',
        name: 'Nuevo',
        surname: 'Arquero',
        phone: '+56900000000',
        role: Roles.JUDGE,
      })) as Record<string, unknown>;

      const data = prisma.users.create.mock.calls[0][0].data;
      expect(data.phone).toBe('+56900000000');
      expect(data.password).toMatch(/^\$2[aby]\$/); // hash de algo aleatorio
      expect(tokens.create).toHaveBeenCalledWith(created, 'activation');
      expect(email.sendAccountInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'nuevo@galadhrym.cl',
          role: 'JUDGE',
          token: 'tok-activation',
        }),
      );
      expect(out).not.toHaveProperty('password');
      expect(out.emailSent).toBe(true);
    });
  });

  describe('sendAccessEmail', () => {
    const userWith = (over: object) => ({
      users: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.cl',
          password: 'h',
          name: 'Ana',
          userRoles: 'JUDGE',
          isActive: true,
          emailVerified: false,
          ...over,
        }),
      },
    });

    it('reenvía la invitación si la cuenta no se activó', async () => {
      const email = emailMock();
      const out = await buildService(userWith({}), email).sendAccessEmail('u1');
      expect(out).toEqual({ kind: 'invite', sent: true });
      expect(email.sendAccountInviteEmail).toHaveBeenCalled();
      expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('envía un enlace de recuperación si la cuenta ya está activa', async () => {
      const email = emailMock();
      const tokens = tokensMock();
      const out = await buildService(
        userWith({ emailVerified: true }),
        email,
        tokens,
      ).sendAccessEmail('u1');
      expect(out).toEqual({ kind: 'password_reset', sent: true });
      expect(tokens.create).toHaveBeenCalledWith(
        expect.anything(),
        'password_reset',
      );
    });

    it('no envía nada a una cuenta desactivada', async () => {
      const email = emailMock();
      await expect(
        buildService(userWith({ isActive: false }), email).sendAccessEmail(
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(email.sendAccountInviteEmail).not.toHaveBeenCalled();
    });
  });
});
