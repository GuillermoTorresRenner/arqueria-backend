import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  MemberStatus,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WeatherService } from '../weather/weather.service';
import { CreateActivityDto, UpdateActivityDto } from './dto';
import {
  ActivityTournamentsService,
  PaymentInfo,
} from './activity-tournaments.service';

/// Inscripciones vivas (preinscritos e inscritos)
const ACTIVE_REGISTRATIONS = {
  where: { status: { not: RegistrationStatus.WITHDRAWN } },
} as const;

/// Lo público de un torneo. paymentInfo se recorta después: fuera de la
/// cuenta del socio solo se muestran los montos, no la cuenta bancaria.
const TOURNAMENT_PUBLIC_SELECT = {
  id: true,
  slug: true,
  status: true,
  rules: true,
  youtubeUrl: true,
  registrationEnd: true,
  maxParticipants: true,
  paymentInfo: true,
  documents: {
    select: { id: true, name: true, path: true, mimeType: true, size: true },
    orderBy: { createdAt: 'asc' },
  },
  _count: { select: { registrations: ACTIVE_REGISTRATIONS } },
} satisfies Prisma.TournamentSelect;

/// Datos públicos de una actividad: lo que ven el home y los socios
const PUBLIC_SELECT = {
  id: true,
  type: true,
  title: true,
  startsAt: true,
  endsAt: true,
  recommendations: true,
  place: {
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
    },
  },
  tournament: { select: TOURNAMENT_PUBLIC_SELECT },
  _count: { select: { attendances: true } },
} satisfies Prisma.ActivitySelect;

const ADMIN_INCLUDE = {
  place: true,
  tournament: {
    select: {
      id: true,
      slug: true,
      status: true,
      _count: { select: { registrations: ACTIVE_REGISTRATIONS } },
    },
  },
  _count: { select: { attendances: true } },
} satisfies Prisma.ActivityInclude;

/// Lo que necesita el correo de aviso
const NOTICE_INCLUDE = {
  place: true,
  tournament: { select: { paymentInfo: true, registrationEnd: true } },
} satisfies Prisma.ActivityInclude;

/// Deja de un torneo solo los montos (sin datos bancarios)
function withPublicFees<
  T extends { tournament: { paymentInfo: Prisma.JsonValue } | null },
>(activity: T) {
  if (!activity.tournament) return activity;
  const { paymentInfo, ...tournament } = activity.tournament;
  const fees = (paymentInfo as PaymentInfo | null)?.fees ?? [];
  return { ...activity, tournament: { ...tournament, fees } };
}

/// Envíos simultáneos al SMTP. Gmail corta si se abren demasiadas conexiones.
const SEND_CONCURRENCY = 3;

