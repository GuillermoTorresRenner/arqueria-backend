import { Controller, Post, Body, Get } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendPasswordResetDto, SendTestEmailDto } from './dto/email.dto';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Endpoint para probar el envío de email de recuperación de contraseña
   */
  @Post('test/password-reset')
  async testPasswordReset(@Body() dto: SendPasswordResetDto) {
    try {
      // Generar un token de prueba
      const testToken =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);

      await this.emailService.sendPasswordResetEmail(
        dto.email,
        testToken,
        'Usuario de Prueba',
      );

      return {
        message: 'Email de recuperación enviado exitosamente',
        email: dto.email,
        token: testToken, // En producción NO devolver el token
      };
    } catch (error) {
      return {
        message: 'Error enviando email',
        error: error.message,
      };
    }
  }

  /**
   * Verifica la conexión SMTP
   */
  @Get('test/connection')
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
