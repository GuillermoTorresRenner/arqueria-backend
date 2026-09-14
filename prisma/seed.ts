import { PrismaClient, BlockType, CategoryKind, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/// Invitación al grupo de WhatsApp del club. Es un enlace público: cualquiera
/// con la URL puede entrar. Si se rota la invitación, basta con cambiar esta
/// variable (o editarlo desde el panel de administración).
const WHATSAPP_GROUP_URL =
  process.env.SEED_WHATSAPP_URL ??
  'https://chat.whatsapp.com/LkF1rxkIjBqL0qHTwA60au';

/// Contenido inicial de la landing de Galadhrym. Todo esto es editable
/// después desde el panel de administración.
const SECTIONS = [
  {
    key: 'home',
    title: 'Portada',
    order: 0,
    blocks: [
      {
        type: BlockType.HERO,
        order: 0,
        data: {
          title: 'Galadhrym',
          subtitle: 'Asociación de arquería',
          text: 'Tiro con arco para todas las edades y niveles.',
          ctaLabel: 'Súmate al club',
          ctaHref: '#contacto',
          image: null,
        },
      },
      {
        type: BlockType.CARDS,
        order: 1,
        data: {
          title: 'Qué hacemos',
          items: [
            {
              title: 'Escuela de arquería',
              text: 'Clases para principiantes, sin experiencia previa ni equipo propio.',
              icon: 'target',
            },
            {
              title: 'Entrenamiento',
              text: 'Práctica regular acompañada para quienes ya tiran.',
              icon: 'activity',
            },
            {
              title: 'Torneos',
              text: 'Campeonatos internos y participación en competencias.',
              icon: 'trophy',
            },
          ],
        },
      },
    ],
  },
  {
    key: 'nosotros',
    title: 'Nosotros',
    order: 1,
    blocks: [
      {
        type: BlockType.RICH_TEXT,
        order: 0,
        data: {
          title: 'Sobre el club',
          html: '<p>Galadhrym reúne a quienes practican tiro con arco en un espacio de formación, entrenamiento y competencia.</p>',
        },
      },
    ],
  },
  {
    key: 'contacto',
    title: 'Contacto',
    order: 2,
    blocks: [
      {
        type: BlockType.CTA,
        order: 0,
        data: {
          title: '¿Quieres empezar?',
          text: 'Súmate al grupo de WhatsApp y te contamos cómo participar en la próxima jornada.',
          ctaLabel: 'Unirme al grupo de WhatsApp',
          ctaHref: WHATSAPP_GROUP_URL,
          ctaIcon: 'whatsapp',
        },
      },
    ],
  },
];

const CATEGORIES = [
  { kind: CategoryKind.DIVISION, code: 'RECURVO', label: 'Arco recurvo' },
  { kind: CategoryKind.DIVISION, code: 'COMPUESTO', label: 'Arco compuesto' },
  { kind: CategoryKind.DIVISION, code: 'TRADICIONAL', label: 'Arco tradicional' },
  { kind: CategoryKind.GENDER, code: 'FEMENINO', label: 'Femenino' },
  { kind: CategoryKind.GENDER, code: 'MASCULINO', label: 'Masculino' },
  { kind: CategoryKind.AGE, code: 'INFANTIL', label: 'Infantil', minAge: 0, maxAge: 13 },
  { kind: CategoryKind.AGE, code: 'CADETE', label: 'Cadete', minAge: 14, maxAge: 17 },
  { kind: CategoryKind.AGE, code: 'SENIOR', label: 'Senior', minAge: 18, maxAge: 49 },
  { kind: CategoryKind.AGE, code: 'MASTER', label: 'Máster', minAge: 50, maxAge: 120 },
];

/// Formatos de ejemplo. Las modalidades reales del club están por definir:
/// cuando se definan, se cargan aquí o desde el panel, sin tocar código.
const SCORING_FORMATS = [
  {
    name: 'WA 18m indoor',
    description: 'Tiro al blanco bajo techo, 18 metros, 20 series de 3 flechas.',
    arrowsPerEnd: 3,
    endsPerRound: 20,
    maxPerArrow: 10,
    zones: [
      { label: 'X', value: 10, isInner: true },
      { label: '10', value: 10 },
      { label: '9', value: 9 },
      { label: '8', value: 8 },
      { label: '7', value: 7 },
      { label: '6', value: 6 },
      { label: '5', value: 5 },
      { label: '4', value: 4 },
      { label: '3', value: 3 },
      { label: '2', value: 2 },
      { label: '1', value: 1 },
      { label: 'M', value: 0 },
    ],
  },
  {
    name: '3D recorrido',
    description: 'Siluetas 3D a distancias desconocidas.',
    arrowsPerEnd: 1,
    endsPerRound: 24,
    maxPerArrow: 11,
    zones: [
      { label: '11', value: 11, isInner: true },
      { label: '10', value: 10 },
      { label: '8', value: 8 },
      { label: '5', value: 5 },
      { label: 'M', value: 0 },
    ],
  },
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@galadhrym.cl';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Galadhrym2026!';

  const admin = await prisma.users.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      name: 'Administrador',
      surname: 'Galadhrym',
      userRoles: Role.ADMIN,
      emailVerified: true,
    },
  });
  console.log(`✓ Admin: ${admin.email}`);

  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { kind_code: { kind: category.kind, code: category.code } },
      update: {},
      create: category,
    });
  }
  console.log(`✓ ${CATEGORIES.length} categorías`);

  for (const format of SCORING_FORMATS) {
    await prisma.scoringFormat.upsert({
      where: { name: format.name },
      update: {},
      create: format,
    });
  }
  console.log(`✓ ${SCORING_FORMATS.length} formatos de puntuación`);

  for (const section of SECTIONS) {
    const { blocks, ...sectionData } = section;
    const existing = await prisma.section.findUnique({
      where: { key: section.key },
    });
    if (existing) continue;

    await prisma.section.create({
      data: {
        ...sectionData,
        blocks: { create: blocks },
      },
    });
  }
  console.log(`✓ ${SECTIONS.length} secciones de contenido`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
