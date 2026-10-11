import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Activity,
  ActivityType,
  BankAccount,
  MemberStatus,
  Prisma,
  Registration,
  RegistrationStatus,
  Role,
  TournamentStatus,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { UploadService } from '../upload/upload.service';
import { TournamentDetailsDto } from './dto';

/// Reglamentos: PDF y documentos de Office/LibreOffice. Nada que el navegador
/// ejecute (HTML, SVG), porque se sirven desde el dominio de la API.
export const DOCUMENT_TYPES: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  '.pps': ['application/vnd.ms-powerpoint'],
  '.ppsx': [
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  '.odt': ['application/vnd.oasis.opendocument.text'],
  '.odp': ['application/vnd.oasis.opendocument.presentation'],
  '.ods': ['application/vnd.oasis.opendocument.spreadsheet'],
  '.rtf': ['application/rtf', 'text/rtf'],
  '.txt': ['text/plain'],
};
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

/// Lo que se guarda en Tournament.paymentInfo: lo propio de cada torneo
export interface TournamentPayment {
  instructions?: string;
  fees?: { label: string; amount: number }[];
}

/// Datos completos para transferir: la cuenta asignada más instrucciones y
/// montos del torneo. Es lo que reciben el correo y el socio.
export interface PaymentInfo extends TournamentPayment {
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  holderName?: string;
  holderRut?: string;
  holderEmail?: string;
}

/// Une la cuenta asignada con instrucciones y montos del torneo
export function paymentFor(tournament: {
  paymentInfo: Prisma.JsonValue;
  bankAccount: BankAccount | null;
}): PaymentInfo | null {
  const own = tournament.paymentInfo as TournamentPayment | null;
  const account = tournament.bankAccount;
  if (!own && !account) return null;
  return {
    ...(account && {
      bankName: account.bankName,
      accountType: account.accountType,
      accountNumber: account.accountNumber,
      holderName: account.holderName,
      holderRut: account.holderRut,
      holderEmail: account.holderEmail ?? undefined,
    }),
    instructions: own?.instructions,
    fees: own?.fees ?? [],
  };
}

/// Multer suele entregar el nombre del archivo leído como latin1
/// («ReglamentoÃ±o.pdf»): se recupera el UTF-8 solo si de verdad lo era.
export function utf8Name(name: string) {
  if (!/[\u0080-\u00ff]/.test(name)) return name;
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return fixed.includes('\uFFFD') ? name : fixed;
}

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

/**
 * La parte «torneo» de una actividad de tipo TOURNAMENT: su ficha en el
 * módulo de torneos (donde después irán grupos, sorteo y puntajes), los
 * jueces, el reglamento y la preinscripción con pago por transferencia.
 */
