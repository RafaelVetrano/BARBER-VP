import { Injectable } from '@nestjs/common';
import {
  FEATURE_KEYS,
  Role,
  TRIAL_PERIOD_DAYS,
  TenantStatus,
  hasFeature,
  type DashboardShellResponse,
  type PlanFeatures,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import type { AuthPrincipal } from '../common/types/request-context';

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Casca do painel — o que a topbar e o rodapé da sidebar mostram em TODAS as
 * telas: nome do plano, features liberadas, dias de teste, unidades.
 *
 * Existe separado do `overview` porque a casca é comum às 14 telas e o
 * `overview` é caro: quem abre `/app/agenda` precisa do selo do plano, não das
 * agregações do dashboard.
 *
 * `features` é montado com o MESMO `hasFeature` do `FeatureGuard`: sem plano
 * contratado, tudo `false`. Espelhar exatamente a decisão do servidor é o que
 * impede o front oferecer botão que já sai em 403.
 */
@Injectable()
export class DashboardShellService {
  constructor(private readonly prisma: PrismaService) {}

  async shell(tenantId: string, principal: AuthPrincipal): Promise<DashboardShellResponse> {
    const [tenant, maxActiveTier] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          timezone: true,
          createdAt: true,
          plan: { select: { code: true, name: true, priceCents: true, tier: true, features: true } },
        },
      }),
      this.prisma.saasPlan.aggregate({ where: { active: true }, _max: { tier: true } }),
    ]);

    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }

    const features = FEATURE_KEYS.reduce((acc, key) => {
      acc[key] = hasFeature(tenant.plan?.features, key);
      return acc;
    }, {} as PlanFeatures);

    // Unidade é recurso do Avançado. Sem a feature a lista sai vazia: o
    // seletor mostra só o nome da barbearia e "+ Nova unidade" com cadeado,
    // como o protótipo faz com `multiUnidadesLocked`.
    const units = features.multiUnidades
      ? await this.prisma.unit.findMany({
          where: { tenantId, deletedAt: null, active: true },
          select: { id: true, name: true, isDefault: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        })
      : [];

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        timezone: tenant.timezone,
      },
      role: roleOf(principal),
      plan: tenant.plan
        ? {
            code: tenant.plan.code,
            name: tenant.plan.name,
            priceCents: tenant.plan.priceCents,
            tier: tenant.plan.tier,
            isMaxTier: tenant.plan.tier >= (maxActiveTier._max.tier ?? tenant.plan.tier),
          }
        : null,
      features,
      trial: tenant.status === TenantStatus.TRIAL ? trialOf(tenant.createdAt) : null,
      units,
    };
  }
}

/**
 * Sem coluna `trialEndsAt` no schema: o teste conta a partir de
 * `Tenant.createdAt`, que é quando o registro criou o tenant em `TRIAL`.
 */
function trialOf(createdAt: Date): { daysLeft: number; progressPct: number } {
  const elapsedDays = Math.floor((Date.now() - createdAt.getTime()) / DAY_MS);
  const daysLeft = Math.max(0, TRIAL_PERIOD_DAYS - elapsedDays);
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round(((TRIAL_PERIOD_DAYS - daysLeft) / TRIAL_PERIOD_DAYS) * 100)),
  );
  return { daysLeft, progressPct };
}

/** Papel efetivo NESTE tenant — o mais alto que o principal carrega. */
function roleOf(principal: AuthPrincipal): Role {
  if (principal.roles.includes(Role.OWNER)) return Role.OWNER;
  if (principal.roles.includes(Role.MANAGER)) return Role.MANAGER;
  if (principal.roles.includes(Role.BARBER)) return Role.BARBER;
  return principal.isSuperAdmin ? Role.OWNER : Role.BARBER;
}
