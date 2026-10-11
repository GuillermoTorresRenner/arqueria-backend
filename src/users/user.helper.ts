import { BadRequestException } from '@nestjs/common';

/**
 * Helper functions for user-related operations
 */

/**
 * URL pública del avatar, relativa a la API (`/public/users_avatar/x.webp`),
 * igual que el resto de archivos subidos: el frontend la resuelve contra el
 * origen de la API. El archivo siempre se llama `user_<id>.webp`, así que se
 * agrega la fecha de la última modificación del usuario para que el navegador
 * no muestre la foto anterior desde su caché.
 */
export function buildUserAvatarUrl(
  avatar: string | null,
  version?: Date | null,
): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  // Se guarda como `user_<id>.webp` o `users_avatar/user_<id>.webp`
  const file = avatar.replace(/^users_avatar\//, '');
  const query = version ? `?v=${new Date(version).getTime()}` : '';
  return `/public/users_avatar/${file}${query}`;
}

/// Límites del avatar: imagen de hasta 5 MB (se convierte a WebP de 150×150)
export const AVATAR_UPLOAD = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, accept: boolean) => void,
  ) => {
    if (!file.mimetype.startsWith('image/')) {
      return callback(
        new BadRequestException('El avatar debe ser una imagen'),
        false,
      );
    }
    callback(null, true);
  },
};
