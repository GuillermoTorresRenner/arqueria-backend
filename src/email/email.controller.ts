import { Controller, Get } from '@nestjs/common';
import { EmailService } from './email.service';
import { Auth } from '../auth/decorators/auth.decorator';
import { Roles } from '../auth/roles.enum';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Verifica la conexión SMTP
   */
  @Get('test/connection')
  @Auth([Roles.ADMIN])
  async testConnection() {
    try {
      const isConnected = await this.emailService.verifyConnection();
      return {
        status: isConnected ? 'success' : 'failed',
        message: isConnected
          ? 'Conexión SMTP exitosa'
          : 'Error en conexión SMTP',
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Error verificando conexión',
        error: error.message,
      };
    }
  }
}
