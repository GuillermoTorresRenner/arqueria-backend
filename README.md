# abma-backend

API de **Galadhrym** (Asociación de Arquería): CMS, socios, torneos y puntuaciones.
NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis.

> El proyecto se llama `abma` en toda la infraestructura. *Galadhrym* es el nombre
> público del club. Ver [CLAUDE.md](../CLAUDE.md) del workspace.

## Desarrollo

```bash
cp .env.example .env
npm install
docker compose -f docker-compose.dev.yml up -d   # Postgres :5440, Redis :6390
npx prisma migrate dev
npm run seed
npm run start:dev                                 # http://localhost:4000/api
```

Swagger en `http://localhost:4000/docs`.
Admin del seed: `torresrennerguillermo@gmail.com`. Su contraseña **no está en el repo**:
defínela en `SEED_ADMIN_PASSWORD` (en tu `.env` local, o en el secret del entorno) antes del
primer `npm run seed`; sin ella el seed se niega a crear el admin.

## Comandos

```bash
npm run start:dev      # watch
npm run build          # nest build → dist/src/main.js
npm test               # jest
npm run lint           # eslint --fix
npm run seed           # datos iniciales
npx prisma migrate dev # nueva migración
```

## Seeders

```bash
npm run seed       # producción: admin, categorías, formatos, contenido base
npm run seed:dev   # desarrollo: + juez, 8 socios, torneo con marcador y carrusel
```

`seed:dev` crea datos de prueba y **aborta si NODE_ENV=production**. Sus
credenciales son públicas y débiles a propósito, para entrar rápido en local:

| Rol | Correo | Clave |
|---|---|---|
| Admin | `torresrennerguillermo@gmail.com` | `SEED_ADMIN_PASSWORD`, o `GuillermoTell` si no está definida |
| Juez | `juez@galadhrym.cl` | `GuillermoTell` |
| Socios | `<nombre>@galadhrym.test` | `GuillermoTell` |

> ⚠️ No usar estas claves fuera de desarrollo. Para el admin de producción, define
> `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` antes de correr `npm run seed`.

Las imágenes de muestra del carrusel se generan en `public/content/` y las sirve
el propio backend, para que el seed no dependa de servicios externos.

## Módulos

| Módulo | Rol |
|---|---|
| `auth/` | JWT por cookie, `@Auth([roles])`, guards |
| `users/` | CRUD de usuarios |
| `content/` | **CMS**: secciones y bloques de la landing |
| `members/` | Socios, categorías, estados |
| `tournaments/` | Torneos, rondas, inscripciones, sorteo de grupos |
| `scoring/` | Puntajes, validación, ranking, marcador en vivo |
| `email/` `cron/` `upload/` `logger/` `websockets/` | Del boilerplate |

## CRUD de usuarios

`Users` guarda **email, nombre, apellido, teléfono** y rol. Endpoints:

| Método | Ruta | Acceso |
|---|---|---|
| `POST` | `/users` | ADMIN — crea y **envía correo de bienvenida** |
| `GET` | `/users` | ADMIN — listado paginado y filtrable |
| `GET` | `/users/me` | autenticado — mi perfil |
| `PATCH` | `/users/me` | autenticado — mis datos (no el rol) |
| `PATCH` | `/users/me/password` | autenticado — exige la contraseña actual |
| `GET` | `/users/:id` | ADMIN |
| `PATCH` | `/users/:id` | ADMIN |
| `PATCH` | `/users/:id/password` | ADMIN — restablece sin la actual |
| `DELETE` | `/users/:id` | ADMIN — baja lógica |
| `PATCH` | `/users/:id/activate` | ADMIN |

Decisiones de seguridad:

- Las respuestas pasan por `formatUserResponse`: **nunca** salen `password` ni
  `refreshToken`. `findByEmail` y `findById` devuelven el registro completo
  porque los usan `AuthGuard` y `AuthService`; para la API existe `findByIdPublic`.
- `PATCH /users/me` descarta `role` e `isActive` del payload: sin eso, cualquiera
  podría auto-promoverse a ADMIN.
