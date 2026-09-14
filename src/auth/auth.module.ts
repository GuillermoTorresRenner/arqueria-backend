import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../email/email.module';
import { LoggerModule } from '../logger/logger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';

@Global() // ← Hace que el módulo sea global
@Module({
  imports: [
    UsersModule,
    EmailModule,
    LoggerModule,
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard, // ← Guards como providers
    RoleGuard, // ← Guards como providers
  ],
  exports: [
    AuthService,
    AuthGuard, // ← Exportar guards globalmente
    RoleGuard, // ← Exportar guards globalmente
  ],
})
export class AuthModule {}
