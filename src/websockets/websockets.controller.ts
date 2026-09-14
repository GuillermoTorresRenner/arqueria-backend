import { Controller } from '@nestjs/common';
import { WebsocketsService } from './websockets.service';

/**
 * WebsocketsController
 *
 * Este controlador ha sido consolidado con el módulo de Test.
 * Los endpoints de prueba de websockets están ahora en:
 * - POST /api/test/websockets/broadcast
 *
 * Para más información, ver test.controller.ts
 */
@Controller('gateway')
export class WebsocketsController {
  constructor(private readonly wsService: WebsocketsService) {}

  /**
   * @deprecated - Ver test.controller.ts -> POST /api/test/websockets/broadcast
   */
}
