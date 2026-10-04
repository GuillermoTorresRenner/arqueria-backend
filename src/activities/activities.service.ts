import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WeatherService } from '../weather/weather.service';
import { CreateActivityDto, UpdateActivityDto } from './dto';

/// Datos públicos de una actividad: lo que ven el home y los socios
const PUBLIC_SELECT = {
  id: true,
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
  _count: { select: { attendances: true } },
} satisfies Prisma.ActivitySelect;

const ADMIN_INCLUDE = {
  place: true,
  _count: { select: { attendances: true } },
} satisfies Prisma.ActivityInclude;

/// Envíos simultáneos al SMTP. Gmail corta si se abren demasiadas conexiones.
const SEND_CONCURRENCY = 3;

type ActivityWithPlace = Prisma.ActivityGetPayload<{
  include: typeof ADMIN_INCLUDE;
}>;

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly weather: WeatherService,
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
        title: dto.title,
        startsAt,
        endsAt,
        placeId: dto.placeId || null,
        recommendations: this.cleanHtml(dto.recommendations),
        notifyMembers: dto.notifyMembers ?? false,
        createdById,
      },
      include: ADMIN_INCLUDE,
    });

    const notification = activity.notifyMembers
      ? await this.notify(activity)
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
      include: ADMIN_INCLUDE,
    });

    // La decisión persiste: si al crearla se dijo que no y ahora se marca,
    // el aviso sale en este momento. Si ya se avisó, no se repite solo.
    const notification =
      activity.notifyMembers && !activity.notifiedAt
        ? await this.notify(activity)
        : null;
    return { ...(await this.reload(id)), notification };
  }

  /// Aviso explícito desde el panel: el primero o uno nuevo tras un cambio
  async notifyNow(id: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: ADMIN_INCLUDE,
    });
    if (!activity) throw new NotFoundException('Actividad no encontrada');
    const notification = await this.notify(activity);
    return { ...(await this.reload(id)), notification };
  }

  async remove(id: string) {
    await this.prisma.activity.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Actividad no encontrada');
    });
    return { id };
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
  findUpcoming(limit = 6) {
    return this.prisma.activity.findMany({
      where: { endsAt: { gte: new Date() } },
      select: PUBLIC_SELECT,
      orderBy: { startsAt: 'asc' },
      take: limit,
    });
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
      activities: activities.map(({ attendances, ...a }) => ({
        ...a,
        attending: Boolean(attendances?.length),
      })),
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
  private async notify(activity: ActivityWithPlace) {
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
    activity: ActivityWithPlace,
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
