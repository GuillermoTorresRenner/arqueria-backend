import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface EmailLog {
  timestamp: string;
  email: string;
  type:
    | 'password_reset'
    | 'welcome'
    | 'subscription_expiry_warning'
    | 'autoregister';
  status: 'success' | 'error';
  userName?: string;
  customerName?: string;
  companyName?: string;
  planName?: string;
  daysRemaining?: number;
  error?: string;
  ipAddress?: string;
}

export interface PasswordChangeLog {
  timestamp: string;
  userId: string;
  email: string;
  status: 'success' | 'error';
  tokenUsed: string;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
}

export interface SubscriptionExpiryLog {
  timestamp: string;
  subscriptionId: string;
  companyId: string;
  endDate: string;
  usersAffected: number;
}

export interface ExpiryNotificationLog {
  timestamp: string;
  subscriptionId: string;
  companyId: string;
  expiryDate: string;
  daysRemaining: number;
  adminsNotified: number;
}

export interface ImportLog {
  timestamp: string;
  fileName: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  rowNumber?: number;
  entityType: string;
  entityId?: string;
  error?: string;
}

export interface ConsumptionLog {
  timestamp: string;
  action: 'create' | 'update' | 'delete' | 'activate' | 'deactivate';
  consumptionId: string;
  emissionSourceId?: string;
  entityId?: string;
  entityType?: string;
  providerId?: string;
  consumptionValue?: number | Decimal | string;
  consumptionDate?: string;
  status: 'success' | 'error';
  userId?: string;
  error?: string;
  changedFields?: Record<string, { old: any; new: any }>;
}

