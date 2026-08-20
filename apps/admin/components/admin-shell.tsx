'use client';

import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  AppShell,
  BarChartIcon,
  ChatIcon,
  GridIcon,
  Menu,
  MoneyIcon,
  ReceiptIcon,
  UsersIcon,
  useEstablishmentAuth,
  type AppShellNavItem,
} from '@barbervp/ui';
import { AdminGuard } from './admin-guard';
import { LOGIN_URL } from '../lib/urls';

const NAV: Array<{ key: string; label: string; href: string; icon: ReactNode }> = [
  { key: 'tenants', label: 'Tenants', href: '/tenants', icon: <UsersIcon size={19} /> },
  { key: 'planos', label: 'Planos', href: '/planos', icon: <ReceiptIcon size={19} /> },
  { key: 'billing', label: 'Billing', href: '/billing', icon: <MoneyIcon size={19} /> },
  { key: 'metricas', label: 'Métricas', href: '/metricas', icon: <BarChartIcon size={19} /> },
  // Fase 09 — operação da plataforma.
  { key: 'filas', label: 'Filas', href: '/filas', icon: <GridIcon size={19} /> },
  { key: 'mensagens', label: 'Mensagens', href: '/mensagens', icon: <ChatIcon size={19} /> },
];

export interface AdminShellProps {
  activeKey: string;
  children: ReactNode;
  topbarActions?: ReactNode;
}

/**
 * Casca do super admin — mesmo `AppShell` do dashboard (fase 02), sem tela de
 * referência no bundle: a fidelidade aqui é ao SISTEMA de design, não a um
 * layout específico (`agente-08-super-admin.md`).
 */
export function AdminShell({ activeKey, children, topbarActions }: AdminShellProps) {
  const router = useRouter();
  const { user, logout } = useEstablishmentAuth();

  const nav = useMemo<AppShellNavItem[]>(
    () => NAV.map((item) => ({ key: item.key, label: item.label, icon: item.icon, locked: false, onSelect: () => router.push(item.href) })),
    [router],
  );

  return (
    <AdminGuard>
      <AppShell
        activeKey={activeKey}
        nav={nav}
        brandName="BarberVP · Admin"
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
                  onSelect: () => void logout().then(() => window.location.assign(LOGIN_URL)),
                },
              ]}
            />
          </>
        }
        sidebarFooter={
          <div className="flex flex-col gap-1.5 text-[13px] text-fg-muted">
            <p className="truncate font-semibold text-fg">{user?.name}</p>
            <p className="truncate">Super Admin</p>
          </div>
        }
      >
        {children}
      </AppShell>
    </AdminGuard>
  );
}
