import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';
import { WebsocketsService } from './websockets.service';
import { WebsocketsController } from './websockets.controller';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  providers: [NotificationsGateway, WebsocketsService],
  controllers: [WebsocketsController],
  exports: [WebsocketsService],
})
export class WebsocketsModule {}
