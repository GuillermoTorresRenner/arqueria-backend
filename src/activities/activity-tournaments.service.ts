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
  MemberStatus,
  Prisma,
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

export interface PaymentInfo {
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  holderName?: string;
  holderRut?: string;
  holderEmail?: string;
  instructions?: string;
  fees?: { label: string; amount: number }[];
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

  /// Datos de pago del último torneo, para no reescribirlos en cada uno
  async paymentDefaults() {
    const last = await this.prisma.tournament.findFirst({
      where: { paymentInfo: { not: Prisma.DbNull } },
      orderBy: { createdAt: 'desc' },
      select: { paymentInfo: true },
    });
    return (last?.paymentInfo as PaymentInfo | null) ?? null;
  }

  /// Borra la ficha del torneo de una actividad que se elimina
  async removeFor(activity: Pick<Activity, 'tournamentId'>) {
    if (!activity.tournamentId) return;
    await this.deleteTournament(activity.tournamentId);
  }

  // ---------- Inscripción de socios ----------

  /// Preinscripción: queda pendiente de pago y le llegan los datos por correo
  async register(activityId: string, userId: string) {
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

    const key = {
      tournamentId_memberId: {
        tournamentId: tournament.id,
        memberId: member.id,
      },
    };
    const existing = await this.prisma.registration.findUnique({ where: key });
    if (existing && existing.status !== RegistrationStatus.WITHDRAWN) {
      throw new ConflictException(
        existing.status === RegistrationStatus.CONFIRMED
          ? 'Ya estás inscrito en este torneo'
          : 'Ya tienes una preinscripción en este torneo',
      );
    }

    if (tournament.maxParticipants) {
      const taken = await this.prisma.registration.count({
        where: {
          tournamentId: tournament.id,
          status: { not: RegistrationStatus.WITHDRAWN },
        },
      });
      if (taken >= tournament.maxParticipants) {
        throw new ConflictException('El torneo completó su cupo');
      }
    }

    const registration = existing
      ? await this.prisma.registration.update({
          where: key,
          data: {
            status: RegistrationStatus.PENDING,
            confirmedAt: null,
            confirmedById: null,
          },
        })
      : await this.prisma.registration.create({
          data: { tournamentId: tournament.id, memberId: member.id },
        });

    const emailSent = await this.emailService.sendTournamentRegistrationEmail({
      to: member.user.email,
      name: member.user.name,
      memberName: [member.user.name, member.user.surname]
        .filter(Boolean)
        .join(' '),
      activity,
      paymentInfo: tournament.paymentInfo as PaymentInfo | null,
    });
    return { status: registration.status, emailSent };
  }

  /// El socio retira su preinscripción. Una inscripción ya pagada se cancela
  /// hablando con el club (puede haber devolución de por medio).
  async withdraw(activityId: string, userId: string) {
    const { tournament } = await this.loadTournament(activityId);
    const member = await this.prisma.member.findUnique({ where: { userId } });
    if (!member) throw new ForbiddenException('Solo los socios se inscriben');
    const registration = await this.prisma.registration.findUnique({
      where: {
        tournamentId_memberId: {
          tournamentId: tournament.id,
          memberId: member.id,
        },
      },
    });
    if (!registration || registration.status === RegistrationStatus.WITHDRAWN) {
      throw new NotFoundException('No tienes una inscripción en este torneo');
    }
    if (registration.status === RegistrationStatus.CONFIRMED) {
      throw new BadRequestException(
        'Tu inscripción ya está pagada y confirmada: escríbenos para cancelarla',
      );
    }
    await this.prisma.registration.delete({ where: { id: registration.id } });
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
    const scores = await this.prisma.score.count({
      where: {
        memberId: registration.memberId,
        round: { tournamentId: registration.tournamentId },
      },
    });
    if (scores > 0) {
      throw new ConflictException(
        'El arquero ya tiene puntajes en este torneo: no se puede eliminar su inscripción',
      );
    }
    await this.prisma.registration.delete({ where: { id: registrationId } });
    return { id: registrationId };
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
      include: { place: true, tournament: true },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    if (activity.type !== ActivityType.TOURNAMENT || !activity.tournament) {
      throw new BadRequestException('Esta actividad no es un torneo');
    }
    return { activity, tournament: activity.tournament };
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

  private cleanPayment(info: PaymentInfo): PaymentInfo {
    const text = (v?: string) => v?.trim() || undefined;
    return {
      bankName: text(info.bankName),
      accountType: text(info.accountType),
      accountNumber: text(info.accountNumber),
      holderName: text(info.holderName),
      holderRut: text(info.holderRut),
      holderEmail: text(info.holderEmail),
      instructions: text(info.instructions),
      fees: (info.fees ?? []).filter((f) => f.label.trim()),
    };
  }

  private cleanHtml(html?: string | null) {
    if (!html) return null;
    return html.replace(/<p>\s*<\/p>/g, '').trim() ? html : null;
  }
}
