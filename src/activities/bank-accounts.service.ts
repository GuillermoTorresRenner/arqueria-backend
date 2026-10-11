import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto';

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.bankAccount.findMany({
      orderBy: [
        { isActive: 'desc' },
        { bankName: 'asc' },
        { holderName: 'asc' },
      ],
      include: { _count: { select: { tournaments: true } } },
    });
  }

  async create(dto: CreateBankAccountDto) {
    try {
      return await this.prisma.bankAccount.create({
        data: { ...dto, holderEmail: dto.holderEmail || null },
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    await this.findOne(id);
    try {
      return await this.prisma.bankAccount.update({
        where: { id },
        data: {
          ...dto,
          holderEmail:
            dto.holderEmail === undefined ? undefined : dto.holderEmail || null,
        },
      });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /// Una cuenta asignada a torneos no se borra (perderían los datos de pago):
  /// se desactiva para que deje de ofrecerse.
  async remove(id: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: { _count: { select: { tournaments: true } } },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (account._count.tournaments > 0) {
      throw new ConflictException(
        `La cuenta de ${account.holderName} está asignada a torneos y no se puede eliminar. Desactívala para que no se ofrezca en los nuevos.`,
      );
    }
    await this.prisma.bankAccount.delete({ where: { id } });
    return { id };
  }

  async findOne(id: string) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return account;
  }

  private translate(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        'Ya existe una cuenta con ese banco y número',
      );
    }
    return error;
  }
}
