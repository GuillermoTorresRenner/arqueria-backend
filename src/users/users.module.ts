import { AccountTokensModule } from '../account-tokens/account-tokens.module';
import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LoggerModule } from '../logger/logger.module';
import { UploadModule } from '../upload/upload.module';
import { EmailModule } from '../email/email.module';

@Global() // ← Hacer UsersModule global
@Module({
  imports: [LoggerModule, UploadModule, EmailModule, AccountTokensModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
