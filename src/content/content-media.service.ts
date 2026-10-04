import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

/// Ruta pública de una imagen subida por /upload/image. El patrón es estricto a
/// propósito: el JSON de los bloques lo escribe el admin, y solo se borra lo
/// que tiene exactamente la forma de un archivo generado por el backend (sin
/// `..` ni subcarpetas). Las URLs externas y los assets de demo de
/// public/content/ nunca coinciden. Se acepta también la URL absoluta (el
/// admin puede pegar la que ve en el navegador): sin eso, el barrido tomaría
/// por huérfana una imagen que sí está en uso.
const UPLOADED_IMAGE =
  /^(?:https?:\/\/[^/]+)?\/public\/(images\/[A-Za-z0-9_-]+\.webp)$/;

/// Una imagen subida y aún no guardada en un bloque (editor abierto) no es un
/// huérfano: el barrido solo toca archivos más viejos que esto.
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Mantiene public/images sincronizado con el contenido: cuando un bloque deja
 * de referenciar una imagen, el archivo se borra del disco.
 */
@Injectable()
export class ContentMediaService {
  private readonly logger = new Logger(ContentMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  /// Rutas relativas a public/ (`images/x.webp`) de las imágenes subidas que
  /// aparecen en cualquier punto del JSON de un bloque.
  extractImages(data: unknown, found = new Set<string>()): Set<string> {
    if (typeof data === 'string') {
      const match = UPLOADED_IMAGE.exec(data);
      if (match) found.add(match[1]);
    } else if (Array.isArray(data)) {
      data.forEach((item) => this.extractImages(item, found));
    } else if (data && typeof data === 'object') {
      Object.values(data).forEach((value) => this.extractImages(value, found));
    }
    return found;
  }

  /// Borra del disco las imágenes candidatas que ya no usa ningún bloque. Se
  /// llama después de confirmar el cambio en BD: si el borrado falla, el
  /// contenido ya es correcto y el barrido diario lo reintenta.
  async purge(candidates: Iterable<string>) {
    const pending = [...candidates];
    if (pending.length === 0) return;

    const inUse = await this.referencedImages();
    for (const relativePath of pending) {
      if (!inUse.has(relativePath)) await this.remove(relativePath);
    }
  }

  /// Red de seguridad para lo que purge() no ve: imágenes subidas desde un
  /// editor que se cerró sin guardar, o bloques borrados fuera de la API
  /// (seeds, SQL a mano).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweepOrphans() {
    const dir = path.join(process.cwd(), 'public', 'images');
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const inUse = await this.referencedImages();
    const cutoff = Date.now() - ORPHAN_GRACE_MS;

    let removed = 0;
    for (const file of files) {
      const relativePath = `images/${file}`;
      if (inUse.has(relativePath)) continue;
      if (!UPLOADED_IMAGE.test(`/public/${relativePath}`)) continue;

      const { mtimeMs } = await fs.stat(path.join(dir, file));
      if (mtimeMs > cutoff) continue;

      if (await this.remove(relativePath)) removed++;
    }
    if (removed > 0) {
      this.logger.log(`Barrido: ${removed} imágenes huérfanas eliminadas`);
    }
    return removed;
  }

  private async referencedImages() {
    const blocks = await this.prisma.block.findMany({ select: { data: true } });
    const found = new Set<string>();
    blocks.forEach((block) => this.extractImages(block.data, found));
    return found;
  }

  /// Devuelve true si el archivo se borró. Que ya no exista no es un error.
  private async remove(relativePath: string) {
    try {
      await this.uploadService.removeFile(relativePath);
      return true;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger.error(
          `No se pudo borrar ${relativePath}: ${error?.message}`,
        );
      }
      return false;
    }
  }
}
