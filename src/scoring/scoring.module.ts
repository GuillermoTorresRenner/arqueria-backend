import { Module } from '@nestjs/common';
import { ScoringGateway } from './scoring.gateway';

/// Marcador en vivo por socket. El fixture de los torneos se emite por aquí.
@Module({
  providers: [ScoringGateway],
  exports: [ScoringGateway],
})
export class ScoringModule {}
