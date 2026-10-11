import { buildUserAvatarUrl } from './user.helper';

describe('buildUserAvatarUrl', () => {
  it('sin avatar devuelve null', () => {
    expect(buildUserAvatarUrl(null)).toBeNull();
  });

  it('arma la ruta pública con o sin la carpeta guardada', () => {
    expect(buildUserAvatarUrl('user_1.webp')).toBe(
      '/public/users_avatar/user_1.webp',
    );
    expect(buildUserAvatarUrl('users_avatar/user_1.webp')).toBe(
      '/public/users_avatar/user_1.webp',
    );
  });

  it('versiona la URL para que el navegador no muestre la foto anterior', () => {
    const updatedAt = new Date('2026-10-11T20:00:00.000Z');
    expect(buildUserAvatarUrl('user_1.webp', updatedAt)).toBe(
      `/public/users_avatar/user_1.webp?v=${updatedAt.getTime()}`,
    );
  });

  it('deja pasar URLs absolutas', () => {
    expect(buildUserAvatarUrl('https://cdn.x/a.png')).toBe(
      'https://cdn.x/a.png',
    );
  });
});
