'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  AppShell,
  Badge,
  BarChartIcon,
  CalendarIcon,
  ChatIcon,
  GlobeIcon,
  GridIcon,
  Menu,
  MoneyIcon,
  PercentIcon,
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
import type { Role } from '@barbervp/types';
import { navForRole } from '../lib/nav';
import { DashboardGuard } from './dashboard-guard';

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

const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dono',
  MANAGER: 'Gerente',
  BARBER: 'Barbeiro',
  CLIENT: 'Cliente',
  SUPER_ADMIN: 'Super admin',
};

export interface DashboardChromeProps {
  activeKey: string;
  children: ReactNode;
  /** Ação(ões) à direita da topbar, além do menu de conta (ex.: "Novo agendamento"). */
  topbarActions?: ReactNode;
}

/**
 * Casca comum ao `Dashboard` e ao `DashboardFuncionario` — MESMA rota, MESMO
 * componente: o que muda por papel é só o conjunto de itens do nav
 * (`navForRole`), nunca a URL. `BARBER` que abre `/clientes` direto na URL
 * ainda toma 403 do backend — o nav some só para não oferecer o link morto.
 */
export function DashboardChrome({ activeKey, children, topbarActions }: DashboardChromeProps) {
  const router = useRouter();
  const { user, activeMembership, logout } = useEstablishmentAuth();

  const nav = useMemo<AppShellNavItem[]>(() => {
    return navForRole(activeMembership?.role).map((item) => ({
      key: item.key,
      label: item.label,
      icon: ICONS[item.key],
      locked: !item.ready,
      onSelect: () => router.push(item.ready ? item.href : '/'),
    }));
  }, [activeMembership?.role, router]);

  return (
    <DashboardGuard>
      <AppShell
        activeKey={activeKey}
        nav={nav}
        brandName={activeMembership?.tenantName ?? 'Barber VP'}
        topbarStart={
          activeMembership ? (
            <Badge tone={activeMembership.role === 'OWNER' ? 'gold' : 'neutral'}>
              {ROLE_LABEL[activeMembership.role]}
            </Badge>
          ) : undefined
        }
        topbarEnd={
          <>
            {topbarActions}
            <Menu
              label="Sua conta"
              align="end"
              trigger={<Avatar name={user?.name ?? '?'} size="md" />}
              items={[
                { label: user?.email ?? '', onSelect: () => undefined, disabled: true },
                {
                  label: 'Sair',
                  destructive: true,
                  onSelect: () => void logout().then(() => router.replace('/')),
                },
              ]}
            />
          </>
        }
        sidebarFooter={
          <div className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
            <p className="truncate font-semibold text-fg">{user?.name}</p>
            <p className="truncate">{activeMembership?.tenantName}</p>
          </div>
        }
      >
        {children}
      </AppShell>
    </DashboardGuard>
  );
}
