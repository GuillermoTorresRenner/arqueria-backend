import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus, Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AccountTokensService } from '../account-tokens/account-tokens.service';
import { EmailService } from '../email/email.service';
import { UploadService } from '../upload/upload.service';
import { WHATSAPP_GROUP_URL } from '../config/club';
import {
  CreateCategoryDto,
  CreateMemberDto,
  FilterMemberDto,
  JoinClubDto,
  UpdateCategoryDto,
  UpdateMemberDto,
} from './dto';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountTokens: AccountTokensService,
    private readonly emailService: EmailService,
    private readonly uploadService: UploadService,
  ) {}

  // ---------- Inscripción pública («Súmate al club») ----------

  /**
   * Registra a una persona desde el formulario público y le envía el correo
   * para validar su cuenta. Devuelve la invitación al grupo de WhatsApp: el
   * sitio solo la muestra cuando el registro quedó guardado.
   */
  async join(dto: JoinClubDto) {
    const result = { whatsappUrl: WHATSAPP_GROUP_URL, emailSent: true };
    // Campo trampa relleno: es un bot. Se le responde como si nada para no
    // darle pistas, sin guardar ni enviar correo.
    if (dto.website) return result;

    const birthDate = this.parseBirthDate(dto.birthDate);
    const consentAt = new Date();
    const memberData = {
      birthDate,
      experience: dto.experience,
      marketingConsent: true,
      marketingConsentAt: consentAt,
    };

    const existing = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    // Una cuenta validada, o del equipo (admin/juez), no se toca desde un
    // formulario público: el enlace del correo permite fijar la contraseña.
    if (
      existing &&
      (existing.emailVerified || existing.userRoles !== Role.MEMBER)
    ) {
      throw new ConflictException(
        'Ya hay una cuenta con este correo. Inicia sesión para entrar.',
      );
    }

    let user: { id: string; email: string; password: string };
    try {
      if (existing) {
        // Se inscribió antes pero no validó: se actualizan sus datos y se le
        // reenvía el correo (sirve también para pedir un enlace nuevo).
        user = await this.prisma.users.update({
          where: { id: existing.id },
          data: {
            name: dto.name,
            surname: dto.surname,
            member: {
              upsert: { create: memberData, update: memberData },
            },
          },
        });
      } else {
        user = await this.prisma.users.create({
          data: {
            email: dto.email,
            name: dto.name,
            surname: dto.surname,
            userRoles: Role.MEMBER,
            emailVerified: false,
            // Contraseña aleatoria que nadie conoce: la cuenta no permite
            // entrar hasta que la persona crea la suya desde el correo.
            password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
            member: { create: memberData },
          },
        });
      }
    } catch (error) {
      // Dos envíos simultáneos con el mismo correo
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya hay una cuenta con este correo. Inicia sesión para entrar.',
        );
      }
      throw error;
    }

    const verifyToken = await this.accountTokens.create(user, 'activation');
    result.emailSent = await this.emailService.sendJoinWelcomeEmail({
      to: user.email,
      name: dto.name,
      verifyToken,
      validity: this.accountTokens.validity('activation'),
    });
    return result;
  }

  /// Fecha AAAA-MM-DD a medianoche UTC, entre 4 y 110 años de edad.
  private parseBirthDate(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (Number.isNaN(date.getTime()) || age < 4 || age > 110) {
      throw new BadRequestException('Revisa la fecha de nacimiento');
    }
    return date;
  }

  // ---------- Socios ----------

  async create(dto: CreateMemberDto) {
    const user = await this.prisma.users.findUnique({
      where: { id: dto.userId },
      include: { member: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (user.member) {
      throw new BadRequestException('El usuario ya tiene una ficha de socio');
    }

    const { categoryIds, birthDate, membershipEnd, ...rest } = dto;
    await this.assertCategoriesExist(categoryIds);

    return this.prisma.member.create({
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        membershipEnd: membershipEnd ? new Date(membershipEnd) : undefined,
        categories: categoryIds?.length
          ? { create: categoryIds.map((categoryId) => ({ categoryId })) }
          : undefined,
      },
      include: this.memberInclude,
    });
  }

  findAll(filter: FilterMemberDto = {}) {
    const where: Prisma.MemberWhereInput = {};

    if (filter.status) where.status = filter.status;
    if (filter.categoryId) {
      where.categories = { some: { categoryId: filter.categoryId } };
    }
    if (filter.experience) where.experience = filter.experience;
    // Cada palabra debe aparecer en el nombre, el apellido o el correo:
    // «ana arquera» encuentra a Ana Arquera aunque ningún campo tenga ambas.
    const words = filter.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (words.length) {
      where.user = {
        AND: words.map((word) => ({
          OR: [
            { name: { contains: word, mode: 'insensitive' as const } },
            { surname: { contains: word, mode: 'insensitive' as const } },
            { email: { contains: word, mode: 'insensitive' as const } },
          ],
        })),
      };
    }

    return this.prisma.member.findMany({
      where,
      include: this.memberInclude,
      orderBy: { memberNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: this.memberInclude,
    });
    if (!member) throw new NotFoundException('Socio no encontrado');
    return member;
  }

  async findByUserId(userId: string) {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      include: this.memberInclude,
    });
    if (!member) throw new NotFoundException('Este usuario no es socio');
    return member;
  }

  async update(id: string, dto: UpdateMemberDto) {
    await this.findOne(id);
    // userId se descarta: el socio no cambia de usuario en una actualización.
    const {
      categoryIds,
      birthDate,
      membershipEnd,
      userId: _userId,
      ...rest
    } = dto;
    await this.assertCategoriesExist(categoryIds);

    return this.prisma.member.update({
      where: { id },
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        membershipEnd: membershipEnd ? new Date(membershipEnd) : undefined,
        // Reemplaza el set completo de categorías cuando viene en el payload
        categories: categoryIds
          ? {
              deleteMany: {},
              create: categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: this.memberInclude,
    });
  }

  async updateStatus(id: string, status: MemberStatus) {
    await this.findOne(id);
    return this.prisma.member.update({
      where: { id },
      data: { status },
      include: this.memberInclude,
    });
  }

  /**
   * Elimina a un socio: su cuenta y su ficha (y su avatar del disco).
   *
   * Si ya participó en torneos se rechaza: inscripciones y puntajes cuelgan
   * del socio en cascada y borrarlo alteraría resultados y rankings ya
   * publicados. En ese caso se suspende. Si la cuenta es del equipo (admin o
   * juez) solo se borra la ficha de socio, no el acceso al panel.
   */
  async remove(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, userRoles: true, avatar: true } },
        _count: { select: { registrations: true, scores: true } },
      },
    });
    if (!member) throw new NotFoundException('Socio no encontrado');

    const { registrations, scores } = member._count;
    if (registrations > 0 || scores > 0) {
      throw new ConflictException(
        `No se puede eliminar: tiene ${registrations} inscripción(es) y ${scores} serie(s) puntuada(s) en torneos. Suspéndelo para conservar los resultados.`,
      );
    }

    if (member.user.userRoles === Role.MEMBER) {
      // Borra la cuenta; la ficha cae por onDelete: Cascade
      await this.prisma.users.delete({ where: { id: member.user.id } });
      await this.removeAvatar(member.user.avatar);
      return { message: 'Socio eliminado' };
    }
    await this.prisma.member.delete({ where: { id } });
    return {
      message: 'Ficha de socio eliminada (la cuenta del equipo se mantiene)',
    };
  }

  /// El avatar se guarda como `user_<id>.webp` o `users_avatar/user_<id>.webp`.
  private async removeAvatar(avatar: string | null) {
    if (!avatar) return;
    const file = avatar.replace(/^users_avatar\//, '');
    if (!/^[\w-]+\.webp$/.test(file)) return; // nunca rutas arbitrarias
    await this.uploadService.removeFile(`users_avatar/${file}`).catch(() => {
      /* si ya no existe, no hay nada que limpiar */
    });
  }

  // ---------- Categorías ----------

  findAllCategories(onlyActive = false) {
    return this.prisma.category.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
    });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: dto });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.assertCategoryExists(id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async removeCategory(id: string) {
    await this.assertCategoryExists(id);
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Categoría eliminada' };
  }

  private readonly memberInclude = {
    user: {
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        avatar: true,
        isActive: true,
      },
    },
    categories: { include: { category: true } },
  } satisfies Prisma.MemberInclude;

  private async assertCategoryExists(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return category;
  }

  private async assertCategoriesExist(ids?: string[]) {
    if (!ids?.length) return;
    const found = await this.prisma.category.count({
      where: { id: { in: ids } },
    });
    if (found !== ids.length) {
      throw new BadRequestException('Alguna categoría indicada no existe');
    }
  }
}
