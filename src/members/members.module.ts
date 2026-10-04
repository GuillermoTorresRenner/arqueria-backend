import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { AccountTokensModule } from '../account-tokens/account-tokens.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [PrismaModule, AuthModule, EmailModule, AccountTokensModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
