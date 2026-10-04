import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountTokensService } from './account-tokens.service';

/// JwtModule es global (registrado en AuthModule), así que basta Prisma.
@Module({
  imports: [PrismaModule],
  providers: [AccountTokensService],
  exports: [AccountTokensService],
})
export class AccountTokensModule {}
