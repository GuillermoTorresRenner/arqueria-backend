import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  ActiveUser,
  ActiveUserData,
} from '../auth/decorators/activeUser.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Upload - Gestión de Archivos')
@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prismaService: PrismaService,
  ) {}

  @Post('image')
  @Auth()
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
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined,
      quality: quality ? parseInt(quality) : 80,
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
  @Auth()
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

    // Usar el ID del usuario autenticado o el proporcionado en query
    const targetUserId = userId || user.userID;

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

  @Post('company-avatar/:companyId')
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
    description: 'Archivo de imagen para avatar de compañía (200x200 WebP)',
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
  async uploadCompanyAvatar(
    @UploadedFile() file: Express.Multer.File,
    @ActiveUser() user: ActiveUserData,
    @Query('companyId') companyId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    // Usar solo el companyId de la ruta o query
    const targetCompanyId = companyId;

    if (!targetCompanyId) {
      throw new BadRequestException(
        'No se ha proporcionado un ID de compañía válido',
      );
    }

    const relativePath = await this.uploadService.convertToCompanyAvatar(
      file,
      targetCompanyId,
    );

    return {
      message: 'Avatar de compañía subido exitosamente (no guardado en BD)',
      filename: relativePath,
      url: `/public/${relativePath}`,
      originalName: file.originalname,
      size: file.size,
      dimensions: '200x200',
      format: 'webp',
      savedToDatabase: false,
    };
  }

  @Post('file')
  @Auth()
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
      'Subir un archivo a una carpeta permitida. Use query ?folder=content|images|documents|users_avatar|company_avatar',
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
