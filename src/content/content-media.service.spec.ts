import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { UploadService } from '../upload/upload.service';
import { ContentMediaService } from './content-media.service';

describe('ContentMediaService', () => {
  let tmp: string;
  let imagesDir: string;
  let blocks: { data: unknown }[];
  let service: ContentMediaService;

  // public/ se resuelve desde process.cwd(): se apunta a un temporal para
  // trabajar con archivos reales sin tocar el public/ del repo.
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'abma-media-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tmp);
    imagesDir = path.join(tmp, 'public', 'images');
    await fs.mkdir(imagesDir, { recursive: true });

    blocks = [];
    const prisma = {
      block: { findMany: jest.fn(async () => blocks) },
    };
    const upload = new UploadService({ log: jest.fn() } as any);
    service = new ContentMediaService(prisma as any, upload);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const touch = async (name: string, ageMs = 0) => {
    const file = path.join(imagesDir, name);
    await fs.writeFile(file, 'webp');
    const when = new Date(Date.now() - ageMs);
    await fs.utimes(file, when, when);
  };
  const exists = (name: string) =>
    fs.access(path.join(imagesDir, name)).then(
      () => true,
      () => false,
    );
  const DAY = 24 * 60 * 60 * 1000;

  describe('extractImages', () => {
    it('encuentra imágenes subidas en cualquier nivel del JSON', () => {
      const found = service.extractImages({
        image: '/public/images/hero_abc-1.webp',
        images: [
          { src: '/public/images/g1.webp', alt: 'x' },
          { src: 'https://api.example.cl/public/images/g2.webp' },
        ],
      });
      expect([...found].sort()).toEqual([
        'images/g1.webp',
        'images/g2.webp',
        'images/hero_abc-1.webp',
      ]);
    });

    it('ignora URLs externas, assets de demo y rutas manipuladas', () => {
      const found = service.extractImages({
        a: 'https://cdn.example.com/foto.jpg',
        b: 'http://localhost:4000/public/content/galeria-1.jpg',
        c: '/public/images/../../dist/main.js',
        d: '/public/images/sub/x.webp',
        e: '/public/users_avatar/user_1.webp',
      });
      expect(found.size).toBe(0);
    });
  });

  describe('purge', () => {
    it('borra la imagen que ya nadie usa', async () => {
      await touch('vieja.webp');
      await service.purge(['images/vieja.webp']);
      expect(await exists('vieja.webp')).toBe(false);
    });

    it('conserva la imagen si otro bloque la sigue usando', async () => {
      await touch('compartida.webp');
      blocks = [{ data: { image: '/public/images/compartida.webp' } }];
      await service.purge(['images/compartida.webp']);
      expect(await exists('compartida.webp')).toBe(true);
    });

    it('no falla si el archivo ya no existe', async () => {
      await expect(
        service.purge(['images/fantasma.webp']),
      ).resolves.toBeUndefined();
    });
  });

  describe('sweepOrphans', () => {
    it('borra huérfanas viejas y respeta las usadas y las recientes', async () => {
      await touch('huerfana.webp', 2 * DAY);
      await touch('en-uso.webp', 2 * DAY);
      await touch('recien-subida.webp', 60 * 1000);
      blocks = [{ data: { images: [{ src: '/public/images/en-uso.webp' }] } }];

      expect(await service.sweepOrphans()).toBe(1);

      expect(await exists('huerfana.webp')).toBe(false);
      expect(await exists('en-uso.webp')).toBe(true);
      expect(await exists('recien-subida.webp')).toBe(true);
    });
  });
});
