/**
 * Seeder de DESARROLLO. Crea datos de prueba: un admin, un juez, socios,
 * un torneo con dos categorías (puntaje y duelos) e inscritos numerados.
 *
 * ⚠️  NO EJECUTAR EN PRODUCCIÓN. Las credenciales son públicas y débiles a
 * propósito, para poder entrar rápido en local. El seed de producción es
 * `prisma/seed.ts`.
 *
 *   npm run seed:dev
 */
import {
  PrismaClient,
  CategoryMode,
  MemberStatus,
  Role,
  TournamentStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/// Las imágenes de muestra las sirve el propio backend desde public/.
const PUBLIC_URL =
  process.env.SEED_PUBLIC_URL ?? 'http://localhost:4000/public';

const DEV_ADMIN = {
  email: 'torresrennerguillermo@gmail.com',
  // La clave real de tu admin local va en SEED_ADMIN_PASSWORD (.env, ignorado);
  // el fallback es la clave pública de desarrollo, nunca una real.
  password: process.env.SEED_ADMIN_PASSWORD ?? 'GuillermoTell',
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
      emailVerifiedAt: new Date(),
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
  const categories = await prisma.category.findMany({
    where: { isActive: true },
  });
  if (categories.length === 0) {
    throw new Error('No hay categorías. Ejecuta primero `npm run seed`.');
  }
  const divisions = categories.filter((c) => c.kind === 'DIVISION');

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

  // ---- Torneo con sus dos categorías ----
  const format = await prisma.scoringFormat.findFirst({
    where: { name: 'Diana turca 0-1-2' },
  });
  if (!format)
    throw new Error('Falta la diana turca 0-1-2. Ejecuta `npm run seed`.');

  const slug = 'torneo-demo-galadhrym';
  await prisma.tournament.deleteMany({ where: { slug } });

  const tournament = await prisma.tournament.create({
    data: {
      slug,
      name: 'Torneo Demo Galadhrym',
      description:
        'Torneo de demostración con inscritos en las dos categorías, listo para sortear.',
      location: 'Museo Ferroviario de Temuco',
      startsAt: new Date(),
      status: TournamentStatus.REGISTRATION_OPEN,
      isPublic: true,
      maxParticipants: 40,
      categories: {
        create: [
          {
            name: 'Tiro tradicional',
            order: 0,
            mode: CategoryMode.SCORE,
            scoringFormatId: format.id,
            arrowsPerArcher: 3,
            judgeId: judge.id,
          },
          {
            name: 'Duelos',
            order: 1,
            mode: CategoryMode.KNOCKDOWN,
            targetsToWin: 3,
          },
        ],
      },
    },
    include: { categories: { orderBy: { order: 'asc' } } },
  });
  console.log(
    `✓ Torneo "${tournament.name}" (público, inscripciones abiertas)`,
  );

  // Todos en Tiro tradicional; la mitad también en Duelos, con el mismo número
  const [traditional, duels] = tournament.categories;
  for (const [i, member] of members.entries()) {
    await prisma.tournamentParticipant.create({
      data: { tournamentId: tournament.id, memberId: member.id, number: i + 1 },
    });
    for (const category of i % 2 === 0 ? [traditional, duels] : [traditional]) {
      await prisma.registration.create({
        data: {
          tournamentId: tournament.id,
          memberId: member.id,
          categoryId: category.id,
          status: 'CONFIRMED',
        },
      });
    }
  }
  console.log(`✓ ${members.length} participantes numerados e inscritos`);

  // ---- Carrusel de imágenes en el home ----
  // Solo si no existe: las fotos que el admin sube desde el panel no deben
  // desaparecer al volver a sembrar.
  const home = await prisma.section.findUnique({ where: { key: 'home' } });
  const hasGallery =
    home &&
    (await prisma.block.count({
      where: { sectionId: home.id, type: 'GALLERY' },
    })) > 0;
  if (home && !hasGallery) {
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
  console.log(`  Socios <nombre>@galadhrym.test / GuillermoTell`);
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
