import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LoggerService } from './logger.service';
import { Auth, Roles } from '../auth';

@ApiTags('Logs')
@ApiBearerAuth()
@Controller('logs')
@Auth([Roles.ADMIN]) // Solo ADMIN puede acceder a los logs
export class LogsController {
  constructor(private readonly loggerService: LoggerService) {}

  /**
   * Obtiene todos los logs con filtros opcionales
   */
  @Get()
  @ApiOperation({
    summary: 'Obtener todos los logs',
    description:
      'Obtiene una lista de todos los logs del sistema con filtros opcionales por nivel, límite, offset y fechas.',
  })
  @ApiQuery({
    name: 'level',
    required: false,
    enum: ['INFO', 'WARN', 'ERROR'],
    description: 'Filtrar por nivel de log',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Número máximo de logs a retornar',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Número de logs a saltar',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Fecha de inicio en formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'Fecha de fin en formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ)',
  })
  @ApiResponse({
    status: 200,
    description: 'Logs obtenidos exitosamente',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              message: { type: 'string' },
              description: { type: 'string' },
              action: { type: 'string' },
              entityType: { type: 'string' },
              entityId: { type: 'string' },
              userId: { type: 'string' },
              level: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
  })
  async getLogs(
    @Query('level') level?: 'INFO' | 'WARN' | 'ERROR',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      const options: any = {};

      if (level) {
        options.level = level;
      }

      if (limit) {
        options.limit = parseInt(limit, 10);
      }

      if (offset) {
        options.offset = parseInt(offset, 10);
      }

      if (startDate) {
        options.startDate = new Date(startDate);
      }

      if (endDate) {
        options.endDate = new Date(endDate);
      }

      const logs = await this.loggerService.getLogs(options);
      return {
        success: true,
        data: logs,
        total: logs.length,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: 'Error al obtener logs',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ... rest of controller copied unchanged ...
}
