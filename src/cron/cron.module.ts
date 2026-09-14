import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [PrismaModule, EmailModule, LoggerModule],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
