'use client';

import { useState } from 'react';
import { Card, CardHeader, EmptyState, Skeleton, StatCard } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import { useReportsAdvancedQuery, useReportsSummaryQuery } from '@/lib/dashboard/api/reports';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

const METHOD_LABEL: Record<string, string> = { PIX: 'Pix', CASH: 'Dinheiro', DEBIT: 'Débito', CREDIT: 'Crédito' };

function Bar({ label, value, max, tone = 'gold' }: { label: string; value: number; max: number; tone?: 'gold' | 'info' }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-semibold text-fg">{formatBRL(value)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone === 'gold' ? 'bg-gold' : 'bg-info'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RelatoriosPage() {
  const [from] = useState(daysAgo(30));
  const [to] = useState(daysAgo(0));

  const summaryQuery = useReportsSummaryQuery({ from, to });
  const advancedQuery = useReportsAdvancedQuery({ from, to });

  const summary = summaryQuery.data;
  const advanced = advancedQuery.data;
  const maxBarberRevenue = Math.max(...(advanced?.revenueByBarber.map((b) => b.revenueCents) ?? [0]), 1);
  const maxServiceRevenue = Math.max(...(advanced?.revenueByService.map((s) => s.revenueCents) ?? [0]), 1);
  const maxReturnClients = Math.max(...(advanced?.returnRate.map((r) => r.clients) ?? [0]), 1);

  return (
    <DashboardChrome activeKey="relatorios">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-bold text-fg">Relatórios</h1>
          <p className="text-sm text-fg-muted">Últimos 30 dias ({new Date(from).toLocaleDateString('pt-BR')} – {new Date(to).toLocaleDateString('pt-BR')})</p>
        </div>

        {summaryQuery.isLoading ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Faturamento" value={formatBRL(summary?.revenueCents ?? 0)} hint={`${summary?.orders ?? 0} comandas fechadas`} />
            <StatCard label="Ticket médio" value={formatBRL(summary?.averageTicketCents ?? 0)} />
            <StatCard
              label="Forma de pagamento principal"
              value={summary?.paymentDistribution[0] ? METHOD_LABEL[summary.paymentDistribution[0].method] ?? summary.paymentDistribution[0].method : '—'}
              hint={summary?.paymentDistribution[0] ? formatBRL(summary.paymentDistribution[0].amountCents) : undefined}
            />
          </div>
        )}

        {summary && summary.paymentDistribution.length > 0 && (
          <Card>
            <CardHeader title="Distribuição por forma de pagamento" />
            <div className="mt-3 flex flex-col gap-2">
              {summary.paymentDistribution.map((entry) => (
                <Bar key={entry.method} label={METHOD_LABEL[entry.method] ?? entry.method} value={entry.amountCents} max={summary.revenueCents} tone="info" />
              ))}
            </div>
          </Card>
        )}

        {isFeatureGateError(advancedQuery.error) ? (
          <FeatureLocked
            title="Relatórios avançados"
            description="Faturamento por barbeiro e serviço, ocupação da agenda, no-show e taxa de retorno de clientes — disponível a partir do plano Profissional."
            benefits={['Compare o desempenho de cada barbeiro', 'Veja quais serviços mais faturam', 'Identifique clientes que estão sumindo']}
            minPlanLabel="Profissional"
          />
        ) : advancedQuery.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : advanced ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <StatCard label="Ocupação" value={`${Math.round(advanced.occupancyRate * 100)}%`} />
              <StatCard label="Taxa de no-show" value={`${Math.round(advanced.noShowRate * 100)}%`} />
            </div>

            <Card>
              <CardHeader title="Faturamento por barbeiro" />
              <div className="mt-3 flex flex-col gap-2">
                {advanced.revenueByBarber.length === 0 ? (
                  <EmptyState message="Sem dados no período." />
                ) : (
                  advanced.revenueByBarber.map((row) => (
                    <Bar key={row.barberId} label={row.barberName} value={row.revenueCents} max={maxBarberRevenue} />
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Faturamento por serviço" />
              <div className="mt-3 flex flex-col gap-2">
                {advanced.revenueByService.length === 0 ? (
                  <EmptyState message="Sem dados no período." />
                ) : (
                  advanced.revenueByService.map((row) => (
                    <Bar key={row.serviceId} label={row.serviceName} value={row.revenueCents} max={maxServiceRevenue} tone="info" />
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Taxa de retorno — dias sem visita" />
              <div className="mt-3 flex flex-col gap-2">
                {advanced.returnRate.map((bucket) => (
                  <div key={bucket.label} className="flex items-center justify-between text-sm">
                    <span className="text-fg-muted">{bucket.label}</span>
                    <div className="mx-3 h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(4, (bucket.clients / maxReturnClients) * 100)}%` }} />
                    </div>
                    <span className="font-semibold text-fg">{bucket.clients}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </DashboardChrome>
  );
}
