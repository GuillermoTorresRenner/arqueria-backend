import { Injectable } from '@nestjs/common';
import { CLUB_TIMEZONE, WHATSAPP_GROUP_URL } from '../config/club';
import type { ActivityWeather } from '../weather/weather.service';

/// Datos de una actividad que usan los correos
interface NoticeActivity {
  type: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  place: {
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
}

interface PaymentInfoData {
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  holderName?: string;
  holderRut?: string;
  holderEmail?: string;
  instructions?: string;
  fees?: { label: string; amount: number }[];
}

/// Cómo se presenta cada tipo en los correos (mismos colores que el sitio)
const ACTIVITY_KIND: Record<string, { eyebrow: string; color: string }> = {
  ACTIVITY: { eyebrow: 'Nueva actividad', color: '#2f6b8f' },
  EVENT: { eyebrow: 'Nuevo evento', color: '#6d4aa8' },
  TOURNAMENT: { eyebrow: 'Nuevo torneo', color: '#b7791f' },
};
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly loggerService: LoggerService) {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: process.env.MAIL_PORT === '465', // true para 465, false para otros puertos
      // STARTTLS obligatorio salvo que se desactive explícitamente. Se deja
      // configurable para poder usar un SMTP local de pruebas sin TLS.
      requireTLS: process.env.MAIL_REQUIRE_TLS !== 'false',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
      tls: {
        // No fallar en certificados inválidos
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Carga y compila una plantilla Handlebars.
   *
   * Busca primero en `dist/` (producción, donde nest-cli copia los .hbs) y
   * cae a `src/` en desarrollo. Las plantillas se cachean: compilarlas en
   * cada envío es trabajo repetido.
   */
  private readonly templateCache = new Map<
    string,
    handlebars.TemplateDelegate
  >();

  private renderTemplate(name: string, data: Record<string, unknown>): string {
    let compiled = this.templateCache.get(name);

    if (!compiled) {
      const candidates = [
        path.join(process.cwd(), `dist/templates/email/${name}.hbs`),
        path.join(process.cwd(), `src/templates/email/${name}.hbs`),
      ];
      const templatePath = candidates.find((p) => fs.existsSync(p));
      if (!templatePath) {
        throw new Error(`Plantilla de email no encontrada: ${name}.hbs`);
      }
      compiled = handlebars.compile(fs.readFileSync(templatePath, 'utf-8'));
      this.templateCache.set(name, compiled);
    }

    return compiled(data);
  }

  /** Datos de marca comunes a todas las plantillas. */
  private brand() {
    return {
      companyName: process.env.COMPANY_NAME || 'Galadhrym',
      supportEmail: process.env.MAIL_FROM || 'contacto@galadhrym.cl',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
      whatsappUrl: process.env.WHATSAPP_GROUP_URL || '',
      currentYear: new Date().getFullYear(),
    };
  }

  /**
   * Envía un correo con el diseño del club y un botón hacia `actionUrl`
   * (plantilla account-link). No lanza: devuelve si se pudo enviar, para que
   * quien llama decida qué decir; el fallo queda en los logs.
   */
  private async sendAccountLinkEmail(params: {
    to: string;
    logType: 'account_invite' | 'password_reset';
    subject: string;
    preheader: string;
    heading: string;
    paragraphs: string[];
    buttonLabel: string;
    actionUrl: string;
    validity: string;
    ignoreNote?: string;
    userName: string;
  }): Promise<boolean> {
    const brand = this.brand();
    try {
      const html = this.renderTemplate('account-link', { ...brand, ...params });
      await this.transporter.sendMail({
        from: `"${brand.companyName}" <${brand.supportEmail}>`,
        to: params.to,
        subject: params.subject,
        html,
        text: [
          params.heading,
          '',
          ...params.paragraphs,
          '',
          `${params.buttonLabel}: ${params.actionUrl}`,
          `El enlace vale ${params.validity} y sirve una sola vez.`,
          params.ignoreNote ?? '',
        ]
          .filter((line, i, all) => line !== '' || all[i - 1] !== '')
          .join('\n'),
      });
      await this.loggerService.logEmailEvent({
        email: params.to,
        type: params.logType,
        status: 'success',
        userName: params.userName,
      });
      return true;
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: params.to,
        type: params.logType,
        status: 'error',
        userName: params.userName,
        error: error.message,
      });
      console.error(
        `No se pudo enviar el correo a ${params.to}:`,
        error.message,
      );
      return false;
    }
  }

  /// El token va en el fragmento (#): no viaja al servidor del frontend ni
  /// queda en sus logs de acceso.
  private linkTo(path: string, token: string) {
    return `${this.brand().frontendUrl}${path}#token=${encodeURIComponent(token)}`;
  }

  /**
   * Invitación a una cuenta creada desde el panel (admin, juez o socio): el
   * enlace lleva a crear la contraseña. Nadie la elige por el usuario.
   */
  sendAccountInviteEmail(params: {
    to: string;
    name?: string | null;
    role: string;
    token: string;
    validity: string;
  }) {
    const { companyName } = this.brand();
    const ROLE_LABELS: Record<string, string> = {
      ADMIN: 'administrador',
      JUDGE: 'juez de eventos',
      MEMBER: 'socio',
    };
    const name = params.name || 'arquero';
    return this.sendAccountLinkEmail({
      to: params.to,
      logType: 'account_invite',
      userName: name,
      subject: `Te damos acceso a ${companyName}`,
      preheader: `Crea tu contraseña para entrar a ${companyName}.`,
      heading: `¡Hola, ${name}!`,
      paragraphs: [
        `Te creamos una cuenta en ${companyName} como ${ROLE_LABELS[params.role] ?? params.role}.`,
        'Para activarla, crea tu contraseña desde el siguiente enlace. Con ella podrás entrar al sitio del club.',
      ],
      buttonLabel: 'Crear mi contraseña',
      actionUrl: this.linkTo('/bienvenida', params.token),
      validity: params.validity,
    });
  }

  /** Recuperación de contraseña: enlace para elegir una nueva. */
  sendPasswordResetEmail(params: {
    to: string;
    name?: string | null;
    token: string;
    validity: string;
  }) {
    const { companyName } = this.brand();
    const name = params.name || 'arquero';
    return this.sendAccountLinkEmail({
      to: params.to,
      logType: 'password_reset',
      userName: name,
      subject: `Recupera tu contraseña de ${companyName}`,
      preheader: 'Enlace para elegir una contraseña nueva.',
      heading: `Hola, ${name}`,
      paragraphs: [
        `Recibimos una solicitud para cambiar la contraseña de tu cuenta en ${companyName}.`,
        'Elige una nueva desde el siguiente enlace.',
      ],
      buttonLabel: 'Elegir contraseña nueva',
      actionUrl: this.linkTo('/restablecer', params.token),
      validity: params.validity,
      ignoreNote:
        'Si no lo pediste tú, ignora este correo: tu contraseña actual sigue siendo válida.',
    });
  }

  /**
   * Bienvenida tras inscribirse desde la web, con el enlace para validar el
   * correo y crear la contraseña. Como sendWelcomeEmail, no lanza: el registro
   * ya está guardado y quien llama decide qué decirle al usuario.
   */
  async sendJoinWelcomeEmail(params: {
    to: string;
    name: string;
    verifyToken: string;
    validity: string;
  }): Promise<boolean> {
    const { to, name, verifyToken, validity } = params;
    const brand = { ...this.brand(), whatsappUrl: WHATSAPP_GROUP_URL };
    const verifyUrl = this.linkTo('/bienvenida', verifyToken);

    try {
      const html = this.renderTemplate('join-welcome', {
        ...brand,
        firstName: name,
        verifyUrl,
        validity,
      });
      await this.transporter.sendMail({
        from: `"${brand.companyName}" <${brand.supportEmail}>`,
        to,
        subject: `Valida tu correo para entrar a ${brand.companyName}`,
        html,
        text: [
          `¡Gracias por sumarte, ${name}!`,
          '',
          `Recibimos tu inscripción en ${brand.companyName}. Para activar tu cuenta,`,
          'valida tu correo y crea tu contraseña en este enlace:',
          verifyUrl,
          '',
          `El enlace vale ${validity} y sirve una sola vez.`,
          '',
          `Grupo de WhatsApp del club: ${brand.whatsappUrl}`,
          '',
          `Recibes este correo porque te inscribiste en ${brand.companyName} y`,
          'aceptaste recibir comunicaciones del club por email.',
        ].join('\n'),
      });
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'join_welcome',
        status: 'success',
        userName: name,
      });
      return true;
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'join_welcome',
        status: 'error',
        userName: name,
        error: error.message,
      });
      console.error(
        `No se pudo enviar el correo de bienvenida a ${to}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Aviso de una actividad del calendario a un socio, con el pronóstico si
   * ya está disponible. No lanza: devuelve si salió.
   */
  async sendActivityEmail(params: {
    to: string;
    name?: string | null;
    activity: NoticeActivity & {
      recommendations: string | null;
      tournament?: {
        paymentInfo: unknown;
        registrationEnd: Date | null;
      } | null;
    };
    weather: ActivityWeather;
  }): Promise<boolean> {
    const { to, activity, weather } = params;
    const brand = this.brand();
    const name = params.name || 'arquero';
    const when = this.formatSchedule(activity.startsAt, activity.endsAt);
    const place = activity.place;
    const mapUrl = this.mapUrl(place);
    const kind = ACTIVITY_KIND[activity.type] ?? ACTIVITY_KIND.ACTIVITY;
    const isTournament = activity.type === 'TOURNAMENT';
    const fees = isTournament
      ? this.formatFees(
          (activity.tournament?.paymentInfo as PaymentInfoData | null)?.fees,
        )
      : [];
    const registrationEnd = activity.tournament?.registrationEnd
      ? this.formatDateTime(activity.tournament.registrationEnd)
      : null;
    const forecast = weather.available
      ? {
          ...(weather.during ?? weather.day),
          statusLabel: weather.statusLabel,
          reasons: weather.reasons.join(' · '),
          color: { good: '#2f6b3a', caution: '#9a6a00', bad: '#a81e24' }[
            weather.status
          ],
        }
      : null;
    const confirmUrl = `${brand.frontendUrl}/mi-cuenta#actividades`;

    try {
      const html = this.renderTemplate('activity', {
        ...brand,
        firstName: name,
        eyebrow: kind.eyebrow,
        accent: kind.color,
        isTournament,
        fees,
        registrationEnd,
        buttonLabel: isTournament ? 'Inscribirme' : 'Confirmar asistencia',
        buttonHelp: isTournament
          ? 'Entra con tu cuenta del club para preinscribirte. Te enviaremos los datos de pago.'
          : 'Entra con tu cuenta del club para confirmar.',
        title: activity.title,
        date: when.date,
        time: when.time,
        place,
        mapUrl,
        recommendations: activity.recommendations
          ? this.safeEmailHtml(activity.recommendations)
          : null,
        forecast,
        confirmUrl,
      });
      await this.transporter.sendMail({
        from: `"${brand.companyName}" <${brand.supportEmail}>`,
        to,
        subject: `${activity.title} · ${when.date}`,
        html,
        text: [
          `Hola, ${name}:`,
          '',
          `${kind.eyebrow} de ${brand.companyName}: ${activity.title}`,
          `Cuándo: ${when.date}, ${when.time}`,
          place
            ? `Dónde: ${place.name}${place.address ? ` (${place.address})` : ''}`
            : '',
          forecast
            ? `Pronóstico: ${forecast.description}, ${forecast.tempMin}–${forecast.tempMax} °C, lluvia ${forecast.precipitationProbability} %, viento hasta ${forecast.gustsMax} km/h. ${forecast.statusLabel}.`
            : '',
          activity.recommendations
            ? `\nRecomendaciones:\n${this.htmlToText(activity.recommendations)}`
            : '',
          fees.length
            ? `\nInscripción:\n${fees.map((f) => `• ${f.label}: ${f.amount}`).join('\n')}`
            : '',
          registrationEnd ? `Inscripciones hasta: ${registrationEnd}` : '',
          '',
          isTournament
            ? `Inscríbete desde tu cuenta: ${confirmUrl}`
            : `Confirma tu asistencia: ${confirmUrl}`,
          '',
          `Recibes este correo porque eres socio de ${brand.companyName} y`,
          'aceptaste recibir comunicaciones del club por email.',
        ]
          .filter((line, i, all) => line !== '' || all[i - 1] !== '')
          .join('\n'),
      });
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'activity_notice',
        status: 'success',
        userName: name,
      });
      return true;
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'activity_notice',
        status: 'error',
        userName: name,
        error: error.message,
      });
      console.error(
        `No se pudo enviar el aviso de actividad a ${to}:`,
        error.message,
      );
      return false;
    }
  }

  /**
   * Preinscripción a un torneo: datos de transferencia, montos y cómo enviar
   * el comprobante. Responder el correo llega al club (reply-to).
   */
  async sendTournamentRegistrationEmail(params: {
    to: string;
    name?: string | null;
    memberName: string;
    activity: NoticeActivity;
    paymentInfo: PaymentInfoData | null;
  }): Promise<boolean> {
    const { to, activity, paymentInfo } = params;
    const brand = this.brand();
    const name = params.name || 'arquero';
    const when = this.formatSchedule(activity.startsAt, activity.endsAt);
    const fees = this.formatFees(paymentInfo?.fees);
    const bank = [
      ['Banco', paymentInfo?.bankName],
      ['Tipo de cuenta', paymentInfo?.accountType],
      ['Número de cuenta', paymentInfo?.accountNumber],
      ['Titular', paymentInfo?.holderName],
      ['RUT', paymentInfo?.holderRut],
      ['Correo', paymentInfo?.holderEmail],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => ({ label, value }));
    const receiptSubject = `Comprobante de pago · ${activity.title} · ${params.memberName}`;
    const receiptUrl = `mailto:${brand.supportEmail}?subject=${encodeURIComponent(receiptSubject)}`;

    return this.sendSimple({
      to,
      logType: 'tournament_registration',
      userName: name,
      template: 'tournament-registration',
      subject: `Preinscripción recibida · ${activity.title}`,
      data: {
        firstName: name,
        title: activity.title,
        date: when.date,
        time: when.time,
        place: activity.place,
        mapUrl: this.mapUrl(activity.place),
        bank,
        fees,
        instructions: paymentInfo?.instructions,
        receiptUrl,
        receiptSubject,
        accountUrl: `${brand.frontendUrl}/mi-cuenta#actividades`,
      },
      text: [
        `Hola, ${name}:`,
        '',
        `Recibimos tu preinscripción en ${activity.title} (${when.date}, ${when.time}).`,
        'Para quedar inscrito, transfiere el monto que corresponda y envíanos el comprobante.',
        '',
        ...(fees.length
          ? ['Montos:', ...fees.map((f) => `• ${f.label}: ${f.amount}`), '']
          : []),
        ...(bank.length
          ? [
              'Datos de transferencia:',
              ...bank.map((b) => `${b.label}: ${b.value}`),
              '',
            ]
          : []),
        paymentInfo?.instructions ? `${paymentInfo.instructions}\n` : '',
        `Envía el comprobante respondiendo este correo o a ${brand.supportEmail}`,
        `con el asunto «${receiptSubject}».`,
        '',
        'Cuando verifiquemos el pago te confirmaremos la inscripción por correo.',
      ],
    });
  }

  /// Un admin verificó el pago: inscripción confirmada
  async sendTournamentConfirmedEmail(params: {
    to: string;
    name?: string | null;
    activity: NoticeActivity;
  }): Promise<boolean> {
    const { to, activity } = params;
    const brand = this.brand();
    const name = params.name || 'arquero';
    const when = this.formatSchedule(activity.startsAt, activity.endsAt);
    return this.sendSimple({
      to,
      logType: 'tournament_confirmed',
      userName: name,
      template: 'tournament-confirmed',
      subject: `Inscripción confirmada · ${activity.title}`,
      data: {
        firstName: name,
        title: activity.title,
        date: when.date,
        time: when.time,
        place: activity.place,
        mapUrl: this.mapUrl(activity.place),
        accountUrl: `${brand.frontendUrl}/mi-cuenta#actividades`,
      },
      text: [
        `Hola, ${name}:`,
        '',
        `Verificamos tu pago: ya estás inscrito en ${activity.title}.`,
        `Cuándo: ${when.date}, ${when.time}`,
        activity.place ? `Dónde: ${activity.place.name}` : '',
        '',
        '¡Nos vemos en la línea de tiro!',
      ],
    });
  }

  /// Envío con plantilla y registro en el log. No lanza.
  private async sendSimple(params: {
    to: string;
    logType: 'tournament_registration' | 'tournament_confirmed';
    userName: string;
    template: string;
    subject: string;
    data: Record<string, unknown>;
    text: string[];
  }): Promise<boolean> {
    const brand = this.brand();
    try {
      const html = this.renderTemplate(params.template, {
        ...brand,
        ...params.data,
      });
      await this.transporter.sendMail({
        from: `"${brand.companyName}" <${brand.supportEmail}>`,
        replyTo: brand.supportEmail,
        to: params.to,
        subject: params.subject,
        html,
        text: [
          ...params.text,
          '',
          `${brand.companyName} · ${brand.frontendUrl}`,
        ]
          .filter((line, i, all) => line !== '' || all[i - 1] !== '')
          .join('\n'),
      });
      await this.loggerService.logEmailEvent({
        email: params.to,
        type: params.logType,
        status: 'success',
        userName: params.userName,
      });
      return true;
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: params.to,
        type: params.logType,
        status: 'error',
        userName: params.userName,
        error: error.message,
      });
      console.error(
        `No se pudo enviar el correo a ${params.to}:`,
        error.message,
      );
      return false;
    }
  }

  private mapUrl(place: NoticeActivity['place']) {
    if (!place) return null;
    return place.latitude != null && place.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || place.name)}`;
  }

  /// Montos en pesos chilenos: «$15.000»
  private formatFees(fees?: { label: string; amount: number }[] | null) {
    const clp = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    });
    return (fees ?? []).map((f) => ({
      label: f.label,
      amount: clp.format(f.amount),
    }));
  }

  private formatDateTime(date: Date) {
    const text = new Intl.DateTimeFormat('es-CL', {
      timeZone: CLUB_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /// «sábado 11 de octubre» y «10:00 a 13:00», en la zona horaria del club
  private formatSchedule(startsAt: Date, endsAt: Date) {
    const date = new Intl.DateTimeFormat('es-CL', {
      timeZone: CLUB_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(startsAt);
    const hour = new Intl.DateTimeFormat('es-CL', {
      timeZone: CLUB_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return {
      date: date.charAt(0).toUpperCase() + date.slice(1),
      time: `${hour.format(startsAt)} a ${hour.format(endsAt)}`,
    };
  }

  /**
   * El HTML de las recomendaciones lo escribe el admin con el editor del
   * panel. Aun así, en el correo se quitan scripts, estilos, iframes,
   * manejadores de eventos y enlaces javascript: por si una sesión de admin
   * fuera robada.
   */
  private safeEmailHtml(html: string) {
    return new handlebars.SafeString(
      html
        .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<(script|style|iframe|object|embed)\b[^>]*\/?>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"'),
    );
  }

  private htmlToText(html: string) {
    return html
      .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/(p|li|h2|h3|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Verifica la conexión SMTP
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('✅ Conexión SMTP verificada correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error en conexión SMTP:', error);
      return false;
    }
  }

  /**
   * Envía una notificación de vencimiento próximo de suscripción
   * @param to Email del destinatario
   * @param data Datos de la notificación (companyName, planName, expiryDate, daysRemaining)
   */
  async sendSubscriptionExpiryWarning(
    to: string,
    data: {
      companyName: string;
      planName: string;
      expiryDate: string;
      daysRemaining: number;
    },
  ): Promise<void> {
    try {
      const supportEmail = process.env.MAIL_FROM || 'support@example.com';
      const mailOptions = {
        from: `"${data.companyName}" <${supportEmail}>`,
        to,
        subject: `⚠️ Suscripción próxima a vencer - ${data.companyName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #d9534f;">⚠️ Notificación de Vencimiento de Suscripción</h2>
            <p>Estimado administrador,</p>
            <p>La suscripción de <strong>${data.companyName}</strong> está próxima a vencer:</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Plan:</strong> ${data.planName}</p>
              <p><strong>Fecha de vencimiento:</strong> ${data.expiryDate}</p>
              <p><strong>Días restantes:</strong> <span style="color: #d9534f; font-weight: bold;">${data.daysRemaining}</span></p>
            </div>
            <p>Para evitar interrupciones en el servicio, le recomendamos renovar su suscripción antes de la fecha de vencimiento.</p>
            <p>Puede acceder a su panel de administración para gestionar la renovación.</p>
            <hr style="margin: 20px 0;">
            <p style="font-size: 12px; color: #666;">
              Este es un email automático del sistema ${data.companyName}.<br>
              Si tiene alguna pregunta, contacta con soporte: ${supportEmail}
            </p>
          </div>
        `,
        text: `Notificación de Vencimiento de Suscripción\n\nLa suscripción de ${data.companyName} vence el ${data.expiryDate} (${data.daysRemaining} días restantes).\n\nPlan: ${data.planName}\n\nRenueve su suscripción para evitar interrupciones.\n\nSaludos,\nEquipo ${data.companyName}`,
      };

      await this.transporter.sendMail(mailOptions);

      // Log del envío exitoso
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'subscription_expiry_warning',
        status: 'success',
        companyName: data.companyName,
        planName: data.planName,
        daysRemaining: data.daysRemaining,
      });

      console.log(`✅ Notificación de vencimiento enviada a: ${to}`);
    } catch (error) {
      // Log del error
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'subscription_expiry_warning',
        status: 'error',
        companyName: data.companyName,
        planName: data.planName,
        error: error.message,
      });

      console.error('❌ Error enviando notificación de vencimiento:', error);
      throw new Error('No se pudo enviar la notificación de vencimiento');
    }
  }

  /**
   * Envía un email de autoregistro al usuario
   * @param to Email del destinatario
   * @param registrationToken Token de registro
   */
  async sendAutoRegisterEmail(
    to: string,
    registrationToken: string,
  ): Promise<void> {
    try {
      // Cargar el template - funciona tanto en desarrollo como en producción
      let templatePath = path.join(
        process.cwd(),
        'dist/templates/email/autoregister.hbs',
      );

      // Si el archivo no existe (modo desarrollo), buscar en la carpeta del proyecto
      if (!fs.existsSync(templatePath)) {
        templatePath = path.join(
          process.cwd(),
          'src/templates/email/autoregister.hbs',
        );
      }

      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateSource);

      const registrationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/complete-registration?token=${registrationToken}&email=${to}`;

      const companyName = process.env.COMPANY_NAME || 'Boilerplate';
      const supportEmail = process.env.MAIL_FROM || 'support@example.com';

      const templateData = {
        email: to,
        registrationUrl,
        registrationToken,
        companyName,
        currentYear: new Date().getFullYear(),
        supportEmail,
      };

      const htmlContent = template(templateData);

      const mailOptions = {
        from: `"${companyName}" <${supportEmail}>`,
        to,
        subject: `Completa tu registro en ${companyName}`,
        html: htmlContent,
        text: `Hola,\n\nTu registro ha sido iniciado en ${companyName}.\n\nCompleta tu registro aquí: ${registrationUrl}\n\nSi no solicitaste este registro, ignora este email.\n\nSaludos,\nEquipo ${companyName}`,
      };

      await this.transporter.sendMail(mailOptions);

      await this.loggerService.logEmailEvent({
        email: to,
        type: 'autoregister',
        status: 'success',
      });

      console.log(`✅ Email de autoregistro enviado a: ${to}`);
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'autoregister',
        status: 'error',
        error: error.message,
      });

      console.error('❌ Error enviando email de autoregistro:', error);
      throw new Error('No se pudo enviar el email de autoregistro');
    }
  }

  /**
   * Envía un email de prueba al correo especificado
   */
  async sendTestEmail(to: string, message?: string): Promise<void> {
    try {
      // Cargar template de prueba
      let templatePath = path.join(
        process.cwd(),
        'dist/templates/email/test-email.hbs',
      );

      if (!fs.existsSync(templatePath)) {
        templatePath = path.join(
          process.cwd(),
          'src/templates/email/test-email.hbs',
        );
      }

      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateSource);

      const companyName = process.env.COMPANY_NAME || 'Boilerplate';
      const supportEmail = process.env.MAIL_FROM || 'support@example.com';

      const templateData = {
        companyName,
        currentYear: new Date().getFullYear(),
        supportEmail,
        message:
          message || 'Este es un email de prueba enviado desde el boilerplate.',
      };

      const htmlContent = template(templateData);

      const mailOptions = {
        from: `"${companyName}" <${supportEmail}>`,
        to,
        subject: `Email de prueba - ${companyName}`,
        html: htmlContent,
        text:
          message || 'Este es un email de prueba enviado desde el boilerplate.',
      };

      await this.transporter.sendMail(mailOptions);

      await this.loggerService.logEmailEvent({
        email: to,
        type: 'welcome',
        status: 'success',
        userName: undefined,
      });

      console.log(`✅ Email de prueba enviado a: ${to}`);
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'welcome',
        status: 'error',
        error: error.message,
      });

      console.error('❌ Error enviando email de prueba:', error);
      throw new Error('No se pudo enviar el email de prueba');
    }
  }
}
