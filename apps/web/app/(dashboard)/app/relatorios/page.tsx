'use client';

import { useMemo, useState } from 'react';
import { useEstablishmentAuth, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { ReportPeriodQuery } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { UpgradeModal } from '@/components/dashboard/upgrade-modal';
import { FinanceStat, StatGrid } from '@/components/dashboard/blocks';
import { ReportCard } from '@/components/dashboard/reports/report-card';
import { ReportToolbar, type ReportFilters } from '@/components/dashboard/reports/report-toolbar';
import { RevenueChart } from '@/components/dashboard/reports/revenue-chart';
import { BarList } from '@/components/dashboard/reports/bar-list';
import { PaymentDonut } from '@/components/dashboard/reports/payment-donut';
import { ReturnRateCard } from '@/components/dashboard/reports/return-rate-card';
import { PeakHeatmap } from '@/components/dashboard/reports/peak-heatmap';
import { NoShowChart } from '@/components/dashboard/reports/no-show-chart';
import { TicketTable } from '@/components/dashboard/reports/ticket-table';
import {
  EXPORT_BULLETS,
  LOCKED_BULLETS,
  LOCKED_MIN_PLAN,
  daysAgoInput,
  periodRangeLabel,
  todayInput,
} from '@/components/dashboard/reports/reports-shared';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import {
  useReportExportMutation,
  useReportsAdvancedQuery,
  useReportsSummaryQuery,
} from '@/lib/dashboard/api/reports';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import { useBarbersQuery } from '@/lib/dashboard/api/team';

/**
 * Aba **Relatórios** (`Dashboard.dc.html` l.1229–1496) e, para o papel
 * `BARBER`, a versão restrita do `DashboardFuncionario.dc.html` (l.667–775).
 *
 * O cadeado é POR BLOCO: cinco dos oito blocos ficam embaçados fora do plano
 * Profissional, os outros três continuam servindo. Quem decide é o servidor —
 * `/reports/advanced` responde 403 e a página trata esse 403 como "trancado",
 * não como erro.
 */
export default function RelatoriosPage() {
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();
  const isBarberRole = activeMembership?.role === 'BARBER';

  const [filters, setFilters] = useState<ReportFilters>({
    period: '30d',
    from: daysAgoInput(29),
    to: todayInput(),
    barberIds: [],
    unitId: null,
  });
  const [upsell, setUpsell] = useState<'blocks' | 'export' | null>(null);

  const query: ReportPeriodQuery = useMemo(
    () => ({
      period: filters.period,
      ...(filters.period === 'custom' ? { from: filters.from, to: filters.to } : {}),
      ...(filters.barberIds.length > 0 ? { barberIds: filters.barberIds } : {}),
      ...(filters.unitId ? { unitId: filters.unitId } : {}),
    }),
    [filters],
  );

  const shellQuery = useDashboardShellQuery();
  // `BARBER` não escolhe barbeiro (o servidor força o recorte) — pedir a
  // equipe só renderia um 403 no console.
  const barbersQuery = useBarbersQuery({ enabled: !isBarberRole });
  const summaryQuery = useReportsSummaryQuery(query);
  const advancedQuery = useReportsAdvancedQuery(query);
  const exportMutation = useReportExportMutation();

  const summary = summaryQuery.data;
  const advanced = advancedQuery.data;
  const locked = isFeatureGateError(advancedQuery.error);
  const advancedFailed = advancedQuery.isError && !locked;

  const period = summary?.period;
  const rangeLabel = period ? periodRangeLabel(period.from, period.to) : '—';

  const onLockedClick = () => setUpsell('blocks');
  const handleExport = (format: 'pdf' | 'csv') => {
    if (locked) {
      setUpsell('export');
      return;
    }
    exportMutation.mutate(
      { format, query },
      {
        onSuccess: (filename) => toast({ message: `Relatório exportado: ${filename}`, tone: 'success' }),
        onError: () =>
          toast({ message: 'Não foi possível exportar o relatório.', tone: 'danger' }),
      },
    );
  };

  const summaryLoading = summaryQuery.isPending;
  const advancedLoading = advancedQuery.isPending && !locked;
  /** Bloco travado desenha o conteúdo de exemplo por trás do véu — sem dado, uma grade vazia. */
  const advancedReady = !locked && !advancedFailed && advanced !== undefined;

  return (
    <DashboardChrome activeKey="relatorios">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-bold text-fg">Relatórios</h1>
          <p className="text-sm text-fg-muted">
            {rangeLabel}
            {summary?.scoped ? ' · seus atendimentos' : ''}
          </p>
        </div>

        <ReportToolbar
          filters={filters}
          onChange={setFilters}
          barbers={isBarberRole ? [] : (barbersQuery.data ?? [])}
          units={shellQuery.data?.units ?? []}
          exportLocked={locked}
          exporting={exportMutation.isPending ? (exportMutation.variables?.format ?? null) : null}
          onExport={handleExport}
        />

        {/* Os 3 KPIs do `DashboardFuncionario` — o painel do dono não os tem. */}
        {isBarberRole && (
          <StatGrid min={200}>
            <FinanceStat
              label="Minha produção no período"
              value={formatBRL(summary?.revenueCents ?? 0)}
            />
            <FinanceStat label="Atendimentos" value={String(summary?.orders ?? 0)} />
            <FinanceStat
              label="Ticket médio"
              value={formatBRL(summary?.averageTicketCents ?? 0)}
            />
          </StatGrid>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <ReportCard
            title={isBarberRole ? 'Minha produção por período' : 'Faturamento por período'}
            span={2}
            loading={summaryLoading}
            error={summaryQuery.isError}
            onRetry={() => void summaryQuery.refetch()}
            isEmpty={(summary?.revenueSeries.length ?? 0) < 2}
            empty="Sem faturamento no período."
            skeletonHeight={224}
            aside={
              summary && (
                <div className="text-right">
                  <p className="font-display text-[26px] font-bold leading-none text-fg">
                    {formatBRL(summary.revenueCents)}
                  </p>
                  <p
                    className={`mt-1.5 text-xs font-semibold ${
                      summary.deltaPct === null
                        ? 'text-fg-muted'
                        : summary.deltaPct >= 0
                          ? 'text-success'
                          : 'text-danger'
                    }`}
                  >
                    {summary.deltaPct === null
                      ? 'sem período anterior para comparar'
                      : `${summary.deltaPct >= 0 ? '+' : ''}${summary.deltaPct}% vs. período anterior`}
                  </p>
                </div>
              )
            }
          >
            {summary && <RevenueChart points={summary.revenueSeries} />}
          </ReportCard>

          {!isBarberRole && (
            <ReportCard
              title="Faturamento por barbeiro"
              loading={summaryLoading}
              error={summaryQuery.isError}
              onRetry={() => void summaryQuery.refetch()}
              isEmpty={(summary?.revenueByBarber.length ?? 0) === 0}
              skeletonHeight={168}
            >
              {summary && (
                <BarList
                  rows={summary.revenueByBarber.map((row) => ({
                    id: row.barberId,
                    name: row.barberName,
                    valueCents: row.revenueCents,
                  }))}
                />
              )}
            </ReportCard>
          )}

          <ReportCard
            title={isBarberRole ? 'Meus serviços realizados' : 'Faturamento por serviço'}
            locked={locked}
            onLockedClick={onLockedClick}
            loading={advancedLoading}
            error={advancedFailed}
            onRetry={() => void advancedQuery.refetch()}
            isEmpty={advancedReady && advanced.revenueByService.length === 0}
            skeletonHeight={220}
          >
            {advancedReady && (
              <BarList
                rows={advanced.revenueByService.map((row) => ({
                  id: row.serviceId,
                  name: row.serviceName,
                  valueCents: row.revenueCents,
                }))}
              />
            )}
          </ReportCard>

          <ReportCard
            title={
              isBarberRole
                ? 'Forma de pagamento dos meus atendimentos'
                : 'Faturamento por forma de pagamento'
            }
            loading={summaryLoading}
            error={summaryQuery.isError}
            onRetry={() => void summaryQuery.refetch()}
            isEmpty={(summary?.paymentDistribution.length ?? 0) === 0}
            empty="Nenhum pagamento registrado no período."
            skeletonHeight={148}
          >
            {summary && <PaymentDonut entries={summary.paymentDistribution} />}
          </ReportCard>

          {!isBarberRole && (
            <>
              <ReportCard
                title="Taxa de retorno"
                locked={locked}
                onLockedClick={onLockedClick}
                loading={advancedLoading}
                error={advancedFailed}
                onRetry={() => void advancedQuery.refetch()}
                isEmpty={advancedReady && advanced.returnRate.clients === 0}
                empty="Nenhum cliente com visita registrada ainda."
                skeletonHeight={216}
              >
                {advancedReady && <ReturnRateCard returnRate={advanced.returnRate} />}
              </ReportCard>

              <ReportCard
                title="Heatmap de horários de pico"
                hint={advancedReady && advanced.heatmap.peakLabel ? `Pico: ${advanced.heatmap.peakLabel}` : undefined}
                span={3}
                locked={locked}
                onLockedClick={onLockedClick}
                loading={advancedLoading}
                error={advancedFailed}
                onRetry={() => void advancedQuery.refetch()}
                isEmpty={advancedReady && advanced.heatmap.peakLabel === null}
                empty="Nenhum atendimento no período para desenhar o mapa."
                skeletonHeight={220}
              >
                {advancedReady && <PeakHeatmap heatmap={advanced.heatmap} />}
              </ReportCard>

              <ReportCard
                title="Taxa de faltas por mês"
                span={2}
                locked={locked}
                onLockedClick={onLockedClick}
                loading={advancedLoading}
                error={advancedFailed}
                onRetry={() => void advancedQuery.refetch()}
                isEmpty={
                  advancedReady &&
                  advanced.noShowTrend.points.every((point) => point.appointments === 0)
                }
                empty="Sem atendimentos nos últimos 8 meses."
                skeletonHeight={192}
              >
                {advancedReady && <NoShowChart trend={advanced.noShowTrend} />}
              </ReportCard>

              <ReportCard
                title="Ticket médio por barbeiro"
                locked={locked}
                onLockedClick={onLockedClick}
                loading={advancedLoading}
                error={advancedFailed}
                onRetry={() => void advancedQuery.refetch()}
                isEmpty={advancedReady && advanced.ticketByBarber.length === 0}
                skeletonHeight={192}
              >
                {advancedReady && <TicketTable rows={advanced.ticketByBarber} />}
              </ReportCard>
            </>
          )}
        </div>
      </div>

      <UpgradeModal
        open={upsell !== null}
        onClose={() => setUpsell(null)}
        minPlanLabel={LOCKED_MIN_PLAN}
        description={
          upsell === 'export'
            ? 'Exportar o relatório em PDF ou CSV faz parte dos relatórios avançados.'
            : 'Os relatórios avançados abrem os blocos que estão embaçados nesta tela.'
        }
        benefits={upsell === 'export' ? EXPORT_BULLETS : LOCKED_BULLETS}
      />
    </DashboardChrome>
  );
}
