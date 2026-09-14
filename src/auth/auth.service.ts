import {
  BadRequestException,
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
import { RegisterDto } from './dto/register.dto';
import { EmailService } from '../email/email.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoggerService } from '../logger/logger.service';
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly loggerService: LoggerService,
    private readonly prismaService: PrismaService,
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

    const jwtPayload = {
      id: user.id,
      email: user.email,
      role: user.userRoles,
      name: user.name,
      surname: user.surname,
    };

    // Generar access token (1 hour) y refresh token (24h)
    const accessToken = await this.jwtService.signAsync(jwtPayload, {
      expiresIn: '1h',
    });
    const refreshToken = await this.jwtService.signAsync(
      { id: user.id },
      { expiresIn: '24h' },
    );

    // Guardar refresh token en la base de datos
    await this.usersService.updateRefreshToken(user.id, refreshToken);

    // Actualizar última conexión
    await this.usersService.updateLastConnection(user.id);

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

    // Formatear datos del usuario para la respuesta
    const userData = await this.formatUserDataForResponse(user);

    return {
      accessToken,
      refreshToken,
      user: userData,
    };
  }

  async register(registerDto: RegisterDto) {
    const userExists = await this.usersService.findByEmail(registerDto.email);
    if (userExists) throw new BadRequestException('El usuario ya existe');
    // usersService.register ya devuelve la forma pública (sin password) y
    // dispara el correo de bienvenida.
    return this.usersService.register(registerDto);
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

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email } = resetPasswordDto;

    // Verificar que el usuario existe
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Generar token de reset con expiración de 15 minutos
    const resetPayload = {
      userId: user.id,
      email: user.email,
      type: 'password_reset',
    };

    const resetToken = await this.jwtService.signAsync(resetPayload, {
      expiresIn: '15m', // 15 minutos
    });

    // Enviar email de recuperación
    await this.emailService.sendPasswordResetEmail(
      user.email,
      resetToken,
      user.name || user.email,
    );

    return {
      message: 'Email de recuperación enviado correctamente',
      email: user.email,
    };
  }

  async changePassword(token: string, changePasswordDto: ChangePasswordDto) {
    try {
      // 1. Decodificar y validar el token JWT
      const payload = await this.jwtService.verifyAsync(token);

      // 2. Validar que sea un token de reset de contraseña
      if (payload.type !== 'password_reset') {
        throw new UnauthorizedException(
          'Token inválido para cambio de contraseña',
        );
      }

      // 3. Verificar que el usuario existe
      const user = await this.usersService.findById(payload.userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // 4. Verificar que el usuario esté activo
      if (!user.isActive) {
        throw new UnauthorizedException(
          'Usuario desactivado. Contacte al administrador',
        );
      }

      // 5. Verificar que el email del token coincida con el del usuario (seguridad extra)
      if (user.email !== payload.email) {
        throw new UnauthorizedException('Token no válido para este usuario');
      }

      // 6. Encriptar la nueva contraseña
      const hashedPassword = await bcrypt.hash(changePasswordDto.password, 10);

      // 7. Actualizar la contraseña en la base de datos
      await this.usersService.updatePassword(user.id, hashedPassword);

      // 8. Limpiar refresh token por seguridad (cerrar sesiones activas)
      await this.usersService.updateRefreshToken(user.id, null);

      // 9. Log del cambio exitoso de contraseña
      await this.loggerService.logPasswordChange({
        userId: user.id,
        email: user.email,
        status: 'success',
        tokenUsed: token.substring(0, 20) + '...', // Solo los primeros caracteres por seguridad
      });

      return {
        message: 'Contraseña actualizada exitosamente',
        email: user.email,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      // Log del error de cambio de contraseña
      let userId = 'unknown';
      let email = 'unknown';

      try {
        const payload = (await this.jwtService.decode(token)) as any;
        userId = payload?.userId || 'unknown';
        email = payload?.email || 'unknown';
      } catch {
        // Si no se puede decodificar, mantener unknown
      }

      await this.loggerService.logPasswordChange({
        userId,
        email,
        status: 'error',
        tokenUsed: token.substring(0, 20) + '...',
        error: error.message,
      });
      // Manejar errores específicos de JWT
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Token inválido');
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException(
          'El token ha expirado. Solicita un nuevo enlace de recuperación',
        );
      }

      // Re-lanzar errores conocidos
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Error genérico
      throw new BadRequestException('Error al cambiar contraseña');
    }
  }

  /**
   * Formatea los datos del usuario para la respuesta de login, register y me
   */
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
