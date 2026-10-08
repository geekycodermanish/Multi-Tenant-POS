import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../database/entities';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('Insufficient role');
    }

    if (
      user.role === UserRole.PLATFORM_ADMIN &&
      !requiredRoles?.includes(UserRole.PLATFORM_ADMIN)
    ) {
      throw new ForbiddenException('Insufficient role');
    }

    if (
      requiredRoles?.length &&
      !requiredRoles.includes(user.role)
    ) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
