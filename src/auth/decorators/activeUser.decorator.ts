import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Roles } from '../roles.enum';

export interface ActiveUserData {
  userID: string;
  email: string;
  role: Roles;
  name?: string;
  surname?: string;
}

export const ActiveUser = createParamDecorator(
  (data: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: ActiveUserData = {
      userID: request.userID,
      email: request.email,
      role: request.role,
      name: request.name,
      surname: request.surname,
    };
    return data ? user[data] : user;
  },
);
