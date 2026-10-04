import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { buildUserAvatarUrl } from '../users/user.helper';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../logger/logger.service';
import { AccountTokensService } from '../account-tokens/account-tokens.service';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly loggerService: LoggerService,
    private readonly prismaService: PrismaService,
    private readonly accountTokens: AccountTokensService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      // Log de intento de login con email no encontrado
      await this.loggerService.log({
        level: 'WARN',
        message: 'Intento de login fallido: usuario no encontrado',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: null,
        userId: null,
        description: `Email: ${loginDto.email}`,
      });
      throw new NotFoundException('Usuario o Contraseña incorrectos ');
    }

    if (!bcrypt.compareSync(loginDto.password, user.password)) {
      // Log de intento de login con contraseña incorrecta
      await this.loggerService.log({
        level: 'WARN',
        message: 'Intento de login fallido: contraseña incorrecta',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        description: `Email: ${user.email}`,
      });
      throw new NotFoundException('Usuario o Contraseña incorrectos');
    }

    // Verificar que el usuario esté activo
    if (!user.isActive) {
      // Log de intento de login con usuario inactivo
      await this.loggerService.log({
        level: 'WARN',
        message: 'Intento de login fallido: usuario inactivo',
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        description: `Email: ${user.email}`,
      });
      throw new UnauthorizedException(
        'Usuario desactivado. Contacte al administrador',
      );
    }

    const session = await this.issueSession(user);

    // Log de login exitoso
    await this.loggerService.log({
      level: 'INFO',
      message: 'Login exitoso',
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
      description: `Usuario: ${user.name} ${user.surname}, Email: ${user.email}, Rol: ${user.userRoles}`,
    });

    return session;
  }

  /// Emite access + refresh token, guarda el refresh y actualiza la última
  /// conexión. Lo comparten el login y la validación del correo.
  private async issueSession(user: {
    id: string;
    email: string;
    userRoles: string;
    name: string | null;
    surname: string | null;
  }) {
    const accessToken = await this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
        role: user.userRoles,
        name: user.name,
        surname: user.surname,
      },
      { expiresIn: '1h' },
    );
    const refreshToken = await this.jwtService.signAsync(
      { id: user.id },
      { expiresIn: '24h' },
    );
    await this.usersService.updateRefreshToken(user.id, refreshToken);
    await this.usersService.updateLastConnection(user.id);

    return {
      accessToken,
      refreshToken,
      user: await this.formatUserDataForResponse(user),
    };
  }

  // ---------- Contraseñas desde enlaces del correo ----------
  // Nadie escribe la contraseña de otro: se crea (activación) o se recupera
  // siempre desde un enlace de un solo uso enviado al correo del dueño.

  /// Fija la contraseña elegida desde un enlace del correo. Usar el enlace
  /// demuestra que el correo es suyo: queda confirmado (con fecha la primera
  /// vez). Cierra las demás sesiones e inicia una nueva.
  private async setPasswordFromLink(
    user: { id: string; isActive: boolean; emailVerifiedAt: Date | null },
    password: string,
    action: 'EMAIL_VERIFIED' | 'PASSWORD_RESET',
  ) {
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Usuario desactivado. Contacte al administrador',
      );
    }
    const updated = await this.prismaService.users.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 10),
        emailVerified: true,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        refreshToken: null,
      },
    });
    await this.loggerService.log({
      level: 'INFO',
      message:
        action === 'EMAIL_VERIFIED'
          ? 'Cuenta activada desde el enlace del correo'
          : 'Contraseña recuperada desde el enlace del correo',
      action,
      entityType: 'User',
      entityId: user.id,
      userId: user.id,
    });
    return this.issueSession(updated);
  }

  /// Enlace de activación (inscripción web o alta desde el panel).
  async verifyEmail(token: string, password: string) {
    const user = await this.accountTokens.verify(token, 'activation');
    return this.setPasswordFromLink(user, password, 'EMAIL_VERIFIED');
  }

  /**
   * Solicitud de recuperación. Responde lo mismo exista o no la cuenta, para
   * no revelar qué correos están registrados; solo se envía a cuentas activas.
   */
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (user?.isActive) {
      const token = await this.accountTokens.create(user, 'password_reset');
      await this.emailService.sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        token,
        validity: this.accountTokens.validity('password_reset'),
      });
    }
    return {
      message:
        'Si hay una cuenta con ese correo, te enviamos un enlace para recuperar tu contraseña.',
    };
  }

  /// Enlace de recuperación: fija la contraseña nueva e inicia sesión.
  async resetPassword(token: string, password: string) {
    const user = await this.accountTokens.verify(token, 'password_reset');
    return this.setPasswordFromLink(user, password, 'PASSWORD_RESET');
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshToken)
      throw new UnauthorizedException('No autorizado');
    if (user.refreshToken !== refreshToken)
      throw new UnauthorizedException('Refresh token inválido');

    // Verificar que el usuario esté activo
    if (!user.isActive) {
      throw new UnauthorizedException(
        'Usuario desactivado. Contacte al administrador',
      );
    }

    // Validar refresh token
    try {
      await this.jwtService.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token expirado o inválido');
    }

    const jwtPayload = {
      id: user.id,
      email: user.email,
      role: user.userRoles,
      name: user.name,
      surname: user.surname,
    };

    // Generar nuevos tokens
    const newAccessToken = await this.jwtService.signAsync(jwtPayload, {
      expiresIn: '1h',
    });
    const newRefreshToken = await this.jwtService.signAsync(
      { id: user.id },
      { expiresIn: '24h' },
    );

    await this.usersService.updateRefreshToken(user.id, newRefreshToken);
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        role: user.userRoles,
      },
    };
  }

  async formatUserDataForResponse(user: any) {
    // Simplified response for boilerplate (no UserRole/Company models)
    return {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      role: user.userRoles || null,
      avatar: buildUserAvatarUrl(user.avatar),
      isActive: user.isActive,
      lastConnection: user.lastConnection,
    };
  }
}
