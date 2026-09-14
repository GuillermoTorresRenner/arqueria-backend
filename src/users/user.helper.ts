/**
 * Helper functions for user-related operations
 */

/**
 * Builds the full URL for a user's avatar
 * @param avatar - The relative path of the avatar (e.g., 'users_avatar/filename.webp')
 * @returns The full URL or null if no avatar
 */
export function buildUserAvatarUrl(avatar: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  // Si incluye 'users_avatar/', removerlo para evitar duplicar
  const relativePath = avatar.replace('users_avatar/', '');
  return `${process.env.USER_AVATAR_PATH}/${relativePath}`;
}
