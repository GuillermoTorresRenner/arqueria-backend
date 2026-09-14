import {
  HttpException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.enum';
import { Prisma } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { FilterUserDto } from './dto/filter-user.dto';
import { LoggerService } from '../logger/logger.service';
import * as bcrypt from 'bcrypt';
import { UploadService } from '../upload/upload.service';
import { EmailService } from '../email/email.service';
import { buildUserAvatarUrl } from './user.helper';

@Injectable()
export class UsersService {
  constructor(
    private prismaService: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly uploadService: UploadService,
    private readonly emailService: EmailService,
  ) {}

  async register(createUserDto: CreateUserDto, avatar?: Express.Multer.File) {
    try {
      const userExists = await this.findByEmail(createUserDto.email);
      if (userExists) throw new BadRequestException('El usuario ya existe');

      const hashedPassword = bcrypt.hashSync(createUserDto.password, 10);

      // Roles ya es el enum de Prisma: no hace falta mapear nada.
      const user = await this.prismaService.users.create({
        data: {
          email: createUserDto.email,
          password: hashedPassword,
          name: createUserDto.name,
          surname: createUserDto.surname,
          phone: createUserDto.phone,
          userRoles: createUserDto.role,
        },
      });

      let avatarUrl: string | undefined;
      if (avatar) {
        avatarUrl = await this.uploadService.convertToUserAvatar(
          avatar,
          user.id,
        );
        await this.prismaService.users.update({
          where: { id: user.id },
          data: { avatar: avatarUrl },
        });
      }

      // Log de creación de usuario
      await this.loggerService.log({
        level: 'INFO',
        message: 'Usuario registrado',
        action: 'CREATE_USER',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        description: `Usuario: ${user.name} ${user.surname}, Email: ${user.email}, Rol: ${createUserDto.role}`,
      });

      // El correo se envía sin bloquear ni romper el alta: si el SMTP falla,
      // el usuario ya está creado y el fallo queda en los logs.
      await this.emailService.sendWelcomeEmail({
        to: user.email,
        name: user.name,
        surname: user.surname,
        phone: user.phone,
        role: user.userRoles,
      });

      // Nunca devolver el hash de la contraseña ni el refreshToken.
      return this.formatUserResponse(user);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        message: 'Error al registrar usuario',
        error,
      });
    }
  }

  async findAll(filterDto: FilterUserDto = {}) {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filterDto;

    const pageNum = Number.isNaN(Number(page)) ? 1 : Number(page);
    const limitNum = Number.isNaN(Number(limit)) ? 10 : Number(limit);

    const where: any = {};
    if (filterDto.name) {
      where.name = { contains: filterDto.name, mode: 'insensitive' };
    }
    if (filterDto.surname) {
      where.surname = { contains: filterDto.surname, mode: 'insensitive' };
    }
    if (filterDto.role) {
      where.userRoles = filterDto.role;
    }
    if (filterDto.isActive !== undefined) {
      where.isActive = filterDto.isActive === 'true';
    }

    const skip = (pageNum - 1) * limitNum;
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [users, totalCount] = await Promise.all([
      this.prismaService.users.findMany({
        where,
        take: limitNum,
        skip,
        orderBy,
      }),
      this.prismaService.users.count({ where }),
    ]);
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPreviousPage = pageNum > 1;

    // Mapear usuarios con URLs de avatar
    const usersWithAvatarUrl = users.map((user) =>
      this.formatUserResponse(user),
    );

    // Roles para selects basados en enum
    const roles = Object.values(Roles).map((r) => ({ id: r, name: r }));

    return {
      data: usersWithAvatarUrl,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        limit: limitNum,
        hasNextPage,
        hasPreviousPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        previousPage: hasPreviousPage ? pageNum - 1 : null,
      },
      selects: { roles },
    };
  }

  async findById(id: string) {
    const user = await this.prismaService.users.findUnique({
      where: { id },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    // Devuelve el registro COMPLETO: lo consumen AuthGuard y AuthService, que
    // necesitan `password` y `userRoles`. Para la API, usar findByIdPublic().
    return user;
  }

  /// Forma saneada para la API: sin password ni refreshToken.
  async findByIdPublic(id: string) {
    return this.formatUserResponse(await this.findById(id));
  }

  /**
   * Busca por correo devolviendo el registro COMPLETO. Lo usa AuthService para
   * comparar el hash de la contraseña, así que no debe sanearse aquí.
   */
  async findByEmail(email: string) {
    return this.prismaService.users.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async updateLastConnection(id: string) {
    const user = await this.prismaService.users.update({
      where: { id },
      data: { lastConnection: new Date() },
    });
    return {
      ...user,
      role: user.userRoles,
    };
  }

  async updateRefreshToken(id: string, refreshToken: string | null) {
    const user = await this.prismaService.users.update({
      where: { id },
      data: { refreshToken },
    });
    return {
      ...user,
    };
  }

  async updatePassword(id: string, hashedPassword: string) {
    try {
      const user = await this.prismaService.users.update({
        where: { id },
        data: { password: hashedPassword },
      });
      return {
        ...user,
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al actualizar contraseña',
        error,
      });
    }
  }

  async validatePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  async HashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10);
  }

  /**
   * Formatea la información del usuario incluyendo avatares, actividad de la empresa, módulos contratados y planes
   */
  /**
   * Forma pública de un usuario. Nunca incluye password ni refreshToken:
   * es lo que se devuelve por la API.
   */
  formatUserResponse(user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      phone: user.phone ?? null,
      role: user.userRoles,
      avatar: buildUserAvatarUrl(user.avatar),
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      lastConnection: user.lastConnection,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Cambia la contraseña. Si quien la cambia no es ADMIN, debe acreditar la
   * actual: sin eso, una sesión robada permitiría tomar la cuenta.
   */
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    requesterRole: Roles,
  ) {
    const user = await this.prismaService.users.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (requesterRole !== Roles.ADMIN) {
      if (!dto.currentPassword) {
        throw new BadRequestException('Debes indicar tu contraseña actual');
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) {
        throw new BadRequestException('La contraseña actual no es correcta');
      }
    }

    await this.prismaService.users.update({
      where: { id },
      data: {
        password: await bcrypt.hash(dto.newPassword, 10),
        // Al cambiar la clave se invalidan las sesiones abiertas
        refreshToken: null,
      },
    });

    await this.loggerService.log({
      level: 'INFO',
      message: 'Contraseña actualizada',
      action: 'CHANGE_PASSWORD',
      entityType: 'User',
      entityId: id,
      userId: id,
      description: `Usuario: ${user.email}`,
    });

    return { message: 'Contraseña actualizada' };
  }

  async getDashboardInfo() {
    const users = await this.prismaService.users.findMany();
    const totalUsers = users.length;

    // Contar roles (ahora user.userRoles es un enum simple)
    const admins = users.filter((u) => String(u.userRoles) === 'ADMIN').length;
    const judges = users.filter((u) => String(u.userRoles) === 'JUDGE').length;
    const members = users.filter(
      (u) => String(u.userRoles) === 'MEMBER',
    ).length;
    const activeUsers = users.filter((user) => user.isActive).length;
    const inactiveUsers = users.filter((user) => !user.isActive).length;
    const usersEmailsVerified = users.filter(
      (user) => user.emailVerified,
    ).length;
    const lastFiveUsers = users
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5)
      .map((user) => ({
        id: user.id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        roles: [user.userRoles],
        isActive: user.isActive,
        createdAt: user.createdAt,
      }));

    // Obtener datos para los gráficos
    const chartData = await this.getUsersCreatedByMonthYear();
    const pieChartData = await this.getUsersByRolePieChart();

    return {
      totalUsers,
      admins,
      judges,
      members,
      activeUsers,
      inactiveUsers,
      usersEmailsVerified,
      lastFiveUsers,
      chartData, // Datos para el gráfico de líneas
      pieChartData, // Datos para el gráfico de pie
    };
  }

  /**
   * Obtiene datos de usuarios creados por año y mes para gráficos de Recharts
   */
  async getUsersCreatedByMonthYear() {
    const users = await this.prismaService.users.findMany({
      select: {
        createdAt: true,
      },
    });

    // Agrupar usuarios por año y mes
    const usersByMonth = users.reduce(
      (acc, user) => {
        const date = new Date(user.createdAt);
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // getMonth() retorna 0-11, necesitamos 1-12
        const key = `${year}-${month.toString().padStart(2, '0')}`;

        if (!acc[key]) {
          acc[key] = {
            year,
            month,
            monthName: date.toLocaleDateString('es-ES', { month: 'long' }),
            date: key,
            count: 0,
          };
        }
        acc[key].count += 1;
        return acc;
      },
      {} as Record<string, any>,
    );

    // Convertir objeto a array y ordenar por fecha
    const sortedData = Object.values(usersByMonth)
      .sort((a: any, b: any) => a.date.localeCompare(b.date))
      .map((item: any) => ({
        name: `${item.monthName} ${item.year}`, // Para mostrar en el eje X
        month: item.monthName,
        year: item.year,
        date: item.date,
        users: item.count, // Nombre que usará Recharts
        label: `${item.count} usuarios`, // Para tooltips
      }));

    return {
      data: sortedData,
      totalPeriods: sortedData.length,
      totalUsers: users.length,
      summary: {
        firstMonth: sortedData[0]?.name || null,
        lastMonth: sortedData[sortedData.length - 1]?.name || null,
        maxUsers: Math.max(...sortedData.map((item: any) => item.users)),
        minUsers: Math.min(...sortedData.map((item: any) => item.users)),
      },
    };
  }

  /**
   * Obtiene datos de tipos de usuario para gráficos de pie de Recharts
   */
  async getUsersByRolePieChart() {
    const allUsers = await this.prismaService.users.findMany({
      select: { id: true, userRoles: true },
    });

    const roleCounts: Record<string, number> = {};
    allUsers.forEach((u) => {
      const role = String(u.userRoles);
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });

    const total = allUsers.length;
    const ROLE_META: Record<string, { name: string; fill: string }> = {
      ADMIN: { name: 'Administradores', fill: '#8884d8' },
      JUDGE: { name: 'Jueces', fill: '#82ca9d' },
      MEMBER: { name: 'Socios', fill: '#ffc658' },
    };

    const pieData = Object.entries(ROLE_META).map(([role, meta]) => {
      const value = roleCounts[role] || 0;
      return {
        name: meta.name,
        role,
        value,
        fill: meta.fill,
        label: `${value} usuarios`,
        percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0.0',
      };
    });

    return { pieData, total };
  }

  async getSelectUserCreationData() {
    const ROLE_LABELS: Record<string, string> = {
      ADMIN: 'Administrador',
      JUDGE: 'Juez',
      MEMBER: 'Socio',
    };
    return {
      roles: Object.values(Roles).map((r) => ({
        id: r,
        name: ROLE_LABELS[r] ?? r,
      })),
    };
  }

  /**
   * Actualiza los datos de un usuario.
   *
   * Solo se escriben los campos declarados en UpdateUserDto: la contraseña y
   * el rol no se tocan por aquí. Aceptar un objeto libre permitiría que un
   * payload inesperado modificara el rol o la clave.
   */
  async updateUserData(
    id: string,
    updateDto: UpdateUserDto,
    avatar?: Express.Multer.File,
  ) {
    try {
      const existingUser = await this.findById(id);

      // Si cambia el correo, no puede chocar con el de otra cuenta
      if (updateDto.email && updateDto.email !== existingUser.email) {
        const taken = await this.findByEmail(updateDto.email);
        if (taken) {
          throw new BadRequestException('Ese correo ya está en uso');
        }
      }

      const updateData: Prisma.UsersUpdateInput = {
        ...(updateDto.email !== undefined ? { email: updateDto.email } : {}),
        ...(updateDto.name !== undefined ? { name: updateDto.name } : {}),
        ...(updateDto.surname !== undefined
          ? { surname: updateDto.surname }
          : {}),
        ...(updateDto.phone !== undefined ? { phone: updateDto.phone } : {}),
        ...(updateDto.role !== undefined ? { userRoles: updateDto.role } : {}),
        ...(updateDto.isActive !== undefined
          ? { isActive: updateDto.isActive }
          : {}),
      };

      let avatarUrl: string | undefined;
      if (avatar) {
        // Eliminar la imagen anterior si existe
        if (existingUser.avatar) {
          const oldFilename = existingUser.avatar.replace('users_avatar/', '');
          const oldFilePath = path.join(
            this.uploadService.usersAvatarPath,
            oldFilename,
          );
          try {
            await this.uploadService.removeFile(oldFilePath);
          } catch (error) {
            // Log error but continue
            await this.loggerService.log({
              level: 'WARN',
              message: 'Error al eliminar avatar anterior',
              action: 'DELETE_OLD_AVATAR',
              entityType: 'User',
              entityId: id,
              userId: id,
              description: `Error: ${error.message}`,
            });
          }
        }
        // Subir la nueva imagen
        avatarUrl = await this.uploadService.convertToUserAvatar(avatar, id);
        updateData.avatar = avatarUrl;
      }

      const user = await this.prismaService.users.update({
        where: { id },
        data: updateData,
      });

      // Log de actualización de datos de usuario
      await this.loggerService.log({
        level: 'INFO',
        message: 'Datos de usuario actualizados',
        action: 'UPDATE_USER_DATA',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        description: `Usuario: ${user.name} ${user.surname}, Email: ${user.email}, Campos actualizados: ${Object.keys(updateData).join(', ')}`,
      });

      return this.formatUserResponse(user);
    } catch (error) {
      // Un 400 legítimo ("ese correo ya está en uso") no debe salir como 500.
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        message: 'Error al actualizar datos del usuario',
        error,
      });
    }
  }

  async desactivateUser(id: string) {
    try {
      const existingUser = await this.findById(id);
      const user = await this.prismaService.users.update({
        where: { id },
        data: { isActive: false },
      });

      // Log de desactivación de usuario
      await this.loggerService.log({
        level: 'WARN',
        message: 'Usuario desactivado',
        action: 'DEACTIVATE_USER',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        description: `Usuario: ${user.name} ${user.surname}, Email: ${user.email}, Rol: ${existingUser.userRoles || 'N/A'}`,
      });

      return this.formatUserResponse(user);
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al desactivar usuario',
        error,
      });
    }
  }

  async activateUser(id: string) {
    try {
      const existingUser = await this.findById(id);
      const user = await this.prismaService.users.update({
        where: { id },
        data: { isActive: true },
      });

      // Log de activación de usuario
      await this.loggerService.log({
        level: 'INFO',
        message: 'Usuario activado',
        action: 'ACTIVATE_USER',
        entityType: 'User',
        entityId: user.id,
        userId: user.id,
        description: `Usuario: ${user.name} ${user.surname}, Email: ${user.email}, Rol: ${existingUser.userRoles || 'N/A'}`,
      });

      return this.formatUserResponse(user);
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al activar usuario',
        error,
      });
    }
  }
}
