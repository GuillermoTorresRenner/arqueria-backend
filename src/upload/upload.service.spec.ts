import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sharp from 'sharp';
import { BadRequestException } from '@nestjs/common';
import { MAX_IMAGE_SIDE, UploadService } from './upload.service';

describe('UploadService.convertToWebp', () => {
  let tmp: string;
  let service: UploadService;

  // El servicio resuelve public/ desde process.cwd(): se apunta a un
  // directorio temporal para no ensuciar el public/ real del repo.
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'abma-upload-'));
    jest.spyOn(process, 'cwd').mockReturnValue(tmp);
    await fs.mkdir(path.join(tmp, 'public', 'images'), { recursive: true });
    service = new UploadService({ log: jest.fn() } as any);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const asFile = (buffer: Buffer, mimetype = 'image/jpeg') =>
    ({ buffer, mimetype, originalname: 'foto.jpg' }) as Express.Multer.File;

  const solid = (width: number, height: number) =>
    sharp({
      create: { width, height, channels: 3, background: '#a33' },
    });

  const metaOf = (relativePath: string) =>
    sharp(path.join(tmp, 'public', relativePath)).metadata();

  it('guarda la imagen como WebP en public/images', async () => {
    const input = await solid(100, 50).png().toBuffer();

    const out = await service.convertToWebp(asFile(input, 'image/png'));

    expect(out).toMatch(/^images\/[\w-]{12}\.webp$/);
    const meta = await metaOf(out);
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([100, 50]);
  });

  it('acota el lado mayor a MAX_IMAGE_SIDE sin deformar', async () => {
    const input = await solid(MAX_IMAGE_SIDE * 2, MAX_IMAGE_SIDE)
      .jpeg()
      .toBuffer();

    const meta = await metaOf(await service.convertToWebp(asFile(input)));

    expect([meta.width, meta.height]).toEqual([
      MAX_IMAGE_SIDE,
      MAX_IMAGE_SIDE / 2,
    ]);
  });

  it('endereza las fotos según la orientación EXIF', async () => {
    // Orientación 6 = girar 90°: los píxeles son apaisados pero la foto es
    // vertical. Sin rotate() el WebP saldría de lado.
    const input = await solid(200, 100)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const meta = await metaOf(await service.convertToWebp(asFile(input)));

    expect([meta.width, meta.height]).toEqual([100, 200]);
  });

  it('rechaza un archivo que no es una imagen decodificable', async () => {
    await expect(
      service.convertToWebp(asFile(Buffer.from('no soy una imagen'))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
