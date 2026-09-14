import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * Marcador en vivo. A diferencia del gateway de notificaciones, este admite
 * conexiones anónimas: el público sigue el torneo sin tener cuenta. Solo se
 * emite (nunca se recibe) puntaje por aquí; cargarlo va por HTTP autenticado.
 */
@WebSocketGateway({
  namespace: 'scoring',
  cors: { origin: true, credentials: true },
})
export class ScoringGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ScoringGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`Espectador conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Espectador desconectado: ${client.id}`);
  }

  @SubscribeMessage('joinTournament')
  joinTournament(
    @MessageBody() data: { tournamentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.tournamentId)
      return { ok: false, error: 'tournamentId requerido' };
    client.join(this.room(data.tournamentId));
    return { ok: true, room: this.room(data.tournamentId) };
  }

  @SubscribeMessage('leaveTournament')
  leaveTournament(
    @MessageBody() data: { tournamentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.tournamentId) return { ok: false };
    client.leave(this.room(data.tournamentId));
    return { ok: true };
  }

  /// Una serie nueva o corregida.
  emitScoreUpdate(tournamentId: string, payload: unknown) {
    this.server?.to(this.room(tournamentId)).emit('scoreUpdate', payload);
  }

  /// Ranking recalculado.
  emitLeaderboard(tournamentId: string, payload: unknown) {
    this.server?.to(this.room(tournamentId)).emit('leaderboard', payload);
  }

  private room(tournamentId: string) {
    return `tournament:${tournamentId}`;
  }
}
