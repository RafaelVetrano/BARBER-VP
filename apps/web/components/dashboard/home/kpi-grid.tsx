'use client';

import { Card, Donut, Skeleton, SkeletonGroup, StatCard, type StatDelta } from '@barbervp/ui';
import { formatBRL, type DashboardKpis } from '@barbervp/types';

/**
 * A MESMA grade do protótipo: `repeat(auto-fit, minmax(200px, 1fr))`, gap 16px.
 *
 * Auto-fit é o que reproduz o comportamento do `.dc.html` degrau a degrau — 1
 * coluna em 360/390, 3 em 768, 4 em 1024, 5 em 1440, 6 a partir de ~1500px de
 * área útil. O `min()` é a única adição: sem ele, uma tela de 360px com padding
 * teria colunas de 200px que não cabem, e a página rolaria de lado.
 */
const GRID = 'grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-4';

export function KpiGridSkeleton() {
  return (
    <SkeletonGroup label="Carregando indicadores" className={GRID}>
      {[0, 1, 2, 3, 4, 5].map((key) => (
        // A altura é a MESMA do card real (rótulo + número + delta + sparkline),
        // senão o conteúdo abaixo salta quando os dados chegam.
        <Skeleton key={key} className="h-[136px] rounded-xl" />
      ))}
    </SkeletonGroup>
  );
}

/** `null` = sem base de comparação; a linha de variação simplesmente não aparece. */
function delta(pct: number | null, goodDirection: 'up' | 'down'): StatDelta | undefined {
  if (pct === null || pct === 0) {
    return undefined;
  }
  const direction = pct > 0 ? 'up' : 'down';
  return {
    label: `${Math.abs(pct)}%`,
    direction,
    tone: direction === goodDirection ? 'positive' : 'negative',
  };
}

export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  const { appointmentsToday: appts } = kpis;

  return (
    <div className={GRID}>
      <StatCard
        label="Faturamento hoje"
        value={formatBRL(kpis.revenueTodayCents)}
        delta={
          kpis.revenueDeltaPct === null || kpis.revenueDeltaPct === 0
            ? undefined
            : {
                label: `${Math.abs(kpis.revenueDeltaPct)}% vs ontem`,
                direction: kpis.revenueDeltaPct > 0 ? 'up' : 'down',
                tone: kpis.revenueDeltaPct > 0 ? 'positive' : 'negative',
              }
        }
        sparkline={kpis.revenueSparkline}
      />

      <StatCard
        label="Agendamentos hoje"
        value={appts.total}
        hint={`${appts.confirmed} confirmados · ${appts.pending} pendentes · ${appts.done} concluídos`}
      />

      {/* Ocupação é o único KPI com layout horizontal — rosca à esquerda,
          rótulo à direita, sem sparkline (protótipo, linhas 196–206). */}
      <Card className="flex-row items-center gap-3.5">
        <Donut
          size={56}
          thickness={8}
          slices={[{ pct: kpis.occupancyPct, color: '#D4A84C', label: 'Ocupado' }]}
          label={`Ocupação da agenda hoje: ${kpis.occupancyPct}%`}
        >
          <span className="font-display text-[13px] font-bold text-fg">{kpis.occupancyPct}%</span>
        </Donut>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-medium text-fg-muted">Ocupação da agenda</span>
          <span className="text-xs text-fg-subtle">hoje</span>
        </div>
      </Card>

      <StatCard
        label="Ticket médio (mês)"
        value={formatBRL(kpis.avgTicketCents)}
        delta={delta(kpis.avgTicketDeltaPct, 'up')}
        sparkline={kpis.avgTicketSparkline}
      />

      <StatCard
        label="Novos clientes (mês)"
        value={kpis.newClients}
        delta={delta(kpis.newClientsDeltaPct, 'up')}
        sparkline={kpis.newClientsSparkline}
      />

      {/* Faltas caindo é boa notícia: a seta desce e a cor é verde. */}
      <StatCard
        label="Faltas no mês"
        value={kpis.noShows}
        delta={delta(kpis.noShowsDeltaPct, 'down')}
        sparkline={kpis.noShowsSparkline}
        sparklineTone="success"
      />
    </div>
  );
}