type ActivityForNotice = Prisma.ActivityGetPayload<{
  include: typeof NOTICE_INCLUDE;
}>;

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly weather: WeatherService,
    private readonly tournaments: ActivityTournamentsService,
  ) {}

  // ---------- Administración ----------

  /// Actividades que se solapan con el rango (el mes visible del calendario)
  findRange(from?: string, to?: string) {
    return this.prisma.activity.findMany({
      where: {
        ...(to && { startsAt: { lt: new Date(to) } }),
        ...(from && { endsAt: { gte: new Date(from) } }),
      },
      include: ADMIN_INCLUDE,
      orderBy: { startsAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        ...ADMIN_INCLUDE,
        tournament: {
          include: {
            judges: {
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    surname: true,
                    email: true,
                    userRoles: true,
                  },
                },
              },
            },
            documents: { orderBy: { createdAt: 'asc' } },
            registrations: {
              where: { status: { not: RegistrationStatus.WITHDRAWN } },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                status: true,
                createdAt: true,
                confirmedAt: true,
                confirmedBy: { select: { name: true, surname: true } },
                member: {
                  select: {
                    id: true,
                    memberNumber: true,
                    experience: true,
                    user: {
                      select: { name: true, surname: true, email: true },
                    },
                  },
                },
              },
            },
            _count: { select: { registrations: ACTIVE_REGISTRATIONS } },
          },
        },
        attendances: {
          orderBy: { createdAt: 'asc' },
          select: {
            createdAt: true,
            member: {
              select: {
                id: true,
                memberNumber: true,
                experience: true,
                user: { select: { name: true, surname: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    return activity;
  }

  async create(dto: CreateActivityDto, createdById: string) {
    const { startsAt, endsAt } = this.parseSchedule(dto.startsAt, dto.endsAt);
    if (dto.placeId) await this.assertPlace(dto.placeId, true);

    const activity = await this.prisma.activity.create({
      data: {
        type: dto.type ?? ActivityType.ACTIVITY,
        title: dto.title,
        startsAt,
        endsAt,
        placeId: dto.placeId || null,
        recommendations: this.cleanHtml(dto.recommendations),
        notifyMembers: dto.notifyMembers ?? false,
        createdById,
      },
      include: { place: true },
    });
    // Si la ficha del torneo falla (p. ej. un juez inválido), no queda una
    // actividad a medias
    await this.tournaments
      .sync(activity, dto.tournament)
      .catch(async (error) => {
        await this.prisma.activity.delete({ where: { id: activity.id } });
        throw error;
      });

    const notification = activity.notifyMembers
      ? await this.notify(activity.id)
      : null;
    return { ...(await this.reload(activity.id)), notification };
  }

  async update(id: string, dto: UpdateActivityDto) {
    const current = await this.prisma.activity.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Actividad no encontrada');

    const { startsAt, endsAt } = this.parseSchedule(
      dto.startsAt ?? current.startsAt.toISOString(),
      dto.endsAt ?? current.endsAt.toISOString(),
    );
    // Un lugar ya desactivado se puede conservar, pero no elegir de nuevo
    if (dto.placeId && dto.placeId !== current.placeId) {
      await this.assertPlace(dto.placeId, true);
    }

    const activity = await this.prisma.activity.update({
      where: { id },
      data: {
        type: dto.type,
        title: dto.title,
        startsAt,
        endsAt,
        placeId: dto.placeId === undefined ? undefined : dto.placeId || null,
        recommendations:
          dto.recommendations === undefined
            ? undefined
            : this.cleanHtml(dto.recommendations),
        notifyMembers: dto.notifyMembers,
      },
      include: { place: true },
    });
    await this.tournaments.sync(activity, dto.tournament);

    // La decisión persiste: si al crearla se dijo que no y ahora se marca,
    // el aviso sale en este momento. Si ya se avisó, no se repite solo.
    const notification =
      activity.notifyMembers && !activity.notifiedAt
        ? await this.notify(id)
        : null;
    return { ...(await this.reload(id)), notification };
  }

  /// Aviso explícito desde el panel: el primero o uno nuevo tras un cambio
  async notifyNow(id: string) {
    const exists = await this.prisma.activity.count({ where: { id } });
    if (!exists) throw new NotFoundException('Actividad no encontrada');
    const notification = await this.notify(id);
    return { ...(await this.reload(id)), notification };
  }

  /// Un torneo se lleva su ficha, inscripciones y reglamentos en archivo
  async remove(id: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    await this.prisma.activity.delete({ where: { id } });
    await this.tournaments.removeFor(activity);
    return { id };
  }

  paymentDefaults() {
    return this.tournaments.paymentDefaults();
  }

  async weatherPreview(placeId: string, startsAt: string, endsAt: string) {
    const place = await this.assertPlace(placeId, false);
    return this.weather.forActivity({
      latitude: place.latitude,
      longitude: place.longitude,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    });
  }

  // ---------- Público y socios ----------

  /// Próximas actividades (incluida la que está en curso)
  async findUpcoming(limit = 6) {
    const activities = await this.prisma.activity.findMany({
      where: { endsAt: { gte: new Date() } },
      select: PUBLIC_SELECT,
      orderBy: { startsAt: 'asc' },
      take: limit,
    });
    return activities.map(withPublicFees);
  }

  /// Calendario del socio: las próximas, marcando a cuáles va
  async findForMember(userId: string) {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    const activities = await this.prisma.activity.findMany({
      where: { endsAt: { gte: new Date() } },
      select: {
        ...PUBLIC_SELECT,
        // El socio sí ve los datos de transferencia completos
        tournament: {
          select: {
            ...TOURNAMENT_PUBLIC_SELECT,
            registrations: member
              ? {
                  where: { memberId: member.id },
                  select: { status: true, createdAt: true, confirmedAt: true },
                }
              : false,
          },
        },
        attendances: member
          ? { where: { memberId: member.id }, select: { createdAt: true } }
          : false,
      },
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
    const canAttend = member?.status === MemberStatus.ACTIVE;
    return {
      canAttend,
      activities: activities.map(({ attendances, tournament, ...a }) => {
        if (!tournament) {
          return { ...a, tournament, attending: Boolean(attendances?.length) };
        }
        const { registrations, paymentInfo, ...t } = tournament;
        const mine = registrations?.find(
          (r) => r.status !== RegistrationStatus.WITHDRAWN,
        );
        return {
          ...a,
          attending: false,
          tournament: {
            ...t,
            fees: (paymentInfo as PaymentInfo | null)?.fees ?? [],
            paymentInfo: paymentInfo as PaymentInfo | null,
          },
          registration: mine ?? null,
        };
      }),
    };
  }

  async setAttendance(id: string, userId: string, attending: boolean) {
    const member = await this.prisma.member.findUnique({ where: { userId } });
    if (!member) {
      throw new ForbiddenException(
        'Solo los socios pueden confirmar asistencia',
      );
    }
    if (member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException(
        'Tu membresía no está activa: no puedes confirmar asistencia',
      );
    }
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    if (activity.type === ActivityType.TOURNAMENT) {
      throw new BadRequestException(
        'En los torneos no se confirma asistencia: hay que inscribirse',
      );
    }
    if (activity.endsAt.getTime() < Date.now()) {
      throw new BadRequestException('La actividad ya terminó');
    }

    const key = {
      activityId_memberId: { activityId: id, memberId: member.id },
    };
    if (attending) {
      await this.prisma.activityAttendance.upsert({
        where: key,
        update: {},
        create: { activityId: id, memberId: member.id },
      });
    } else {
      await this.prisma.activityAttendance.deleteMany({
        where: { activityId: id, memberId: member.id },
      });
    }
    const attendees = await this.prisma.activityAttendance.count({
      where: { activityId: id },
    });
    return { id, attending, attendees };
  }

  async weatherFor(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: { place: true },
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    return this.weather.forActivity({
      latitude: activity.place?.latitude,
      longitude: activity.place?.longitude,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
    });
  }

  // ---------- Internos ----------

  /**
   * Avisa por correo a todos los socios activos. Responde en cuanto sabe a
   * cuántos va a escribir; el envío sigue en segundo plano (con muchos socios
   * tardaría más que una petición HTTP) y al terminar guarda cuántos salieron.
   */
  private async notify(id: string) {
    const activity = await this.prisma.activity.findUniqueOrThrow({
      where: { id },
      include: NOTICE_INCLUDE,
    });
    if (activity.endsAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'La actividad ya terminó: no se puede avisar a los socios',
      );
    }
    const members = await this.prisma.member.findMany({
      where: { status: MemberStatus.ACTIVE, user: { isActive: true } },
      select: { user: { select: { email: true, name: true } } },
    });
    const recipients = members.map((m) => m.user);

    await this.prisma.activity.update({
      where: { id: activity.id },
      data: {
        notifyMembers: true,
        notifiedAt: new Date(),
        notifiedCount: recipients.length,
      },
    });

    void this.sendNotices(activity, recipients).catch((error) =>
      this.logger.error(`Aviso de «${activity.title}»: ${error.message}`),
    );
    return { recipients: recipients.length };
  }

  private async sendNotices(
    activity: ActivityForNotice,
    recipients: { email: string; name: string | null }[],
  ) {
    const weather = await this.weather.forActivity({
      latitude: activity.place?.latitude,
      longitude: activity.place?.longitude,
      startsAt: activity.startsAt,
      endsAt: activity.endsAt,
    });

    let sent = 0;
    const queue = [...recipients];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const ok = await this.emailService.sendActivityEmail({
          to: r.email,
          name: r.name,
          activity,
          weather,
        });
        if (ok) sent++;
      }
    };
    await Promise.all(Array.from({ length: SEND_CONCURRENCY }, () => worker()));

    await this.prisma.activity.update({
      where: { id: activity.id },
      data: { notifiedCount: sent },
    });
    this.logger.log(
      `Aviso de «${activity.title}»: ${sent}/${recipients.length} correos enviados`,
    );
  }

  private reload(id: string) {
    return this.prisma.activity.findUniqueOrThrow({
      where: { id },
      include: ADMIN_INCLUDE,
    });
  }

  private parseSchedule(start: string, end: string) {
    const startsAt = new Date(start);
    const endsAt = new Date(end);
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException(
        'La hora de término debe ser posterior a la de inicio',
      );
    }
    return { startsAt, endsAt };
  }

  private async assertPlace(id: string, mustBeActive: boolean) {
    const place = await this.prisma.place.findUnique({ where: { id } });
    if (!place) throw new BadRequestException('El lugar no existe');
    if (mustBeActive && !place.isActive) {
      throw new BadRequestException('Ese lugar está desactivado');
    }
    return place;
  }

  /// El editor deja «<p></p>» cuando se borra todo: eso es «sin texto»
  private cleanHtml(html?: string | null) {
    if (!html) return null;
    return html.replace(/<p>\s*<\/p>/g, '').trim() ? html : null;
  }
}
