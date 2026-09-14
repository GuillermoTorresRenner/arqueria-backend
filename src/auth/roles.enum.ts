import { Role } from '@prisma/client';

/**
 * Roles del sistema. Es un alias del enum `Role` que genera Prisma desde
 * prisma/schema/Users.prisma, que es la única fuente de verdad: así no hay dos
 * listas de roles que puedan divergir.
 *
 * No redeclarar el enum aquí. El plugin de Swagger resuelve el enum desde el
 * tipo TypeScript y, si vive en un archivo propio, emite en `dist` un require()
 * con la ruta absoluta de `src/` — que no existe dentro del contenedor y hace
 * fallar el arranque en producción.
 */
export const Roles = Role;
export type Roles = Role;