@Injectable()
export class ActivityTournamentsService {
  private readonly logger = new Logger(ActivityTournamentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * Deja la ficha del torneo al día con la actividad. Si deja de ser torneo,
   * la ficha se borra, salvo que ya tenga inscritos.
   */
  async sync(
    activity: Activity & { place: { name: string } | null },
    details: TournamentDetailsDto | undefined,
  ) {
    if (activity.type !== ActivityType.TOURNAMENT) {
      if (activity.tournamentId) await this.detach(activity);
      return;
    }

    if (details?.bankAccountId) {
      await this.assertBankAccount(
        details.bankAccountId,
        activity.tournamentId,
      );
    }

    const data = {
      name: activity.title,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
      location: activity.place?.name ?? null,
      ...(details && {
        rules:
          details.rules === undefined
            ? undefined
            : this.cleanHtml(details.rules),
        youtubeUrl:
          details.youtubeUrl === undefined
            ? undefined
            : details.youtubeUrl || null,
        registrationEnd:
          details.registrationEnd === undefined
            ? undefined
            : details.registrationEnd
              ? new Date(details.registrationEnd)
              : null,
        maxParticipants:
          details.maxParticipants === undefined
            ? undefined
            : details.maxParticipants || null,
        bankAccountId:
          details.bankAccountId === undefined
            ? undefined
            : details.bankAccountId || null,
        paymentInfo:
          details.paymentInfo === undefined
            ? undefined
            : details.paymentInfo
              ? (this.cleanPayment(
                  details.paymentInfo,
                ) as Prisma.InputJsonValue)
              : Prisma.DbNull,
      }),
    };

    let tournamentId = activity.tournamentId;
    if (tournamentId) {
      await this.prisma.tournament.update({
        where: { id: tournamentId },
        data,
      });
    } else {
      const created = await this.prisma.tournament.create({
        data: {
          ...data,
          slug: `${slugify(activity.title) || 'torneo'}-${randomBytes(3).toString('hex')}`,
          // Al publicarlo en el calendario queda abierto a inscripciones
          status: TournamentStatus.REGISTRATION_OPEN,
          // Una categoría para empezar; el admin la ajusta o agrega más
          categories: { create: { name: 'General' } },
        },
      });
      tournamentId = created.id;
      await this.prisma.activity.update({
        where: { id: activity.id },
        data: { tournamentId },
      });
    }

    if (details?.judgeIds) await this.setJudges(tournamentId, details.judgeIds);
  }

  /// Cuenta, instrucciones y montos del último torneo, para no reescribirlos
  /// en cada uno. Una cuenta ya desactivada no se propone.
  async paymentDefaults() {
    const last = await this.prisma.tournament.findFirst({
      where: {
        OR: [
          { paymentInfo: { not: Prisma.DbNull } },
          { bankAccountId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        paymentInfo: true,
        bankAccount: { select: { id: true, isActive: true } },
      },
    });
    if (!last) return null;
    const own = last.paymentInfo as TournamentPayment | null;
    return {
      bankAccountId: last.bankAccount?.isActive ? last.bankAccount.id : null,
      instructions: own?.instructions,
      fees: own?.fees ?? [],
    };
  }

  /// Borra la ficha del torneo de una actividad que se elimina
  async removeFor(activity: Pick<Activity, 'tournamentId'>) {
    if (!activity.tournamentId) return;
    await this.deleteTournament(activity.tournamentId);
  }

  // ---------- Inscripción de socios ----------

  /// Preinscripción: queda pendiente de pago y le llegan los datos por correo
  async register(activityId: string, userId: string, categoryId?: string) {
    const { activity, tournament } = await this.loadTournament(activityId);
    const member = await this.prisma.member.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!member) {
      throw new ForbiddenException('Solo los socios pueden inscribirse');
    }
    if (member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException(
        'Tu membresía no está activa: no puedes inscribirte',
      );
    }
    if (activity.cancelledAt) {
      throw new BadRequestException('El torneo está cancelado');
    }
    if (activity.endsAt.getTime() < Date.now()) {
      throw new BadRequestException('El torneo ya terminó');
    }
    if (tournament.status !== TournamentStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Las inscripciones no están abiertas');
    }
    if (
      tournament.registrationEnd &&
      tournament.registrationEnd.getTime() < Date.now()
    ) {
      throw new BadRequestException('El plazo de inscripción ya cerró');
    }

    const category = this.pickCategory(tournament.categories, categoryId);
    const existing = await this.prisma.registration.findUnique({
      where: {
        categoryId_memberId: { categoryId: category.id, memberId: member.id },
      },
    });
    if (existing && existing.status !== RegistrationStatus.WITHDRAWN) {
      throw new ConflictException(
        existing.status === RegistrationStatus.CONFIRMED
          ? `Ya estás inscrito en ${category.name}`
          : `Ya tienes una preinscripción en ${category.name}`,
      );
    }

    // El número se asigna con la primera inscripción del torneo y se comparte
    // entre categorías. El cupo cuenta arqueros, no inscripciones.
    const { registration, participant } = await this.prisma.$transaction(
      async (tx) => {
        await this.lockTournament(tx, tournament.id);
        let participant = await tx.tournamentParticipant.findUnique({
          where: {
            tournamentId_memberId: {
              tournamentId: tournament.id,
              memberId: member.id,
            },
          },
        });
        if (!participant) {
          const taken = await tx.tournamentParticipant.count({
            where: { tournamentId: tournament.id },
          });
          if (
            tournament.maxParticipants &&
            taken >= tournament.maxParticipants
          ) {
            throw new ConflictException('El torneo completó su cupo');
          }
          participant = await tx.tournamentParticipant.create({
            data: {
              tournamentId: tournament.id,
              memberId: member.id,
              number: taken + 1,
            },
          });
        }
        const registration = existing
          ? await tx.registration.update({
              where: { id: existing.id },
              data: {
                status: RegistrationStatus.PENDING,
                confirmedAt: null,
                confirmedById: null,
              },
            })
          : await tx.registration.create({
              data: {
                tournamentId: tournament.id,
                memberId: member.id,
                categoryId: category.id,
              },
            });
        return { registration, participant };
      },
    );

    const emailSent = await this.emailService.sendTournamentRegistrationEmail({
      to: member.user.email,
      name: member.user.name,
      memberName: [member.user.name, member.user.surname]
        .filter(Boolean)
        .join(' '),
      activity,
      paymentInfo: paymentFor(tournament),
    });
    return {
      status: registration.status,
      number: participant.number,
      category: category.name,
      emailSent,
    };
  }

  /// El socio retira su preinscripción. Una inscripción ya pagada se cancela
  /// hablando con el club (puede haber devolución de por medio).
  async withdraw(activityId: string, userId: string, categoryId?: string) {
    const { tournament } = await this.loadTournament(activityId);
    const member = await this.prisma.member.findUnique({ where: { userId } });
    if (!member) throw new ForbiddenException('Solo los socios se inscriben');
    const registrations = await this.prisma.registration.findMany({
      where: {
        tournamentId: tournament.id,
        memberId: member.id,
        ...(categoryId && { categoryId }),
      },
    });
    if (registrations.length === 0) {
      throw new NotFoundException('No tienes una inscripción en este torneo');
    }
    if (registrations.length > 1) {
      throw new BadRequestException('Indica de qué categoría te retiras');
    }
    const [registration] = registrations;
    if (registration.status === RegistrationStatus.CONFIRMED) {
      throw new BadRequestException(
        'Tu inscripción ya está pagada y confirmada: escríbenos para cancelarla',
      );
    }
    await this.deleteRegistration(registration);
    return { status: null };
  }

  // ---------- Administración de inscripciones ----------

  /// El admin verificó el comprobante (CONFIRMED) o lo devuelve a pendiente
  async setRegistrationStatus(
    registrationId: string,
    status: 'PENDING' | 'CONFIRMED',
    adminId: string,
  ) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        member: { include: { user: true } },
        tournament: { include: { activity: { include: { place: true } } } },
      },
    });
    if (!registration) throw new NotFoundException('Inscripción no encontrada');

    const confirming =
      status === RegistrationStatus.CONFIRMED &&
      registration.status !== RegistrationStatus.CONFIRMED;
    const updated = await this.prisma.registration.update({
      where: { id: registrationId },
      data:
        status === RegistrationStatus.CONFIRMED
          ? {
              status,
              confirmedAt: registration.confirmedAt ?? new Date(),
              confirmedById: registration.confirmedById ?? adminId,
            }
          : { status, confirmedAt: null, confirmedById: null },
    });

    let emailSent: boolean | null = null;
    const activity = registration.tournament.activity;
    if (confirming && activity) {
      emailSent = await this.emailService.sendTournamentConfirmedEmail({
        to: registration.member.user.email,
        name: registration.member.user.name,
        activity,
      });
    }
    return { id: updated.id, status: updated.status, emailSent };
  }

  async removeRegistration(registrationId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) throw new NotFoundException('Inscripción no encontrada');
    const matches = await this.prisma.matchEntry.count({
      where: {
        participant: {
          tournamentId: registration.tournamentId,
          memberId: registration.memberId,
        },
        match: { round: { categoryId: registration.categoryId } },
      },
    });
    if (matches > 0) {
      throw new ConflictException(
        'El arquero ya está en el cuadro de esta categoría: no se puede eliminar su inscripción',
      );
    }
    await this.deleteRegistration(registration);
    return { id: registrationId };
  }

  /**
   * Borra una inscripción. Si el arquero se queda sin categorías deja de ser
   * participante y, mientras no haya sorteo, los números siguientes bajan uno
   * para que la serie siga siendo 1..N. Tras el sorteo los números quedan fijos.
   */
  private async deleteRegistration(registration: Registration) {
    const { tournamentId, memberId } = registration;
    await this.prisma.$transaction(async (tx) => {
      await this.lockTournament(tx, tournamentId);
      await tx.registration.delete({ where: { id: registration.id } });
      const remaining = await tx.registration.count({
        where: { tournamentId, memberId },
      });
      if (remaining > 0) return;

      const participant = await tx.tournamentParticipant.findUnique({
        where: { tournamentId_memberId: { tournamentId, memberId } },
        include: { _count: { select: { matchEntries: true } } },
      });
      // Quien ya está en un cuadro conserva su número
      if (!participant || participant._count.matchEntries > 0) return;
      await tx.tournamentParticipant.delete({ where: { id: participant.id } });

      const drawn = await tx.draw.count({
        where: { round: { category: { tournamentId } } },
      });
      if (drawn > 0) return;
      // En dos pasos por el índice único (torneo, número)
      await tx.$executeRaw`
        UPDATE "tournament_participants" SET "number" = -"number"
        WHERE "tournamentId" = ${tournamentId} AND "number" > ${participant.number}`;
      await tx.$executeRaw`
        UPDATE "tournament_participants" SET "number" = -"number" - 1
        WHERE "tournamentId" = ${tournamentId} AND "number" < 0`;
    });
  }

  /// Serializa las altas y bajas de un torneo: los números no pueden chocar
  private async lockTournament(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT 1 FROM "tournaments" WHERE "id" = ${id} FOR UPDATE`;
  }

  /// La categoría elegida, o la única que tenga el torneo
  private pickCategory<T extends { id: string; name: string }>(
    categories: T[],
    categoryId?: string,
  ): T {
    if (categoryId) {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) throw new BadRequestException('Esa categoría no existe');
      return category;
    }
    if (categories.length === 1) return categories[0];
    if (categories.length === 0) {
      throw new BadRequestException('El torneo aún no tiene categorías');
    }
    throw new BadRequestException('Elige en qué categoría te inscribes');
  }

  // ---------- Reglamentos en archivo ----------

  async addDocument(activityId: string, file: Express.Multer.File) {
    const { tournament } = await this.loadTournament(activityId);
    const extension = path.extname(file.originalname).toLowerCase();
    if (!DOCUMENT_TYPES[extension]) {
      throw new BadRequestException(
        'Formato no permitido. Sube PDF, Word, PowerPoint, Excel u OpenDocument.',
      );
    }
    const stored = await this.uploadService.saveFile(file, 'documents');
    return this.prisma.tournamentDocument.create({
      data: {
        tournamentId: tournament.id,
        name: utf8Name(file.originalname),
        path: stored,
        mimeType: DOCUMENT_TYPES[extension][0],
        size: file.size,
      },
    });
  }

  async removeDocument(documentId: string) {
    const document = await this.prisma.tournamentDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    await this.prisma.tournamentDocument.delete({ where: { id: documentId } });
    await this.removeFile(document.path);
    return { id: documentId };
  }

  // ---------- Internos ----------

  private async loadTournament(activityId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: {
        place: true,
        tournament: {
          include: {
            bankAccount: true,
            categories: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    if (activity.type !== ActivityType.TOURNAMENT || !activity.tournament) {
      throw new BadRequestException('Esta actividad no es un torneo');
    }
    return { activity, tournament: activity.tournament };
  }

  /// Una cuenta desactivada se puede conservar, pero no elegir de nuevo
  private async assertBankAccount(id: string, tournamentId: string | null) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!account) throw new BadRequestException('La cuenta bancaria no existe');
    if (account.isActive) return;
    const current = tournamentId
      ? await this.prisma.tournament.findUnique({
          where: { id: tournamentId },
          select: { bankAccountId: true },
        })
      : null;
    if (current?.bankAccountId !== id) {
      throw new BadRequestException('Esa cuenta bancaria está desactivada');
    }
  }

  private async setJudges(tournamentId: string, judgeIds: string[]) {
    const ids = [...new Set(judgeIds)];
    if (ids.length) {
      const valid = await this.prisma.users.count({
        where: {
          id: { in: ids },
          isActive: true,
          userRoles: { in: [Role.ADMIN, Role.JUDGE] },
        },
      });
      if (valid !== ids.length) {
        throw new BadRequestException(
          'Los jueces deben ser usuarios activos con rol de administrador o juez',
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.tournamentJudge.deleteMany({ where: { tournamentId } }),
      this.prisma.tournamentJudge.createMany({
        data: ids.map((userId) => ({ tournamentId, userId })),
      }),
    ]);
  }

  private async detach(activity: Activity) {
    const registrations = await this.prisma.registration.count({
      where: {
        tournamentId: activity.tournamentId!,
        status: { not: RegistrationStatus.WITHDRAWN },
      },
    });
    if (registrations > 0) {
      throw new ConflictException(
        'Este torneo ya tiene socios inscritos: no puede cambiar de tipo',
      );
    }
    await this.prisma.activity.update({
      where: { id: activity.id },
      data: { tournamentId: null },
    });
    await this.deleteTournament(activity.tournamentId!);
  }

  /// Borra la ficha y sus archivos (sin binarios huérfanos)
  private async deleteTournament(id: string) {
    const documents = await this.prisma.tournamentDocument.findMany({
      where: { tournamentId: id },
      select: { path: true },
    });
    await this.prisma.tournament.delete({ where: { id } });
    await Promise.all(documents.map((d) => this.removeFile(d.path)));
  }

  private async removeFile(relativePath: string) {
    await this.uploadService.removeFile(relativePath).catch((error) => {
      // Ya no estaba: no hay nada que limpiar
      if (error.code !== 'ENOENT') {
        this.logger.warn(`No se pudo borrar ${relativePath}: ${error.message}`);
      }
    });
  }

  private cleanPayment(info: TournamentPayment): TournamentPayment {
    return {
      instructions: info.instructions?.trim() || undefined,
      fees: (info.fees ?? []).filter((f) => f.label.trim()),
    };
  }

  private cleanHtml(html?: string | null) {
    if (!html) return null;
    return html.replace(/<p>\s*<\/p>/g, '').trim() ? html : null;
  }
}
