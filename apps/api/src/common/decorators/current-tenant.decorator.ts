import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiException } from '../errors/api.exception';
import type { AuthPrincipal, RequestContext, TenantContext } from '../types/request-context';

/**
 * Tenant resolvido pelo `TenantGuard`.
 *
 * `@CurrentTenant()` → o `TenantContext` inteiro.
 * `@CurrentTenant('id')` → só o id (o caso comum em `where: { tenantId }`).
 *
 * Lança se o tenant não foi resolvido — usar em rota `@TenantOptional()` é bug,
 * e é melhor descobrir com 403 do que com consulta cross-tenant.
 */
export const CurrentTenant = createParamDecorator(
  (field: keyof TenantContext | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const tenant = request.tenant;

    if (!tenant) {
      throw ApiException.tenantRequired();
    }

    return field ? tenant[field] : tenant;
  },
);

/** Principal autenticado (ou `undefined` em rota pública). */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthPrincipal | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestContext>();
    const principal = request.principal;

    if (!principal) {
      return undefined;
    }

    return field ? principal[field] : principal;
  },
);
