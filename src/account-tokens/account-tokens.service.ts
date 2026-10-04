import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Para qué sirve un enlace enviado por correo:
 * - `activation`: crear la contraseña de una cuenta nueva (inscripción web o
 *   alta desde el panel). Al usarlo, el correo queda confirmado.
 * - `password_reset`: recuperar el acceso de una cuenta existente.
 */
export type AccountTokenPurpose = 'activation' | 'password_reset';

const TTL: Record<
  AccountTokenPurpose,
  { jwt: '7d' | '1h'; days?: number; hours?: number }
> = {
  activation: { jwt: '7d', days: 7 },
  password_reset: { jwt: '1h', hours: 1 },
};

/**
 * Enlaces de un solo uso para fijar la contraseña desde el correo. Nadie más
 * que el dueño de la cuenta escribe su contraseña.
 *
 * La clave de firma incluye el propósito y el hash de la contraseña vigente:
 * un token de activación no vale para recuperar (ni al revés), y en cuanto se
 * fija una contraseña nueva el hash cambia y todos los enlaces anteriores
 * dejan de valer. Sin guardar nada en BD.
 */
@Injectable()
export class AccountTokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private secret(purpose: AccountTokenPurpose, passwordHash: string) {
    return `${process.env.JWT_SECRET}:${purpose}:${passwordHash}`;
  }

  /// Validez legible para el texto del correo.
  validity(purpose: AccountTokenPurpose) {
    const t = TTL[purpose];
    return t.days
      ? `${t.days} días`
      : `${t.hours} hora${t.hours === 1 ? '' : 's'}`;
  }

  create(
    user: { id: string; email: string; password: string },
    purpose: AccountTokenPurpose,
  ) {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, purpose },
      {
        secret: this.secret(purpose, user.password),
        expiresIn: TTL[purpose].jwt,
      },
    );
  }

  /// Devuelve el usuario dueño del token o lanza 400 si no es válido, caducó,
  /// ya se usó o es de otro propósito.
  async verify(token: string, purpose: AccountTokenPurpose) {
    const invalid = new BadRequestException(
      purpose === 'activation'
        ? 'El enlace no es válido, caducó o ya se usó. Pide uno nuevo.'
        : 'El enlace de recuperación no es válido, caducó o ya se usó. Solicita otro.',
    );

    // decode no verifica la firma: solo dice de qué usuario es el token.
    const decoded = this.jwt.decode(token) as { sub?: string } | null;
    if (!decoded?.sub) throw invalid;
    const user = await this.prisma.users.findUnique({
      where: { id: decoded.sub },
    });
    if (!user) throw invalid;

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.secret(purpose, user.password),
      });
      if (payload.purpose !== purpose || payload.email !== user.email)
        throw invalid;
    } catch {
      throw invalid;
    }
    return user;
  }
}
