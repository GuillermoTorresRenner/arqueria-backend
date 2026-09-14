import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBlockDto,
  CreateSectionDto,
  ReorderBlockDto,
  UpdateBlockDto,
  UpdateSectionDto,
} from './dto';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  /// Vista pública: solo secciones y bloques activos, ya ordenados.
  /// Es el único endpoint que consume la landing.
  async getPublicContent() {
    const sections = await this.prisma.section.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        blocks: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    return sections.map((section) => ({
      key: section.key,
      title: section.title,
      blocks: section.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        data: block.data,
      })),
    }));
  }

  async getPublicSection(key: string) {
    const section = await this.prisma.section.findFirst({
      where: { key, isActive: true },
      include: {
        blocks: { where: { isActive: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!section) throw new NotFoundException(`Sección "${key}" no encontrada`);
    return section;
  }

  // ---------- Administración ----------

  /// Vista de admin: incluye lo desactivado, que es justo lo que hay que poder reactivar.
  findAllSections() {
    return this.prisma.section.findMany({
      orderBy: { order: 'asc' },
      include: { blocks: { orderBy: { order: 'asc' } } },
    });
  }

  async findSection(id: string) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: { blocks: { orderBy: { order: 'asc' } } },
    });
    if (!section) throw new NotFoundException('Sección no encontrada');
    return section;
  }

  async createSection(dto: CreateSectionDto) {
    const order = dto.order ?? (await this.nextSectionOrder());
    return this.prisma.section.create({ data: { ...dto, order } });
  }

  async updateSection(id: string, dto: UpdateSectionDto) {
    await this.findSection(id);
    return this.prisma.section.update({ where: { id }, data: dto });
  }

  async removeSection(id: string) {
    await this.findSection(id);
    // Los bloques caen por onDelete: Cascade
    await this.prisma.section.delete({ where: { id } });
    return { message: 'Sección eliminada' };
  }

  async createBlock(dto: CreateBlockDto) {
    await this.findSection(dto.sectionId);
    const order = dto.order ?? (await this.nextBlockOrder(dto.sectionId));
    return this.prisma.block.create({
      data: {
        sectionId: dto.sectionId,
        type: dto.type,
        isActive: dto.isActive ?? true,
        data: dto.data as Prisma.InputJsonValue,
        order,
      },
    });
  }

  async updateBlock(id: string, dto: UpdateBlockDto) {
    await this.findBlock(id);
    const { data, ...rest } = dto;
    return this.prisma.block.update({
      where: { id },
      data: {
        ...rest,
        ...(data !== undefined ? { data: data as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async removeBlock(id: string) {
    await this.findBlock(id);
    await this.prisma.block.delete({ where: { id } });
    return { message: 'Bloque eliminado' };
  }

  /// Reordena en una transacción: un orden a medio aplicar dejaría la landing incoherente.
  async reorderBlocks(sectionId: string, items: ReorderBlockDto[]) {
    await this.findSection(sectionId);

    const blocks = await this.prisma.block.findMany({
      where: { sectionId },
      select: { id: true },
    });
    const valid = new Set(blocks.map((b) => b.id));
    const foreign = items.filter((i) => !valid.has(i.id));
    if (foreign.length > 0) {
      throw new NotFoundException(
        `Bloques que no pertenecen a la sección: ${foreign
          .map((f) => f.id)
          .join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.block.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );

    return this.findSection(sectionId);
  }

  private async findBlock(id: string) {
    const block = await this.prisma.block.findUnique({ where: { id } });
    if (!block) throw new NotFoundException('Bloque no encontrado');
    return block;
  }

  private async nextSectionOrder() {
    const last = await this.prisma.section.findFirst({
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? -1) + 1;
  }

  private async nextBlockOrder(sectionId: string) {
    const last = await this.prisma.block.findFirst({
      where: { sectionId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? -1) + 1;
  }
}
