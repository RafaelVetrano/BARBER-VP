'use client';

import { AreaChart, Card, EmptyState, Segmented } from '@barbervp/ui';
import { formatBRL, type DashboardPeriod, type DashboardRevenueChart } from '@barbervp/types';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
];

const TITLE: Record<DashboardPeriod, string> = {
  dia: 'Faturamento — hoje',
  semana: 'Faturamento — últimos 7 dias',
  mes: 'Faturamento — últimos 30 dias',
};

export interface RevenueChartCardProps {
  chart: DashboardRevenueChart;
  period: DashboardPeriod;
  onPeriodChange: (period: DashboardPeriod) => void;
}

/**
 * Card "Faturamento — últimos 30 dias" (`Dashboard.dc.html`, linhas 234–266).
 *
 * O título acompanha o recorte: no protótipo ele fica cravado em "últimos 30
 * dias" mesmo com o toggle em Dia, o que descrevia errado o que estava na tela.
 */
export function RevenueChartCard({ chart, period, onPeriodChange }: RevenueChartCardProps) {
  const hasRevenue = chart.points.some((point) => point.valueCents > 0);

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold text-fg">{TITLE[period]}</h2>
        <Segmented
          label="Recorte do gráfico de faturamento"
          options={PERIOD_OPTIONS}
          value={period}
          onChange={onPeriodChange}
        />
      </div>

      {chart.points.length < 2 || !hasRevenue ? (
        <EmptyState
          className="py-10"
          message="Sem faturamento registrado ainda"
          description="Feche a primeira comanda e o gráfico começa a se desenhar aqui."
        />
      ) : (
        <AreaChart
          label={`Faturamento por ${period === 'dia' ? 'hora' : 'dia'}`}
          points={chart.points.map((point) => ({ label: point.label, value: point.valueCents }))}
          goal={chart.goalPerPointCents}
          goalLabel={
            chart.goalCents === null ? undefined : `Meta: ${formatBRL(chart.goalCents)}/mês`
          }
          formatValue={formatBRL}
        />
      )}
    </Card>
  );
}
