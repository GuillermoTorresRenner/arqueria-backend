import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.enum';

describe('UsersService', () => {
  const buildService = (prisma: any = {}) =>
    new UsersService(
      prisma,
      { log: jest.fn(), logEmailEvent: jest.fn() } as any,
      {} as any,
      { sendWelcomeEmail: jest.fn().mockResolvedValue(true) } as any,
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

  describe('changePassword', () => {
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

    it('un usuario debe acreditar su contraseña actual', async () => {
      const service = buildService(prismaWith());
      await expect(
        service.changePassword(
          'u1',
          { newPassword: 'NuevaClave1' },
          Roles.MEMBER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una contraseña actual incorrecta', async () => {
      const service = buildService(prismaWith());
      await expect(
        service.changePassword(
          'u1',
          { currentPassword: 'Incorrecta1', newPassword: 'NuevaClave1' },
          Roles.MEMBER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta el cambio con la contraseña actual correcta', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = buildService(prismaWith(update));
      await expect(
        service.changePassword(
          'u1',
          { currentPassword: 'ClaveActual1', newPassword: 'NuevaClave1' },
          Roles.MEMBER,
        ),
      ).resolves.toEqual({ message: 'Contraseña actualizada' });
      expect(update).toHaveBeenCalled();
    });

    it('un ADMIN puede restablecerla sin la actual', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = buildService(prismaWith(update));
      await expect(
        service.changePassword(
          'u1',
          { newPassword: 'NuevaClave1' },
          Roles.ADMIN,
        ),
      ).resolves.toEqual({ message: 'Contraseña actualizada' });
    });

    it('guarda la nueva contraseña hasheada e invalida las sesiones', async () => {
      const update = jest.fn().mockResolvedValue({});
      const service = buildService(prismaWith(update));
      await service.changePassword(
        'u1',
        { newPassword: 'NuevaClave1' },
        Roles.ADMIN,
      );

      const data = update.mock.calls[0][0].data;
      expect(data.password).not.toBe('NuevaClave1');
      expect(bcrypt.compareSync('NuevaClave1', data.password)).toBe(true);
      expect(data.refreshToken).toBeNull();
    });

    it('falla si el usuario no existe', async () => {
      const service = buildService({
        users: { findUnique: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.changePassword(
          'nope',
          { newPassword: 'NuevaClave1' },
          Roles.ADMIN,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('register', () => {
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'u9',
          email: 'nuevo@galadhrym.cl',
          password: 'hash',
          name: 'Nuevo',
          surname: 'Arquero',
          phone: '+56900000000',
          userRoles: 'MEMBER',
          avatar: null,
          isActive: true,
          emailVerified: false,
          lastConnection: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };

    it('persiste el teléfono y envía el correo de bienvenida', async () => {
      const email = { sendWelcomeEmail: jest.fn().mockResolvedValue(true) };
      const service = new UsersService(
        prisma as any,
        { log: jest.fn(), logEmailEvent: jest.fn() } as any,
        {} as any,
        email as any,
      );

      const out = (await service.register({
        email: 'nuevo@galadhrym.cl',
        password: 'Clave123',
        name: 'Nuevo',
        surname: 'Arquero',
        phone: '+56900000000',
        role: Roles.MEMBER,
      })) as Record<string, unknown>;

      expect(prisma.users.create.mock.calls[0][0].data.phone).toBe(
        '+56900000000',
      );
      expect(email.sendWelcomeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'nuevo@galadhrym.cl',
          phone: '+56900000000',
        }),
      );
      expect(out).not.toHaveProperty('password');
    });
  });
});
