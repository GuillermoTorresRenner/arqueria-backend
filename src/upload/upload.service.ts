import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { LoggerService } from '../logger/logger.service';

import * as sharp from 'sharp';

/// Lado máximo (px) de las imágenes de contenido. Cubre un hero a pantalla
/// completa en monitores grandes sin servir el original de la cámara.
export const MAX_IMAGE_SIDE = 2400;

@Injectable()
export class UploadService {
  private readonly imagesPath = path.join(process.cwd(), 'public', 'images');
  private readonly documentsPath = path.join(
    process.cwd(),
    'public',
    'documents',
  );
  private readonly _usersAvatarPath = path.join(
    process.cwd(),
    'public',
    'users_avatar',
  );
  private readonly contentPath = path.join(process.cwd(), 'public', 'content');

  // Carpetas permitidas para subir archivos
  private readonly allowedFolders = new Set([
    'images',
    'documents',
    'users_avatar',
    'content',
  ]);

  get usersAvatarPath(): string {
    return this._usersAvatarPath;
  }

  constructor(private readonly loggerService: LoggerService) {
    this.ensureDirectoriesExist();
  }

  private async ensureDirectoriesExist() {
    try {
      await fs.mkdir(this.imagesPath, { recursive: true });
      await fs.mkdir(this.documentsPath, { recursive: true });
      await fs.mkdir(this._usersAvatarPath, { recursive: true });
      await fs.mkdir(this.contentPath, { recursive: true });
    } catch (error) {
      console.error('Error creating directories:', error);
    }
  }

  /**
   * Convierte y guarda una imagen en WebP en la carpeta `images`
   */
  async convertToWebp(
    file: Express.Multer.File,
    options?: {
      width?: number;
      height?: number;
      quality?: number;
    },
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    // Verificar que sea una imagen
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen');
    }

    try {
      const uniqueId = nanoid(12);
      const filename = `${uniqueId}.webp`;
      const outputPath = path.join(this.imagesPath, filename);

      // rotate() sin argumentos aplica la orientación EXIF: las fotos de móvil
      // vienen giradas en los píxeles y solo la etiqueta las endereza. El WebP
      // de salida no conserva metadatos, así que sin esto quedarían de lado.
      // Sin medidas explícitas se acota al MAX_IMAGE_SIDE para que una foto de
      // 12 MP no se sirva tal cual en la landing.
      await sharp(file.buffer)
        .rotate()
        .resize(
          options?.width ?? (options?.height ? undefined : MAX_IMAGE_SIDE),
          options?.height ?? (options?.width ? undefined : MAX_IMAGE_SIDE),
          { fit: 'inside', withoutEnlargement: true },
        )
        .webp({ quality: options?.quality || 80 })
        .toFile(outputPath);

      const relativePath = `images/${filename}`;

      await this.loggerService.log({
        level: 'INFO',
        message: 'Imagen subida',
        action: 'UPLOAD_IMAGE',
        entityType: 'File',
        entityId: relativePath,
      });

      return relativePath;
    } catch (error) {
      throw new BadRequestException(
        `Error al procesar la imagen: ${error.message}`,
      );
    }
  }

  /**
   * Guarda un PDF en la carpeta `documents`
   */
  async savePdf(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('El archivo debe ser un PDF');
    }

    try {
      const uniqueId = nanoid(12);
      const filename = `${uniqueId}.pdf`;
      const outputPath = path.join(this.documentsPath, filename);

      await fs.writeFile(outputPath, file.buffer);

      const relativePath = `documents/${filename}`;

      await this.loggerService.log({
        level: 'INFO',
        message: 'PDF subido',
        action: 'UPLOAD_PDF',
        entityType: 'File',
        entityId: relativePath,
      });

      return relativePath;
    } catch (error) {
      throw new BadRequestException(
        `Error al guardar el PDF: ${error.message}`,
      );
    }
  }

  /**
   * Convierte y guarda un avatar de usuario en formato WebP optimizado
   */
  async convertToUserAvatar(
    file: Express.Multer.File,
    userId?: string,
  ): Promise<string> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen');
    }

    try {
      const uniqueId = userId ? `user_${userId}` : `user_${nanoid(12)}`;
      const filename = `${uniqueId}.webp`;
      const outputPath = path.join(this._usersAvatarPath, filename);

      await sharp(file.buffer)
        .resize(150, 150, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 90, effort: 6 })
        .toFile(outputPath);

      const relativePath = `users_avatar/${filename}`;

      await this.loggerService.log({
        level: 'INFO',
        message: 'Avatar de usuario subido',
        action: 'UPLOAD_USER_AVATAR',
        entityType: 'File',
        entityId: relativePath,
      });

      return relativePath;
    } catch (error) {
      throw new BadRequestException(
        `Error al procesar el avatar de usuario: ${error.message}`,
      );
    }
  }

  /**
   * Guarda un archivo en una de las carpetas permitidas
   */
  async saveFile(file: Express.Multer.File, folder: string): Promise<string> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    if (!file.buffer) {
      throw new BadRequestException('El buffer del archivo no está disponible');
    }

    if (!this.allowedFolders.has(folder)) {
      throw new BadRequestException('Carpeta no permitida');
    }

    try {
      const uniqueId = nanoid(12);
      const extension = path.extname(file.originalname) || '.bin';
      const filename = `${uniqueId}${extension}`;
      const folderPath = path.join(process.cwd(), 'public', folder);
      await fs.mkdir(folderPath, { recursive: true });
      const outputPath = path.join(folderPath, filename);

      await fs.writeFile(outputPath, file.buffer);

      const relativePath = `${folder}/${filename}`;

      await this.loggerService.log({
        level: 'INFO',
        message: 'Archivo subido',
        action: 'UPLOAD_FILE',
        entityType: 'File',
        entityId: relativePath,
      });

      return relativePath;
    } catch (error) {
      throw new BadRequestException(
        `Error al guardar el archivo: ${error.message}`,
      );
    }
  }

  /**
   * Elimina un archivo (acepta path absoluto o relativo a `public/`)
   * Nota: no hay endpoint HTTP para borrado; método de helper para uso interno.
   */
  async removeFile(filePath: string): Promise<void> {
    // Sin try/catch: el error se propaga al llamador, que decide qué hacer.
    let fullPath = filePath;
    if (!filePath.startsWith(process.cwd())) {
      fullPath = path.join(process.cwd(), 'public', filePath);
    }

    await fs.unlink(fullPath);

    await this.loggerService.log({
      level: 'INFO',
      message: 'Archivo eliminado',
      action: 'DELETE_FILE',
      entityType: 'File',
      entityId: filePath,
    });
  }
}
