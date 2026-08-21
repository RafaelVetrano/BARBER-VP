'use client';

import { Card, CardHeader, Skeleton, StatCard } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import { AdminShell } from '@/components/admin/admin-shell';
import { useAdminMetricsQuery } from '@/lib/admin/api/metrics';

export default function MetricasPage() {
  const metricsQuery = useAdminMetricsQuery();
  const metrics = metricsQuery.data;

  return (
    <AdminShell activeKey="metricas">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Métricas da plataforma</h1>

        {metricsQuery.isLoading || !metrics ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="MRR" value={formatBRL(metrics.mrrCents)} hint={`${metrics.activeTenants} tenants ativos`} />
              <StatCard label="Novos tenants no mês" value={String(metrics.newTenantsThisMonth)} />
              <StatCard
                label="Churn do mês"
                value={`${(metrics.churn.rate * 100).toFixed(1)}%`}
                hint={`${metrics.churn.canceled} cancelamento(s)`}
              />
              <StatCard label="Tenants ativos" value={String(metrics.activeTenants)} />
            </div>

            <Card>
              <CardHeader title="Tenants por plano" />
              <div className="mt-3 flex flex-col gap-2">
                {metrics.tenantsByPlan.map((row) => (
                  <div key={row.planName} className="flex items-center justify-between text-sm">
                    <span className="text-fg-muted">{row.planName}</span>
                    <span className="font-semibold text-fg">{row.count}</span>
                  </div>
                ))}
                {metrics.tenantsByPlan.length === 0 && <p className="text-sm text-fg-muted">Nenhum tenant ativo ainda.</p>}
              </div>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}
