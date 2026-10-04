import { BadRequestException, ConflictException } from '@nestjs/common';
import { MembersService } from './members.service';
import { JoinClubDto } from './dto';

describe('MembersService.join', () => {
  const dto = (over: Partial<JoinClubDto> = {}): JoinClubDto => ({
    name: 'Ana',
    surname: 'Arquera',
    birthDate: '1995-04-21',
    email: 'ana@correo.cl',
    experience: 'BEGINNER',
    acceptCommunications: true,
    ...over,
  });

  let prisma: any;
  let auth: any;
  let email: any;
  let service: MembersService;

  beforeEach(() => {
    prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => ({ id: 'u1', ...data })),
        update: jest.fn(async ({ data }) => ({
          id: 'u1',
          email: 'ana@correo.cl',
          password: 'hash',
          ...data,
        })),
      },
    };
    auth = {
      create: jest.fn().mockResolvedValue('tok'),
      validity: jest.fn(() => '7 días'),
    };
    email = { sendJoinWelcomeEmail: jest.fn().mockResolvedValue(true) };
    service = new MembersService(prisma, auth, email);
  });

  it('crea usuario MEMBER sin validar con su ficha y consentimiento', async () => {
    const out = await service.join(dto());

    const { data } = prisma.users.create.mock.calls[0][0];
    expect(data).toMatchObject({
      email: 'ana@correo.cl',
      userRoles: 'MEMBER',
      emailVerified: false,
    });
    expect(data.password).toMatch(/^\$2[aby]\$/); // hash bcrypt, nunca en claro
    expect(data.member.create).toMatchObject({
      experience: 'BEGINNER',
      marketingConsent: true,
      birthDate: new Date('1995-04-21T00:00:00.000Z'),
    });
    expect(data.member.create.marketingConsentAt).toBeInstanceOf(Date);
    expect(email.sendJoinWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ana@correo.cl', verifyToken: 'tok' }),
    );
    expect(out.whatsappUrl).toMatch(/^https:\/\/chat\.whatsapp\.com\//);
    expect(out.emailSent).toBe(true);
  });

  it('informa si el correo no pudo enviarse, sin deshacer el registro', async () => {
    email.sendJoinWelcomeEmail.mockResolvedValue(false);
    const out = await service.join(dto());
    expect(prisma.users.create).toHaveBeenCalled();
    expect(out.emailSent).toBe(false);
  });

  it('reenvía el correo y actualiza datos si ya se inscribió sin validar', async () => {
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      emailVerified: false,
      userRoles: 'MEMBER',
    });
    await service.join(dto({ name: 'Ana María' }));
    expect(prisma.users.create).not.toHaveBeenCalled();
    expect(prisma.users.update.mock.calls[0][0].data.name).toBe('Ana María');
    expect(email.sendJoinWelcomeEmail).toHaveBeenCalled();
  });

  it('rechaza un correo con cuenta ya validada', async () => {
    prisma.users.findUnique.mockResolvedValue({
      id: 'u1',
      emailVerified: true,
      userRoles: 'MEMBER',
    });
    await expect(service.join(dto())).rejects.toBeInstanceOf(ConflictException);
    expect(email.sendJoinWelcomeEmail).not.toHaveBeenCalled();
  });

  it('nunca toca una cuenta del equipo aunque no esté validada', async () => {
    prisma.users.findUnique.mockResolvedValue({
      id: 'a1',
      emailVerified: false,
      userRoles: 'ADMIN',
    });
    await expect(service.join(dto())).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(auth.create).not.toHaveBeenCalled();
  });

  it.each(['2030-01-01', '1850-01-01', '2024-01-01'])(
    'rechaza fechas de nacimiento imposibles (%s)',
    async (birthDate) => {
      await expect(service.join(dto({ birthDate }))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('con el campo trampa relleno responde éxito sin guardar ni enviar', async () => {
    const out = await service.join(dto({ website: 'http://spam' }));
    expect(prisma.users.findUnique).not.toHaveBeenCalled();
    expect(email.sendJoinWelcomeEmail).not.toHaveBeenCalled();
    expect(out.emailSent).toBe(true);
  });
});
