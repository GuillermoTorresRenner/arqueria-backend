import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_KEY } from '../decorators/roles.decorator';
import { Roles } from '../roles.enum';

/// Cada usuario tiene exactamente un rol (Users.userRoles). ADMIN pasa siempre:
/// es el rol de mayor privilegio y no tiene sentido enumerarlo en cada endpoint.
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Roles[]>(ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const role: Roles | undefined = request.role;

    if (!role) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso');
    }

    if (role === Roles.ADMIN || requiredRoles.includes(role)) return true;

    throw new ForbiddenException('No tienes permisos para acceder a este recurso');
  }
}
