import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WebsocketsService } from './websockets.service';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: 'notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;

  constructor(
    private readonly wsService: WebsocketsService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    // register server instance in service
    this.wsService.setServer(this.server);
  }

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        this.extractTokenFromCookies(client.handshake.headers.cookie);
      if (token) {
        const payload = this.jwtService.verify(token, {
          ignoreExpiration: false,
        });
        // attach user info to socket for later use
        (client as any).data = { ...(client as any).data, user: payload };
      }
      // Accept the connection
      console.log(`🔌 WebSocket connected: ${client.id}`);
    } catch (err) {
      console.warn(
        '❌ WebSocket auth failed, disconnecting client',
        err?.message || err,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`🔴 WebSocket disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    client.emit('pong', { message: 'pong', received: data });
  }

  @SubscribeMessage('echo')
  handleEcho(@MessageBody() data: any) {
    // simply echo back
    return { event: 'echo', data };
  }

  private extractTokenFromCookies(cookieHeader?: string | null): string | null {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const c of cookies) {
      const [k, v] = c.split('=');
      if (k === 'jwt' || k === 'token') return decodeURIComponent(v || '');
    }
    return null;
  }
}
