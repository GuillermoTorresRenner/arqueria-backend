import { Module } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { LogsController } from './logs.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LogsController],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
