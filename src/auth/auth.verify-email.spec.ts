import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService · validación del correo', () => {
  process.env.JWT_SECRET = 'secreto-de-test';
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  let user: any;
  let service: AuthService;

  beforeEach(() => {
    user = {
      id: 'u1',
      email: 'ana@correo.cl',
      password: '$2b$10$hashinicialaleatorio',
      emailVerified: false,
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
      updateRefreshToken: jest.fn(),
      updateLastConnection: jest.fn(),
    };
    service = new AuthService(
      users as any,
      jwt,
      {} as any,
      { log: jest.fn() } as any,
      prisma as any,
    );
  });

  it('fija la contraseña, marca el correo como validado e inicia sesión', async () => {
    const token = await service.createEmailVerificationToken(user);
    const session = await service.verifyEmail(token, 'Nueva123');

    expect(user.emailVerified).toBe(true);
    expect(await bcrypt.compare('Nueva123', user.password)).toBe(true);
    expect(session.accessToken).toBeTruthy();
    expect(session.user).toMatchObject({
      email: 'ana@correo.cl',
      role: 'MEMBER',
    });
  });

  it('el enlace sirve una sola vez', async () => {
    const token = await service.createEmailVerificationToken(user);
    await service.verifyEmail(token, 'Nueva123');
    await expect(
      service.verifyEmail(token, 'OtraClave9'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un token firmado con otra clave o de otro tipo', async () => {
    const forged = await jwt.signAsync({
      sub: 'u1',
      email: 'ana@correo.cl',
      type: 'email_verification',
    });
    await expect(
      service.verifyEmail(forged, 'Nueva123'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.verifyEmail('basura', 'Nueva123'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
