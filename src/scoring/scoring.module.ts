import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { ScoringController } from './scoring.controller';
import { ScoringService } from './scoring.service';
import { ScoringGateway } from './scoring.gateway';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ScoringController],
  providers: [ScoringService, ScoringGateway],
  exports: [ScoringService],
})
export class ScoringModule {}
