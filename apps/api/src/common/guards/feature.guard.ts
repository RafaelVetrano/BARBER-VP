import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasFeature, type FeatureKey } from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../errors/api.exception';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';
import type { RequestContext } from '../types/request-context';

/**
 * Gate de feature flags do plano SaaS (`SPEC.md` → regra 4: "gates de feature
 * por plano sempre server-side"). Roda depois de `TenantGuard`/`RolesGuard`.
 *
 * `SUPER_ADMIN` atravessa (mesmo padrão do `RolesGuard`/`TenantGuard`) — é
 * quem administra os planos, não faz sentido barrá-lo pelo próprio gate.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    const feature = this.reflector.getAllAndOverride<FeatureKey>(REQUIRE_FEATURE_KEY, targets);
    if (!feature) {
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestContext>();
    if (request.principal?.isSuperAdmin) {
      return true;
    }

    const tenant = request.tenant;
    if (!tenant) {
      throw ApiException.tenantRequired();
    }

    const row = await this.prisma.tenant.findFirst({
      where: { id: tenant.id },
      select: { plan: { select: { features: true } } },
    });

    if (!hasFeature(row?.plan?.features, feature)) {
      throw ApiException.featureNotInPlan(feature);
    }

    return true;
  }
}