- Cambiar la propia contraseña exige la actual e **invalida las sesiones abiertas**
  (borra el `refreshToken`).
- Un ADMIN no puede desactivar su propia cuenta.

## Correo de bienvenida

Al crear un usuario se envía un correo con la plantilla Handlebars
[src/templates/email/welcome.hbs](src/templates/email/welcome.hbs), con la paleta
del club y texto condicional según el rol.

El envío **no bloquea el alta**: si el SMTP falla, el usuario se crea igualmente y
el error queda en los logs. Las plantillas se cachean tras el primer render y se
resuelven desde `dist/` en producción y `src/` en desarrollo.

Variables relevantes: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`,
`MAIL_FROM`, `COMPANY_NAME`, `FRONTEND_URL`, `WHATSAPP_GROUP_URL` y
`MAIL_REQUIRE_TLS` (ponerla en `false` solo para un SMTP local de pruebas).

## CRUD de torneos

Cobertura completa sobre cinco entidades: torneos, formatos de puntuación,
rondas, grupos e inscripciones.

**Torneos** — `GET /tournaments` (paginado, con filtros por estado, texto,
rango de fechas y formato), `GET/POST/PATCH/DELETE /tournaments/:id`, más
`:id/stats`, `:id/status`, `:id/duplicate` y `:id/cancel`.
**Formatos** — listado, detalle, crear, actualizar y eliminar.
**Rondas** — listado, crear, actualizar, eliminar.
**Grupos** — listado, detalle, crear, actualizar, eliminar, sortear y reasignar.
**Inscripciones** — listado, inscribir, cambiar estado, dar de baja.

### Reglas que protegen los datos

**Transiciones de estado.** Un torneo sigue un flujo: borrador → inscripciones
abiertas → en curso → finalizado, y se puede cancelar mientras no haya
terminado. `FINISHED` y `CANCELLED` son estados finales. Sin esta validación se
podrían reabrir las inscripciones de un torneo ya disputado y dejar el marcador
público incoherente.

**Borrado protegido.** Eliminar un torneo o una ronda con puntajes registrados
exige `?force=true`: la cascada se llevaría todo el historial de resultados.
Para retirar un torneo sin perder datos existe `PATCH /:id/cancel`.

**Bajas de inscripción.** Si el arquero ya tiene puntajes, se marca como
retirado en lugar de borrarlo — sus resultados forman parte del historial.

**Formatos en uso.** No se pueden eliminar si algún torneo los referencia
(la relación es obligatoria); en su lugar se desactivan.

> El **algoritmo de emparejamientos** está pendiente por decisión del equipo.
> Hoy el sorteo es aleatorio y reproducible (`GroupDrawService`), con override
> manual del admin. Cuando se definan las modalidades, el criterio de formación
> de grupos se añadirá ahí sin tocar el resto del CRUD.

## Roles

- `ADMIN` — todo: CMS, socios, torneos, validación de puntajes
- `JUDGE` — carga puntajes **solo de su grupo asignado**; sin acceso al CMS
- `MEMBER` — su perfil y su historial

## Decisiones de diseño

**La puntuación es parametrizable, no está hardcodeada.** `ScoringFormat` define
flechas por serie, series por ronda y las zonas válidas con su valor. El juez solo
indica qué zona tocó cada flecha; **el puntaje lo calcula el servidor**. Así se
soportan modalidades distintas (WA, 3D, tradicional) sin tocar código.

**El sorteo de grupos es auditable.** `GroupDrawService` usa un PRNG sembrado
(xorshift128 + SHA-256), no `Math.random()`. La semilla queda guardada en
`GroupDraw`, de modo que cualquiera puede recalcular el sorteo y comprobarlo.

**El enum `Roles` es un alias del enum de Prisma** (`src/auth/roles.enum.ts`).
No redeclararlo: el plugin de Swagger emitiría un `require()` a una ruta de `src/`
que no existe dentro del contenedor, y el arranque fallaría en producción.

## Despliegue

Ver [CLAUDE.md](../CLAUDE.md). Rama `QA` → QA, `main` → producción.
Las migraciones se aplican con `prisma migrate deploy` (con baseline idempotente).
