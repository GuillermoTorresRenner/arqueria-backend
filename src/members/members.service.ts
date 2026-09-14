import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateMemberDto,
  FilterMemberDto,
  UpdateCategoryDto,
  UpdateMemberDto,
} from './dto';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (filter.search) {
      where.user = {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' } },
          { surname: { contains: filter.search, mode: 'insensitive' } },
          { email: { contains: filter.search, mode: 'insensitive' } },
        ],
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

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.member.delete({ where: { id } });
    return { message: 'Socio eliminado' };
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
