import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';

import { UsersModule } from './users/users.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadModule } from './upload/upload.module';
import { EmailModule } from './email/email.module';
import { CronModule } from './cron/cron.module';
import { LoggerModule } from './logger/logger.module';
import { WebsocketsModule } from './websockets/websockets.module';
import { ContentModule } from './content/content.module';
import { MembersModule } from './members/members.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { ScoringModule } from './scoring/scoring.module';
import { ActivitiesModule } from './activities/activities.module';

@Module({
  imports: [
    // Servir archivos estáticos desde la carpeta public
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '../../public'),
      serveRoot: '/public',
    }),
    // Habilitar tareas programadas
    ScheduleModule.forRoot(),
    // Límite de peticiones. No es global: solo lo aplican los endpoints
    // públicos que lo piden con @UseGuards(ThrottlerGuard) + @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    UsersModule,
    AuthModule,
    PrismaModule,
    UploadModule,
    EmailModule,
    CronModule,
    LoggerModule,
    WebsocketsModule,
    ContentModule,
    MembersModule,
    TournamentsModule,
    ScoringModule,
    ActivitiesModule,
  ],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
