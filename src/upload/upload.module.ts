import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [
    MulterModule.register({
      storage: undefined, // Usaremos memoria en lugar de disco
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    PrismaModule, // Proporciona PrismaService
    LoggerModule, // Proporciona LoggerService
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
