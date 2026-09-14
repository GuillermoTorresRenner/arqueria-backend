import { $Enums, Prisma } from '@prisma/client';

export class User implements Prisma.UsersCreateInput {
  id?: string;
  email: string;
  password: string;
  name?: string;
  surname?: string;
  lastConnection?: string | Date;
  refreshToken?: string;
  userRoles: $Enums.Role;
  avatar?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}