@Injectable()
export class LoggerService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Registra un evento de envío de email
   */
  async logEmailEvent(logData: Omit<EmailLog, 'timestamp'>): Promise<void> {
    try {
      const log: EmailLog = {
        ...logData,
        timestamp: new Date().toISOString(),
      };

      const message =
        logData.status === 'success'
          ? `Email ${logData.type.replace('_', ' ')} enviado exitosamente`
          : `Error al enviar email ${logData.type.replace('_', ' ')}`;

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'email_sent',
          entityType: 'email',
          entityId: logData.email,
          userId: logData.userName ? undefined : undefined, // No hay userId directo
        },
      });

      console.debug(
        `📧 Email log guardado: ${log.type} para ${log.email} - ${log.status}`,
      );
    } catch (error) {
      console.error('❌ Error guardando log de email:', error);
    }
  }

  /**
   * Registra un evento de expiración de suscripción
   */
  async logSubscriptionExpiry(
    logData: Omit<SubscriptionExpiryLog, 'timestamp'>,
  ): Promise<void> {
    try {
      const log: SubscriptionExpiryLog = {
        ...logData,
        timestamp: new Date().toISOString(),
      };

      await this.prismaService.logs.create({
        data: {
          message: 'Suscripción expirada',
          level: 'WARN',
          description: JSON.stringify(log),
          action: 'subscription_expired',
          entityType: 'subscription',
          entityId: logData.subscriptionId,
          userId: undefined, // No hay userId directo
        },
      });

      console.debug(
        `⏰ Subscription expiry log guardado: ${log.subscriptionId} - ${log.usersAffected} usuarios afectados`,
      );
    } catch (error) {
      console.error(
        '❌ Error guardando log de expiración de suscripción:',
        error,
      );
    }
  }

  /**
   * Registra un evento de notificación de expiración próxima
   */
  async logExpiryNotification(
    logData: Omit<ExpiryNotificationLog, 'timestamp'>,
  ): Promise<void> {
    try {
      const log: ExpiryNotificationLog = {
        ...logData,
        timestamp: new Date().toISOString(),
      };

      await this.prismaService.logs.create({
        data: {
          message: 'Notificación de expiración de suscripción enviada',
          level: 'INFO',
          description: JSON.stringify(log),
          action: 'expiry_notification',
          entityType: 'subscription',
          entityId: logData.subscriptionId,
          userId: undefined,
        },
      });

      console.debug(
        `📧 Expiry notification log guardado: ${log.subscriptionId} - ${log.daysRemaining} días restantes`,
      );
    } catch (error) {
      console.error(
        '❌ Error guardando log de notificación de expiración:',
        error,
      );
    }
  }

  /**
   * Registra un evento de cambio de contraseña
   */
  async logPasswordChange(
    logData: Omit<PasswordChangeLog, 'timestamp'>,
  ): Promise<void> {
    try {
      const log: PasswordChangeLog = {
        ...logData,
        timestamp: new Date().toISOString(),
      };

      const message =
        logData.status === 'success'
          ? 'Contraseña cambiada exitosamente'
          : 'Error al cambiar contraseña';

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'password_change',
          entityType: 'user',
          entityId: logData.userId,
          userId: logData.userId,
        },
      });

      console.debug(
        `🔑 Password change log guardado: ${log.email} - ${log.status}`,
      );
    } catch (error) {
      console.error('❌ Error guardando log de cambio de contraseña:', error);
    }
  }

  /**
   * Registra un log genérico con estructura mejorada
   */
  async log(options: {
    level: 'INFO' | 'WARN' | 'ERROR';
    message: string;
    description?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    data?: any;
  }): Promise<void> {
    try {
      const logData = {
        message: options.message,
        level: options.level,
        description: options.data
          ? JSON.stringify(options.data)
          : options.description,
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        userId: options.userId,
      };

      await this.prismaService.logs.create({
        data: logData,
      });

      console.debug(`📝 Log guardado: [${options.level}] ${options.message}`);
    } catch (error) {
      console.error('❌ Error guardando log genérico:', error);
    }
  }

  /**
   * Lee los logs de email
   */
  async readEmailLogs(): Promise<EmailLog[]> {
    try {
      const logs = await this.prismaService.logs.findMany({
        where: {
          action: 'email_sent',
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000,
      });

      return logs.map((log) => JSON.parse(log.description!) as EmailLog);
    } catch (error) {
      console.error('❌ Error leyendo logs de email:', error);
      return [];
    }
  }

  /**
   * Lee los logs de cambio de contraseña
   */
  async readPasswordLogs(): Promise<PasswordChangeLog[]> {
    try {
      const logs = await this.prismaService.logs.findMany({
        where: {
          action: 'password_change',
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000,
      });

      return logs.map(
        (log) => JSON.parse(log.description!) as PasswordChangeLog,
      );
    } catch (error) {
      console.error('❌ Error leyendo logs de contraseña:', error);
      return [];
    }
  }

  /**
   * Lee los logs de expiración de suscripción
   */
  async readSubscriptionExpiryLogs(): Promise<SubscriptionExpiryLog[]> {
    try {
      const logs = await this.prismaService.logs.findMany({
        where: {
          action: 'subscription_expired',
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000,
      });

      return logs.map(
        (log) => JSON.parse(log.description!) as SubscriptionExpiryLog,
      );
    } catch (error) {
      console.error(
        '❌ Error leyendo logs de expiración de suscripción:',
        error,
      );
      return [];
    }
  }

  /**
   * Lee los logs de notificación de expiración
   */
  async readExpiryNotificationLogs(): Promise<ExpiryNotificationLog[]> {
    try {
      const logs = await this.prismaService.logs.findMany({
        where: {
          action: 'expiry_notification',
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000,
      });

      return logs.map(
        (log) => JSON.parse(log.description!) as ExpiryNotificationLog,
      );
    } catch (error) {
      console.error(
        '❌ Error leyendo logs de notificación de expiración:',
        error,
      );
      return [];
    }
  }

  /**
   * Obtiene todos los logs con filtros opcionales
   */
  async getLogs(options?: {
    level?: 'INFO' | 'WARN' | 'ERROR';
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any[]> {
    try {
      const where: any = {};

      if (options?.level) {
        where.level = options.level;
      }

      if (options?.startDate || options?.endDate) {
        where.timestamp = {};
        if (options.startDate) {
          where.timestamp.gte = options.startDate;
        }
        if (options.endDate) {
          where.timestamp.lte = options.endDate;
        }
      }

      const logs = await this.prismaService.logs.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
        take: options?.limit || 100,
        skip: options?.offset || 0,
      });

      return logs.map((log) => ({
        id: log.id,
        message: log.message,
        description: log.description,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        userId: log.userId,
        level: log.level,
        timestamp: log.timestamp,
      }));
    } catch (error) {
      console.error('❌ Error obteniendo logs:', error);
      return [];
    }
  }

  /**
   * Obtiene estadísticas de emails
   */
  async getEmailStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    byType: Record<string, number>;
    last24Hours: number;
  }> {
    const logs = await this.readEmailLogs();
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      total: logs.length,
      successful: logs.filter((log) => log.status === 'success').length,
      failed: logs.filter((log) => log.status === 'error').length,
      byType: logs.reduce(
        (acc, log) => {
          acc[log.type] = (acc[log.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
      last24Hours: logs.filter((log) => new Date(log.timestamp) > last24Hours)
        .length,
    };
  }

  /**
   * Obtiene estadísticas de cambios de contraseña
   */
  async getPasswordChangeStats(): Promise<{
    total: number;
    successful: number;
    failed: number;
    last24Hours: number;
    uniqueUsers: number;
  }> {
    const logs = await this.readPasswordLogs();
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      total: logs.length,
      successful: logs.filter((log) => log.status === 'success').length,
      failed: logs.filter((log) => log.status === 'error').length,
      last24Hours: logs.filter((log) => new Date(log.timestamp) > last24Hours)
        .length,
      uniqueUsers: new Set(logs.map((log) => log.userId)).size,
    };
  }

  async deleteAllLogs(): Promise<void> {
    try {
      await this.prismaService.logs.deleteMany({});
    } catch (error) {
      console.error('❌ Error eliminando todos los logs:', error);
    }
  }

  async deleteOneMonthLogs(): Promise<void> {
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      await this.prismaService.logs.deleteMany({
        where: {
          timestamp: {
            lt: oneMonthAgo,
          },
        },
      });
    } catch (error) {
      console.error('❌ Error eliminando logs de más de un mes:', error);
    }
  }

  /**
   * Registra un evento de importación de datos
   */
  async logImportEvent(logData: Omit<ImportLog, 'timestamp'>): Promise<void> {
    try {
      const log: ImportLog = {
        ...logData,
        timestamp: new Date().toISOString(),
      };

      await this.prismaService.logs.create({
        data: {
          message: log.message,
          level:
            log.status === 'success'
              ? 'INFO'
              : log.status === 'error'
                ? 'ERROR'
                : 'WARN',
          description: JSON.stringify(log),
          action: 'import_excel',
          entityType: log.entityType,
          entityId: log.entityId,
        },
      });

      console.log(`📄 Import log: ${log.status} - ${log.message}`);
    } catch (error) {
      console.error('❌ Error guardando log de importación:', error);
    }
  }

  /**
   * Registra un evento de creación de consumo
   */
  async logConsumptionCreate(
    logData: Omit<ConsumptionLog, 'timestamp' | 'action'>,
  ): Promise<void> {
    try {
      const log: ConsumptionLog = {
        ...logData,
        action: 'create',
        timestamp: new Date().toISOString(),
      };

      const message =
        logData.status === 'success'
          ? `Consumo creado exitosamente (ID: ${logData.consumptionId})`
          : `Error al crear consumo`;

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'consumption_create',
          entityType: 'consumption',
          entityId: logData.consumptionId,
          userId: logData.userId,
        },
      });

      console.log(
        `➕ Consumo creado: ${logData.consumptionId} - ${logData.status}`,
      );
    } catch (error) {
      console.error('❌ Error guardando log de creación de consumo:', error);
    }
  }

  /**
   * Registra un evento de actualización de consumo
   */
  async logConsumptionUpdate(
    logData: Omit<ConsumptionLog, 'timestamp' | 'action'>,
  ): Promise<void> {
    try {
      const log: ConsumptionLog = {
        ...logData,
        action: 'update',
        timestamp: new Date().toISOString(),
      };

      const changedFieldsInfo =
        logData.changedFields && Object.keys(logData.changedFields).length > 0
          ? ` - Campos modificados: ${Object.keys(logData.changedFields).join(', ')}`
          : '';

      const message =
        logData.status === 'success'
          ? `Consumo actualizado exitosamente (ID: ${logData.consumptionId})${changedFieldsInfo}`
          : `Error al actualizar consumo`;

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'consumption_update',
          entityType: 'consumption',
          entityId: logData.consumptionId,
          userId: logData.userId,
        },
      });

      console.log(
        `✏️ Consumo actualizado: ${logData.consumptionId} - ${logData.status}`,
      );
    } catch (error) {
      console.error(
        '❌ Error guardando log de actualización de consumo:',
        error,
      );
    }
  }

  /**
   * Registra un evento de eliminación de consumo
   */
  async logConsumptionDelete(
    logData: Omit<ConsumptionLog, 'timestamp' | 'action'>,
  ): Promise<void> {
    try {
      const log: ConsumptionLog = {
        ...logData,
        action: 'delete',
        timestamp: new Date().toISOString(),
      };

      const message =
        logData.status === 'success'
          ? `Consumo eliminado exitosamente (ID: ${logData.consumptionId})`
          : `Error al eliminar consumo`;

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'consumption_delete',
          entityType: 'consumption',
          entityId: logData.consumptionId,
          userId: logData.userId,
        },
      });

      console.log(
        `🗑️ Consumo eliminado: ${logData.consumptionId} - ${logData.status}`,
      );
    } catch (error) {
      console.error('❌ Error guardando log de eliminación de consumo:', error);
    }
  }

  /**
   * Registra un evento de activación de consumo
   */
  async logConsumptionActivate(
    logData: Omit<ConsumptionLog, 'timestamp' | 'action'>,
  ): Promise<void> {
    try {
      const log: ConsumptionLog = {
        ...logData,
        action: 'activate',
        timestamp: new Date().toISOString(),
      };

      const message =
        logData.status === 'success'
          ? `Consumo activado exitosamente (ID: ${logData.consumptionId})`
          : `Error al activar consumo`;

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'consumption_activate',
          entityType: 'consumption',
          entityId: logData.consumptionId,
          userId: logData.userId,
        },
      });

      console.log(
        `✅ Consumo activado: ${logData.consumptionId} - ${logData.status}`,
      );
    } catch (error) {
      console.error('❌ Error guardando log de activación de consumo:', error);
    }
  }

  /**
   * Registra un evento de desactivación de consumo
   */
  async logConsumptionDeactivate(
    logData: Omit<ConsumptionLog, 'timestamp' | 'action'>,
  ): Promise<void> {
    try {
      const log: ConsumptionLog = {
        ...logData,
        action: 'deactivate',
        timestamp: new Date().toISOString(),
      };

      const message =
        logData.status === 'success'
          ? `Consumo desactivado exitosamente (ID: ${logData.consumptionId})`
          : `Error al desactivar consumo`;

      await this.prismaService.logs.create({
        data: {
          message,
          level: log.status === 'success' ? 'INFO' : 'ERROR',
          description: JSON.stringify(log),
          action: 'consumption_deactivate',
          entityType: 'consumption',
          entityId: logData.consumptionId,
          userId: logData.userId,
        },
      });

      console.log(
        `❌ Consumo desactivado: ${logData.consumptionId} - ${logData.status}`,
      );
    } catch (error) {
      console.error(
        '❌ Error guardando log de desactivación de consumo:',
        error,
      );
    }
  }

  /**
   * Lee los logs de consumo filtrando por acción
   */
  async readConsumptionLogs(
    action?: 'create' | 'update' | 'delete' | 'activate' | 'deactivate',
  ): Promise<ConsumptionLog[]> {
    try {
      const where: any = {
        entityType: 'consumption',
      };

      if (action) {
        where.action = `consumption_${action}`;
      }

      const logs = await this.prismaService.logs.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
        take: 1000,
      });

      return logs.map((log) => JSON.parse(log.description!) as ConsumptionLog);
    } catch (error) {
      console.error('❌ Error leyendo logs de consumo:', error);
      return [];
    }
  }

  /**
   * Obtiene estadísticas de consumos
   */
  async getConsumptionStats(): Promise<{
    totalCreated: number;
    totalUpdated: number;
    totalDeleted: number;
    totalActivated: number;
    totalDeactivated: number;
    last24Hours: number;
    successfulOperations: number;
    failedOperations: number;
  }> {
    const logs = await this.readConsumptionLogs();
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      totalCreated: logs.filter((log) => log.action === 'create').length,
      totalUpdated: logs.filter((log) => log.action === 'update').length,
      totalDeleted: logs.filter((log) => log.action === 'delete').length,
      totalActivated: logs.filter((log) => log.action === 'activate').length,
      totalDeactivated: logs.filter((log) => log.action === 'deactivate')
        .length,
      last24Hours: logs.filter((log) => new Date(log.timestamp) > last24Hours)
        .length,
      successfulOperations: logs.filter((log) => log.status === 'success')
        .length,
      failedOperations: logs.filter((log) => log.status === 'error').length,
    };
  }
}
