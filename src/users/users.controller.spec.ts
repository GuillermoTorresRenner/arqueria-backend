import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { Roles } from '../auth/roles.enum';

describe('UsersController.update', () => {
  const service = { updateUserData: jest.fn().mockResolvedValue({ ok: true }) };
  const controller = new UsersController(service as any);
  const admin = { userID: 'a1', email: 'a@x.cl', role: Roles.ADMIN };

  beforeEach(() => service.updateUserData.mockClear());

  it('impide que un admin se quite su propio rol', () => {
    expect(() => controller.update('a1', { role: Roles.JUDGE }, admin)).toThrow(
      BadRequestException,
    );
    expect(service.updateUserData).not.toHaveBeenCalled();
  });

  it('impide que un admin se desactive a sí mismo', () => {
    expect(() => controller.update('a1', { isActive: false }, admin)).toThrow(
      BadRequestException,
    );
  });

  it('deja que un admin edite sus otros datos', async () => {
    await controller.update('a1', { name: 'Guille', role: Roles.ADMIN }, admin);
    expect(service.updateUserData).toHaveBeenCalled();
  });

  it('deja que un admin cambie el rol de otro usuario', async () => {
    await controller.update('j1', { role: Roles.ADMIN }, admin);
    expect(service.updateUserData).toHaveBeenCalledWith(
      'j1',
      { role: Roles.ADMIN },
      undefined,
    );
  });
});
