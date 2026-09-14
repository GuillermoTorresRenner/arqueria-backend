import { Injectable } from '@nestjs/common';
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
  private readonly templateCache = new Map<string, handlebars.TemplateDelegate>();

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
   * Envía un email de recuperación de contraseña
   * @param to Email del destinatario
   * @param resetToken Token de recuperación
   * @param userName Nombre del usuario
   */
  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    userName: string,
  ): Promise<void> {
    try {
      // Cargar el template - funciona tanto en desarrollo como en producción
      let templatePath = path.join(
        __dirname,
        '../templates/email/password-reset.hbs',
      );

      // Si el archivo no existe (modo producción), buscar en la carpeta del proyecto
      if (!fs.existsSync(templatePath)) {
        templatePath = path.join(
          process.cwd(),
          'src/templates/email/password-reset.hbs',
        );
      }

      const templateSource = fs.readFileSync(templatePath, 'utf-8');
      const template = handlebars.compile(templateSource);

      // URL del frontend para resetear contraseña
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/change-password/${resetToken}`;

      // Datos para el template
      const companyName = process.env.COMPANY_NAME || 'Boilerplate';
      const supportEmail = process.env.MAIL_FROM || 'support@example.com';
      const templateData = {
        userName,
        resetUrl,
        resetToken,
        companyName,
        currentYear: new Date().getFullYear(),
        supportEmail,
      };

      // Generar HTML del template
      const htmlContent = template(templateData);

      // Configurar el email
      const mailOptions = {
        from: `"${companyName}" <${supportEmail}>`,
        to,
        subject: `Recuperación de Contraseña - ${companyName}`,
        html: htmlContent,
        text: `Hola ${userName},\n\nHas solicitado restablecer tu contraseña.\n\nUsa este enlace para crear una nueva contraseña: ${resetUrl}\n\nSi no solicitaste este cambio, puedes ignorar este email.\n\nSaludos,\nEquipo ${companyName}`,
      };

      // Enviar email
      await this.transporter.sendMail(mailOptions);

      // Log del envío exitoso
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'password_reset',
        status: 'success',
        userName,
      });

      console.log(`✅ Email de recuperación enviado a: ${to}`);
    } catch (error) {
      // Log del error
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'password_reset',
        status: 'error',
        userName,
        error: error.message,
      });

      console.error('❌ Error enviando email de recuperación:', error);
      throw new Error('No se pudo enviar el email de recuperación');
    }
  }

  /**
   * Envía un email de bienvenida al usuario
   * @param to Email del destinatario
   * @param userName Nombre del usuario
   * @param companyName Nombre de la empresa
   */
  /**
   * Correo de bienvenida tras crear una cuenta.
   *
   * No lanza si el envío falla: que el SMTP esté caído no debe impedir crear
   * el usuario. El fallo queda registrado en los logs.
   */
  async sendWelcomeEmail(params: {
    to: string;
    name?: string | null;
    surname?: string | null;
    phone?: string | null;
    role?: string;
  }): Promise<boolean> {
    const { to, name, surname, phone, role = 'MEMBER' } = params;
    const brand = this.brand();

    const ROLE_LABELS: Record<string, string> = {
      ADMIN: 'Administrador',
      JUDGE: 'Juez',
      MEMBER: 'Socio',
    };

    const fullName = [name, surname].filter(Boolean).join(' ') || to;

    try {
      const html = this.renderTemplate('welcome', {
        ...brand,
        firstName: name || 'arquero',
        fullName,
        email: to,
        phone: phone || '',
        roleLabel: ROLE_LABELS[role] ?? role,
        isAdmin: role === 'ADMIN',
        isJudge: role === 'JUDGE',
        isMember: role === 'MEMBER',
        loginUrl: `${brand.frontendUrl}/login`,
      });

      await this.transporter.sendMail({
        from: `"${brand.companyName}" <${brand.supportEmail}>`,
        to,
        subject: `¡Bienvenido a ${brand.companyName}!`,
        html,
        // Alternativa en texto plano: algunos clientes la prefieren y evita
        // que el correo puntúe como spam.
        text: [
          `¡Te damos la bienvenida, ${name || 'arquero'}!`,
          '',
          `Tu cuenta en ${brand.companyName} ya está activa.`,
          '',
          `Nombre: ${fullName}`,
          `Correo: ${to}`,
          phone ? `Teléfono: ${phone}` : '',
          `Perfil: ${ROLE_LABELS[role] ?? role}`,
          '',
          `Accede en: ${brand.frontendUrl}/login`,
          brand.whatsappUrl ? `Grupo de WhatsApp: ${brand.whatsappUrl}` : '',
          '',
          `¿Dudas? Escríbenos a ${brand.supportEmail}`,
        ]
          .filter(Boolean)
          .join('\n'),
      });

      await this.loggerService.logEmailEvent({
        email: to,
        type: 'welcome',
        status: 'success',
        userName: fullName,
      });
      return true;
    } catch (error) {
      await this.loggerService.logEmailEvent({
        email: to,
        type: 'welcome',
        status: 'error',
        userName: fullName,
        error: error.message,
      });
      console.error(`No se pudo enviar el email de bienvenida a ${to}:`, error.message);
      return false;
    }
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
