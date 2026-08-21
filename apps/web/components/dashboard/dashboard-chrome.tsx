'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppShell,
  BarChartIcon,
  CalendarIcon,
  ChatIcon,
  GlobeIcon,
  GridIcon,
  MoneyIcon,
  PercentIcon,
  PlusIcon,
  ReceiptIcon,
  ScissorsIcon,
  SettingsIcon,
  SparkleIcon,
  StarIcon,
  TeamIcon,
  UsersIcon,
  useEstablishmentAuth,
  type AppShellNavItem,
} from '@barbervp/ui';
import { navForRole } from '@/lib/dashboard/nav';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import { DashboardGuard } from './dashboard-guard';
import { ImpersonationBanner } from './impersonation-banner';
import { AccountMenu } from './topbar/account-menu';
import { GlobalSearch } from './topbar/global-search';
import { NotificationBell } from './topbar/notification-bell';
import { PlanFooter } from './topbar/plan-footer';
import { UnitSelector } from './topbar/unit-selector';

const ICONS: Record<string, ReactNode> = {
  dashboard: <GridIcon size={19} />,
  agenda: <CalendarIcon size={19} />,
  clientes: <UsersIcon size={19} />,
  comandas: <ReceiptIcon size={19} />,
  financeiro: <MoneyIcon size={19} />,
  comissoes: <PercentIcon size={19} />,
  fidelidade: <StarIcon size={19} />,
  whatsapp: <ChatIcon size={19} />,
  'assistente-ia': <SparkleIcon size={19} />,
  relatorios: <BarChartIcon size={19} />,
  'servicos-produtos': <ScissorsIcon size={19} />,
  equipe: <TeamIcon size={19} />,
  'minha-pagina': <GlobeIcon size={19} />,
  configuracoes: <SettingsIcon size={19} />,
};

/**
 * Feature que libera cada item do nav — o cadeado do protótipo
 * (`LOCKED_NAV_KEYS` do `Dashboard.dc.html`). O item continua clicável: quem
 * decide o 403 é o servidor, aqui o cadeado só antecipa a informação.
 */
const NAV_FEATURE: Record<string, 'comissoes' | 'fidelidadePontos'> = {
  comissoes: 'comissoes',
  fidelidade: 'fidelidadePontos',
};

export interface DashboardChromeProps {
  activeKey: string;
  children: ReactNode;
  /** Ação(ões) extras à direita da topbar, além do CTA e do menu de conta. */
  topbarActions?: ReactNode;
}

/**
 * Casca comum ao `Dashboard` e ao `DashboardFuncionario` — MESMA rota, MESMO
 * componente: o que muda por papel é só o conjunto de itens do nav
 * (`navForRole`), nunca a URL. `BARBER` que abre `/clientes` direto na URL
 * ainda toma 403 do backend — o nav some só para não oferecer o link morto.
 *
 * A topbar reproduz a do protótipo na ordem exata: seletor de unidade, selo do
 * plano, busca global, "Novo agendamento", sino e avatar. O selo do plano e o
 * cadeado dos itens vêm de `GET /dashboard/shell`, que espelha o `FeatureGuard`.
 */
export function DashboardChrome({ activeKey, children, topbarActions }: DashboardChromeProps) {
  const router = useRouter();
  const { activeMembership } = useEstablishmentAuth();
  const shellQuery = useDashboardShellQuery();
  const shell = shellQuery.data;

  const nav = useMemo<AppShellNavItem[]>(() => {
    return navForRole(activeMembership?.role).map((item) => {
      const feature = NAV_FEATURE[item.key];
      return {
        key: item.key,
        label: item.label,
        icon: ICONS[item.key],
        badge: item.key === 'assistente-ia' ? 'IA' : undefined,
        locked: !item.ready || (feature ? shell !== undefined && !shell.features[feature] : false),
        onSelect: () => router.push(item.ready ? item.href : '/app'),
      };
    });
  }, [activeMembership?.role, router, shell]);

  return (
    <DashboardGuard>
      <ImpersonationBanner />
      <AppShell
        activeKey={activeKey}
        nav={nav}
        brandName="Barber VP"
        topbarStart={
          <>
            <UnitSelector shell={shell} />
            {shell?.plan && (
              <span className="hidden h-8 shrink-0 items-center rounded-full border border-gold/35 bg-gold/[0.12] px-3 text-xs font-semibold text-gold lg:inline-flex">
                {shell.plan.name}
              </span>
            )}
            {shell && !shell.plan && (
              <span className="hidden h-8 shrink-0 items-center rounded-full border border-gold/35 bg-gold/[0.12] px-3 text-xs font-semibold text-gold lg:inline-flex">
                Teste grátis
              </span>
            )}
          </>
        }
        topbarCenter={<GlobalSearch />}
        topbarEnd={
          <>
            {topbarActions}
            <button
              type="button"
              onClick={() => router.push('/app/agenda?novo=1')}
              className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-control bg-gold px-2.5 text-sm font-semibold text-bg transition-colors hover:bg-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:h-10 sm:min-w-0 sm:px-4"
            >
              <PlusIcon size={16} strokeWidth={2.2} />
              {/* Abaixo de `sm` sobra só o `+`, como o `isNarrow` do protótipo. */}
              <span className="hidden sm:inline">Novo agendamento</span>
              <span className="sr-only sm:hidden">Novo agendamento</span>
            </button>
            <NotificationBell />
            <AccountMenu />
          </>
        }
        sidebarFooter={<PlanFooter shell={shell} loading={shellQuery.isLoading} />}
      >
        {children}
      </AppShell>
    </DashboardGuard>
  );
}
