import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../logger/logger.module';
import { ScoringModule } from '../scoring/scoring.module';
import { BracketsController } from './brackets.controller';
import { BracketsService } from './brackets.service';

@Module({
  imports: [PrismaModule, AuthModule, LoggerModule, ScoringModule],
  controllers: [BracketsController],
  providers: [BracketsService],
})
export class BracketsModule {}
