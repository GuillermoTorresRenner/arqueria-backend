import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_IMAGE_SIDE, UploadService } from './upload.service';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  ActiveUser,
  ActiveUserData,
} from '../auth/decorators/activeUser.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/roles.enum';

/// Convierte un query param numérico y lo acota a [1, max]. Un valor ausente o
/// no numérico devuelve undefined para que el servicio use su valor por defecto.
function parseBound(value: string | undefined, max: number) {
  const n = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : undefined;
}

@ApiTags('Upload - Gestión de Archivos')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prismaService: PrismaService,
  ) {}

  @Post('image')
  @Auth([Roles.ADMIN])
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB límite
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(
            new BadRequestException('Solo se permiten archivos de imagen'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen para convertir a WebP',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('width') width?: string,
    @Query('height') height?: string,
    @Query('quality') quality?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    const options = {
      width: parseBound(width, MAX_IMAGE_SIDE),
      height: parseBound(height, MAX_IMAGE_SIDE),
      quality: parseBound(quality, 100) ?? 80,
    };

    const relativePath = await this.uploadService.convertToWebp(file, options);

    return {
      message: 'Imagen subida y convertida exitosamente',
      filename: relativePath,
      url: `/public/${relativePath}`,
      originalName: file.originalname,
      size: file.size,
      convertedOptions: options,
    };
  }

  @Post('pdf')
  @Auth([Roles.ADMIN])
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB límite para PDFs
      },
      fileFilter: (req, file, callback) => {
        if (file.mimetype !== 'application/pdf') {
          return callback(
            new BadRequestException('Solo se permiten archivos PDF'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo PDF para subir',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadPdf(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    const relativePath = await this.uploadService.savePdf(file);

    return {
      message: 'PDF subido exitosamente',
      filename: relativePath,
      url: `/public/${relativePath}`,
      originalName: file.originalname,
      size: file.size,
    };
  }

  @Post('user-avatar')
  @Auth()
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB límite para avatares
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(
            new BadRequestException('Solo se permiten archivos de imagen'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen para avatar de usuario (150x150 WebP)',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadUserAvatar(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserData,
    @Query('userId') userId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    // Solo un ADMIN puede cambiar el avatar de otro usuario; el resto siempre
    // sube el suyo aunque mande ?userId=.
    const targetUserId =
      userId && user.role === Roles.ADMIN ? userId : user.userID;

    // El id acaba en el nombre del archivo: confirmar que es un usuario real
    // antes de escribir nada en disco.
    const exists = await this.prismaService.users.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const relativePath = await this.uploadService.convertToUserAvatar(
      file,
      targetUserId,
    );

    // Actualizar el campo avatar en la base de datos
    const avatarFilename = relativePath.replace('users_avatar/', '');
    await this.prismaService.users.update({
      where: { id: targetUserId },
      data: { avatar: avatarFilename },
    });

    return {
      message: 'Avatar de usuario subido exitosamente',
      filename: relativePath,
      url: `/public/${relativePath}`,
      originalName: file.originalname,
      size: file.size,
      dimensions: '150x150',
      format: 'webp',
      savedToDatabase: true,
    };
  }

  @Post('file')
  @Auth([Roles.ADMIN])
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB por defecto
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Subir un archivo a una carpeta permitida. Use query ?folder=content|images|documents|users_avatar',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    if (!folder) {
      throw new BadRequestException(
        'Debe indicar la carpeta destino en ?folder=',
      );
    }

    const relativePath = await this.uploadService.saveFile(file, folder);

    return {
      message: 'Archivo subido exitosamente',
      filename: relativePath,
      url: `/public/${relativePath}`,
      originalName: file.originalname,
      size: file.size,
    };
  }
}
