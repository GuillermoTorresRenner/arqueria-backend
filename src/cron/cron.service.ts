import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly emailService: EmailService,
    private readonly loggerService: LoggerService,
  ) {}

  // @Cron('* * * * *')
  @Cron('0 0 * * *')
  async deactivateExpiredSubscriptions() {
    this.logger.log(
      'Tarea de cron desactivada en este boilerplate simplificado.',
    );
    return;
  }

  // @Cron('* * * * *')
  @Cron('0 8 * * *')
  async sendExpiryNotifications() {
    this.logger.log(
      'Tarea de cron de notificaciones desactivada en este boilerplate simplificado.',
    );
    return;
  }
}
