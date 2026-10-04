import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AccountTokensService } from '../account-tokens/account-tokens.service';

describe('AuthService · contraseñas desde enlaces del correo', () => {
  process.env.JWT_SECRET = 'secreto-de-test';
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  let user: any;
  let email: any;
  let tokens: AccountTokensService;
  let service: AuthService;

  beforeEach(() => {
    user = {
      id: 'u1',
      email: 'ana@correo.cl',
      password: '$2b$10$hashinicialaleatorio',
      emailVerified: false,
      emailVerifiedAt: null,
      isActive: true,
      userRoles: 'MEMBER',
      name: 'Ana',
      surname: 'Arquera',
    };
    const prisma = {
      users: {
        findUnique: jest.fn(async () => ({ ...user })),
        update: jest.fn(async ({ data }) => {
          user = { ...user, ...data };
          return { ...user };
        }),
      },
    };
    const users = {
      findByEmail: jest.fn(async (e: string) =>
        e === user.email ? { ...user } : null,
      ),
      updateRefreshToken: jest.fn(),
      updateLastConnection: jest.fn(),
    };
    email = { sendPasswordResetEmail: jest.fn().mockResolvedValue(true) };
    tokens = new AccountTokensService(jwt, prisma as any);
    service = new AuthService(
      users as any,
      jwt,
      email,
      { log: jest.fn() } as any,
      prisma as any,
      tokens,
    );
  });

  it('activación: fija la contraseña, confirma el correo con fecha e inicia sesión', async () => {
    const token = await tokens.create(user, 'activation');
    const session = await service.verifyEmail(token, 'Nueva123');

    expect(await bcrypt.compare('Nueva123', user.password)).toBe(true);
    expect(user.emailVerified).toBe(true);
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(session.accessToken).toBeTruthy();
  });

  it('conserva la fecha de confirmación original al recuperar la contraseña', async () => {
    const original = new Date('2026-01-01T00:00:00Z');
    user.emailVerified = true;
    user.emailVerifiedAt = original;
    const token = await tokens.create(user, 'password_reset');
    await service.resetPassword(token, 'Otra1234');
    expect(user.emailVerifiedAt).toEqual(original);
  });

  it('recuperación: el enlace sirve una sola vez y cierra las demás sesiones', async () => {
    const token = await tokens.create(user, 'password_reset');
    await service.resetPassword(token, 'Nueva123');
    expect(user.refreshToken).toBeNull();
    await expect(
      service.resetPassword(token, 'Hackeo123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forgotPassword responde igual exista o no la cuenta', async () => {
    const known = await service.forgotPassword('ana@correo.cl');
    const unknown = await service.forgotPassword('nadie@correo.cl');
    expect(known).toEqual(unknown);
    expect(email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@correo.cl', validity: '1 hora' }),
    );
  });

  it('no envía recuperación a una cuenta desactivada', async () => {
    user.isActive = false;
    await service.forgotPassword('ana@correo.cl');
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
