import { Injectable } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import type { AdminMetricsResponse } from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
function nextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

@Injectable()
export class AdminMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<AdminMetricsResponse> {
    const from = monthStart();
    const to = nextMonth(from);

    const [tenantsWithPlan, canceledThisMonth, activeTenantsAtStart, newTenantsThisMonth] = await Promise.all([
      // MRR e "tenants por plano" — só tenants ATIVOS contam receita recorrente.
      this.prisma.tenant.findMany({
        where: { status: TenantStatus.ACTIVE, deletedAt: null, planId: { not: null } },
        select: { plan: { select: { name: true, priceCents: true } } },
      }),
      // `TenantSubscription.canceledAt`, não `Tenant.updatedAt` (que muda em
      // QUALQUER edição do tenant, não só no cancelamento).
      this.prisma.tenantSubscription.count({
        where: { canceledAt: { gte: from, lt: to } },
      }),
      this.prisma.tenant.count({
        where: { deletedAt: null, createdAt: { lt: from }, status: { not: TenantStatus.CANCELED } },
      }),
      this.prisma.tenant.count({ where: { deletedAt: null, createdAt: { gte: from, lt: to } } }),
    ]);

    const mrrCents = tenantsWithPlan.reduce((sum, tenant) => sum + (tenant.plan?.priceCents ?? 0), 0);

    const byPlan = new Map<string, number>();
    for (const tenant of tenantsWithPlan) {
      const name = tenant.plan?.name ?? '—';
      byPlan.set(name, (byPlan.get(name) ?? 0) + 1);
    }

    return {
      mrrCents,
      activeTenants: tenantsWithPlan.length,
      tenantsByPlan: [...byPlan.entries()].map(([planName, count]) => ({ planName, count })),
      churn: {
        period: { from: from.toISOString().slice(0, 10), to: new Date(to.getTime() - 1).toISOString().slice(0, 10) },
        canceled: canceledThisMonth,
        rate: activeTenantsAtStart > 0 ? canceledThisMonth / activeTenantsAtStart : 0,
      },
      newTenantsThisMonth,
    };
  }
}
