import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { ContentMediaService } from './content-media.service';

@Module({
  imports: [PrismaModule, AuthModule, UploadModule],
  controllers: [ContentController],
  providers: [ContentService, ContentMediaService],
  exports: [ContentService],
})
export class ContentModule {}
