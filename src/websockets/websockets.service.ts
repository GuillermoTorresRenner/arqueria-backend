import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class WebsocketsService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  broadcast(event: string, payload: any) {
    if (!this.server) return false;
    this.server.emit(event, payload);
    return true;
  }

  toRoom(room: string, event: string, payload: any) {
    if (!this.server) return false;
    this.server.to(room).emit(event, payload);
    return true;
  }
}
