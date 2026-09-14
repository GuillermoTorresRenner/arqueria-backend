/**
 * Seeder de DESARROLLO. Crea datos de prueba: un admin, un juez, socios,
 * un torneo en curso con grupos sorteados y puntajes cargados.
 *
 * ⚠️  NO EJECUTAR EN PRODUCCIÓN. Las credenciales son públicas y débiles a
 * propósito, para poder entrar rápido en local. El seed de producción es
 * `prisma/seed.ts`.
 *
 *   npm run seed:dev
 */
import { PrismaClient, MemberStatus, Role, TournamentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

/// Las imágenes de muestra las sirve el propio backend desde public/.
const PUBLIC_URL =
  process.env.SEED_PUBLIC_URL ?? 'http://localhost:4000/public';

const DEV_ADMIN = {
  email: 'torresrennerguillermo@gmail.com',
  password: 'GuillermoTell',
  name: 'Guillermo',
  surname: 'Torres',
};

const DEV_JUDGE = {
  email: 'juez@galadhrym.cl',
  password: 'GuillermoTell',
  name: 'Juez',
  surname: 'de Prueba',
};

const ARQUEROS = [
  { name: 'Legolas', surname: 'Hojaverde' },
  { name: 'Katniss', surname: 'Everdeen' },
  { name: 'Robin', surname: 'Hood' },
  { name: 'Guillermo', surname: 'Tell' },
  { name: 'Hanzo', surname: 'Shimada' },
  { name: 'Merida', surname: 'DunBroch' },
  { name: 'Clint', surname: 'Barton' },
  { name: 'Ygritte', surname: 'del Norte' },
];

/// Mismo PRNG que GroupDrawService, para que el sorteo del seed sea reproducible.
function seededRandom(seed: string) {
  const hash = createHash('sha256').update(seed).digest();
  let x = hash.readUInt32LE(0) || 1;
  let y = hash.readUInt32LE(4) || 2;
  let z = hash.readUInt32LE(8) || 3;
  let w = hash.readUInt32LE(12) || 4;
  return () => {
    const t = x ^ (x << 11);
    x = y; y = z; z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return w / 0x100000000;
  };
}

async function upsertUser(
  data: { email: string; password: string; name: string; surname: string },
  role: Role,
) {
  const password = await bcrypt.hash(data.password, 10);
  return prisma.users.upsert({
    where: { email: data.email },
    update: { password, userRoles: role, isActive: true },
    create: {
      email: data.email,
      password,
      name: data.name,
      surname: data.surname,
      userRoles: role,
      emailVerified: true,
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed:dev no debe ejecutarse con NODE_ENV=production');
  }

  console.log('Sembrando datos de desarrollo…\n');

  // ---- Usuarios ----
  const admin = await upsertUser(DEV_ADMIN, Role.ADMIN);
  console.log(`✓ Admin  ${admin.email}`);

  const judge = await upsertUser(DEV_JUDGE, Role.JUDGE);
  console.log(`✓ Juez   ${judge.email}`);

  // ---- Socios ----
  const categories = await prisma.category.findMany({ where: { isActive: true } });
  if (categories.length === 0) {
    throw new Error('No hay categorías. Ejecuta primero `npm run seed`.');
  }
  const divisions = categories.filter((c) => c.kind === 'DIVISION');
  const rand = seededRandom('galadhrym-dev');

  const members = [];
  for (const [i, arquero] of ARQUEROS.entries()) {
    const email = `${arquero.name.toLowerCase()}@galadhrym.test`;
    const user = await upsertUser(
      { ...arquero, email, password: 'GuillermoTell' },
      Role.MEMBER,
    );

    const division = divisions[i % divisions.length];
    const member = await prisma.member.upsert({
      where: { userId: user.id },
      update: { status: MemberStatus.ACTIVE },
      create: {
        userId: user.id,
        status: MemberStatus.ACTIVE,
        phone: `+5699000000${i}`,
        categories: { create: [{ categoryId: division.id }] },
      },
    });
    members.push(member);
  }
  console.log(`✓ ${members.length} socios activos`);

  // ---- Torneo en curso con marcador ----
  const format = await prisma.scoringFormat.findFirst({
    where: { name: 'WA 18m indoor' },
  });
  if (!format) throw new Error('Falta el formato WA 18m. Ejecuta `npm run seed`.');

  const slug = 'torneo-demo-galadhrym';
  await prisma.tournament.deleteMany({ where: { slug } });

  const tournament = await prisma.tournament.create({
    data: {
      slug,
      name: 'Torneo Demo Galadhrym',
      description:
        'Torneo de demostración con puntajes cargados, para probar el marcador en vivo.',
      location: 'Museo Ferroviario de Temuco',
      startsAt: new Date(),
      scoringFormatId: format.id,
      status: TournamentStatus.IN_PROGRESS,
      isPublic: true,
      maxParticipants: 40,
    },
  });
  console.log(`✓ Torneo "${tournament.name}" (público, en curso)`);

  const round = await prisma.round.create({
    data: { tournamentId: tournament.id, name: 'Clasificatoria', order: 0, distance: 18 },
  });

  // Inscripciones
  const registrations = [];
  for (const member of members) {
    registrations.push(
      await prisma.registration.create({
        data: {
          tournamentId: tournament.id,
          memberId: member.id,
          status: 'CONFIRMED',
        },
      }),
    );
  }

  // Dos grupos; el juez de prueba queda a cargo del primero
  const groups = [];
  for (let i = 0; i < 2; i++) {
    groups.push(
      await prisma.tournamentGroup.create({
        data: {
          tournamentId: tournament.id,
          name: `Grupo ${String.fromCharCode(65 + i)}`,
          order: i,
          judgeId: i === 0 ? judge.id : null,
        },
      }),
    );
  }

  const seed = randomBytes(8).toString('hex');
  const drawResult = [];
  for (const [i, registration] of registrations.entries()) {
    const group = groups[i % groups.length];
    await prisma.registration.update({
      where: { id: registration.id },
      data: { groupId: group.id, position: Math.floor(i / groups.length) + 1 },
    });
    drawResult.push({ groupId: group.id, registrationId: registration.id });
  }
  await prisma.groupDraw.create({
    data: {
      tournamentId: tournament.id,
      seed,
      strategy: 'RANDOM',
      result: drawResult,
      drawnById: admin.id,
    },
  });
  console.log(`✓ ${groups.length} grupos sorteados (juez asignado al Grupo A)`);

  // Puntajes: 6 series por arquero, con zonas verosímiles
  const zones = format.zones as unknown as { label: string; value: number; isInner?: boolean }[];
  const pickable = zones.filter((z) => z.value >= 6);
  let scoreCount = 0;

  for (const member of members) {
    for (let end = 1; end <= 6; end++) {
      const arrows = Array.from({ length: format.arrowsPerEnd }, () => {
        // Sesgo hacia el centro: los buenos puntajes son más probables
        const idx = Math.floor(Math.pow(rand(), 1.7) * pickable.length);
        return pickable[Math.min(idx, pickable.length - 1)];
      });

      await prisma.score.create({
        data: {
          roundId: round.id,
          memberId: member.id,
          endNumber: end,
          arrows: arrows.map((z) => ({ label: z.label, value: z.value })),
          total: arrows.reduce((sum, z) => sum + z.value, 0),
          innerTens: arrows.filter((z) => z.isInner).length,
          tens: arrows.filter((z) => z.value === 10).length,
          status: 'CONFIRMED',
          recordedById: judge.id,
        },
      });
      scoreCount++;
    }
  }
  console.log(`✓ ${scoreCount} series cargadas`);

  // ---- Carrusel de imágenes en el home ----
  const home = await prisma.section.findUnique({ where: { key: 'home' } });
  if (home) {
    await prisma.block.deleteMany({
      where: { sectionId: home.id, type: 'GALLERY' },
    });
    const lastOrder = await prisma.block.findFirst({
      where: { sectionId: home.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    await prisma.block.create({
      data: {
        sectionId: home.id,
        type: 'GALLERY',
        order: (lastOrder?.order ?? -1) + 1,
        data: {
          title: 'El club en imágenes',
          images: [
            {
              src: `${PUBLIC_URL}/content/galeria-1.jpg`,
              alt: 'Diana de competencia con una flecha en vuelo',
            },
            {
              src: `${PUBLIC_URL}/content/galeria-2.jpg`,
              alt: 'Campo de tiro del club preparado para una jornada',
            },
            {
              src: `${PUBLIC_URL}/content/galeria-3.jpg`,
              alt: 'Jornada formativa de tiro con arco tradicional',
            },
            {
              src: `${PUBLIC_URL}/content/galeria-4.jpg`,
              alt: 'Arcos tradicionales listos antes de la tanda',
            },
          ],
        },
      },
    });
    console.log('✓ Carrusel de imágenes en el home');
  }

  console.log('\n────────────────────────────────────────');
  console.log('Credenciales de desarrollo:');
  console.log(`  Admin  ${DEV_ADMIN.email} / ${DEV_ADMIN.password}`);
  console.log(`  Juez   ${DEV_JUDGE.email} / ${DEV_JUDGE.password}`);
  console.log(`  Socios <nombre>@galadhrym.test / ${DEV_ADMIN.password}`);
  console.log(`\n  Marcador: /torneos/${slug}`);
  console.log('────────────────────────────────────────');
  console.log('⚠️  Datos de prueba. No usar estas claves en producción.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
