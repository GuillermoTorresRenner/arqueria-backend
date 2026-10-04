import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountTokensService } from './account-tokens.service';

describe('AccountTokensService', () => {
  process.env.JWT_SECRET = 'secreto-de-test';
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  let user: any;
  let tokens: AccountTokensService;

  beforeEach(() => {
    user = { id: 'u1', email: 'ana@correo.cl', password: '$2b$10$hashA' };
    const prisma = {
      users: { findUnique: jest.fn(async () => ({ ...user })) },
    };
    tokens = new AccountTokensService(jwt, prisma as any);
  });

  it('un token válido devuelve al dueño de la cuenta', async () => {
    const token = await tokens.create(user, 'activation');
    await expect(tokens.verify(token, 'activation')).resolves.toMatchObject({
      id: 'u1',
    });
  });

  it('un enlace de activación no sirve para recuperar la contraseña (ni al revés)', async () => {
    const activation = await tokens.create(user, 'activation');
    const reset = await tokens.create(user, 'password_reset');
    await expect(
      tokens.verify(activation, 'password_reset'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(tokens.verify(reset, 'activation')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deja de valer en cuanto cambia la contraseña (un solo uso)', async () => {
    const token = await tokens.create(user, 'password_reset');
    user.password = '$2b$10$hashNuevo';
    await expect(tokens.verify(token, 'password_reset')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza tokens falsificados o basura', async () => {
    const forged = await jwt.signAsync({
      sub: 'u1',
      email: 'ana@correo.cl',
      purpose: 'activation',
    });
    await expect(tokens.verify(forged, 'activation')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(tokens.verify('basura', 'activation')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('describe la validez para el texto del correo', () => {
    expect(tokens.validity('activation')).toBe('7 días');
    expect(tokens.validity('password_reset')).toBe('1 hora');
  });
});
