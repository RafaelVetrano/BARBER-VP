import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@barbervp/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiException } from '../errors/api.exception';
import type { RequestContext } from '../types/request-context';

/**
 * RBAC por papel (`SPEC.md` → Papéis e permissões).
 * Roda depois do `TenantGuard`; sem `@Roles()` no handler, não restringe nada.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (!required || required.length === 0) {
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const principal = context.switchToHttp().getRequest<RequestContext>().principal;
    if (!principal) {
      throw ApiException.unauthenticated();
    }
    if (principal.isSuperAdmin) {
      return true;
    }
    if (!required.some((role) => principal.roles.includes(role))) {
      throw ApiException.forbidden('Seu papel não permite esta ação.');
    }

    return true;
  }
}
