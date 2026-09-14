import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { GroupDrawService } from './group-draw.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TournamentsController],
  providers: [TournamentsService, GroupDrawService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
