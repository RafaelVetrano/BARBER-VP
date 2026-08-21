'use client';

import { useState } from 'react';
import { Button, Card, Skeleton, SkeletonGroup } from '@barbervp/ui';
import type { DashboardPeriod } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { AlertsStrip } from '@/components/dashboard/home/alerts-strip';
import { BarberRankingCard } from '@/components/dashboard/home/barber-ranking-card';
import { KpiGrid, KpiGridSkeleton } from '@/components/dashboard/home/kpi-grid';
import { RevenueChartCard } from '@/components/dashboard/home/revenue-chart-card';
import { TopServicesCard } from '@/components/dashboard/home/top-services-card';
import { UpcomingCard } from '@/components/dashboard/home/upcoming-card';
import { useDashboardOverviewQuery } from '@/lib/dashboard/api/dashboard';

/**
 * Home do painel — mesmo componente serve `Dashboard` e `DashboardFuncionario`:
 * `GET /dashboard/overview` já devolve só os números do próprio barbeiro quando
 * o papel é `BARBER`, então o recorte nasce correto sem nenhum `if (role)` aqui.
 *
 * Ordem dos blocos, idêntica a `Dashboard.dc.html` (linhas 178–392):
 * KPIs → gráfico + serviços (2fr 1fr) → ranking + próximos (1fr 1fr) → alertas.
 */
export default function DashboardHomePage() {
  const [period, setPeriod] = useState<DashboardPeriod>('mes');
  const query = useDashboardOverviewQuery(period);
  const data = query.data;

  return (
    <DashboardChrome activeKey="dashboard">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
        {query.isError && !data ? (
          <ErrorCard onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : !data ? (
          <LoadingSkeleton />
        ) : (
          <>
            <KpiGrid kpis={data.kpis} />

            {/* 2fr 1fr no desktop; empilhado abaixo de `lg`, onde 1fr do lado
                direito ficaria estreito demais para a legenda dos serviços. */}
            <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
              <RevenueChartCard chart={data.revenueChart} period={period} onPeriodChange={setPeriod} />
              <TopServicesCard services={data.topServices} />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <BarberRankingCard ranking={data.barberRanking} scope={data.scope} />
              <UpcomingCard appointments={data.upcomingAppointments} />
            </div>

            <AlertsStrip alerts={data.alerts} />
          </>
        )}
      </div>
    </DashboardChrome>
  );
}

/** As alturas espelham as dos blocos reais — a página não pula ao carregar. */
function LoadingSkeleton() {
  return (
    <>
      <KpiGridSkeleton />
      <SkeletonGroup label="Carregando o dashboard" className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <Skeleton className="h-[336px] rounded-xl" />
          <Skeleton className="h-[336px] rounded-xl" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-[264px] rounded-xl" />
          <Skeleton className="h-[264px] rounded-xl" />
        </div>
      </SkeletonGroup>
    </>
  );
}

/**
 * Erro é um card, não uma página em branco: a casca (nav, busca, sino) continua
 * utilizável enquanto só o miolo falhou.
 */
function ErrorCard({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Card className="items-center gap-3 p-8 text-center">
      <p className="text-[15px] text-fg">Não foi possível carregar o dashboard.</p>
      <p className="text-[13px] text-fg-muted">
        Os dados continuam salvos — foi só esta consulta que falhou.
      </p>
      <Button variant="outline" onClick={onRetry} loading={retrying}>
        Tentar de novo
      </Button>
    </Card>
  );
}
