'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ChevronRightIcon, CloseIcon, LockIcon, MenuIcon, ScissorsIcon } from '../icons';
import { cn } from '../lib/cn';
import { useEscapeKey, useFocusTrap, useScrollLock } from '../lib/use-overlay';
import { IconButton } from './button';

export interface AppShellNavItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** Selo à direita (o "IA" do Assistente, no protótipo). */
  badge?: ReactNode;
  /** Recurso fora do plano: cadeado, tom apagado, clique ainda dispara o upsell. */
  locked?: boolean;
  onSelect: () => void;
}

export interface AppShellProps {
  nav: AppShellNavItem[];
  activeKey: string;
  /** Nome exibido ao lado do logo. */
  brandName?: string;
  /** Bloco no pé da sidebar (caixa de plano/trial do protótipo). */
  sidebarFooter?: ReactNode;
  /** Conteúdo à esquerda da topbar (seletor de unidade, busca). */
  topbarStart?: ReactNode;
  /** Conteúdo à direita da topbar (notificações, avatar, CTA). */
  topbarEnd?: ReactNode;
  /** Sidebar começa recolhida (só ícones). */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

function NavList({
  nav,
  activeKey,
  collapsed,
  onNavigate,
}: {
  nav: AppShellNavItem[];
  activeKey: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {nav.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
            onClick={() => {
              item.onSelect();
              onNavigate?.();
            }}
            className={cn(
              'flex h-10 shrink-0 items-center gap-3 rounded-[9px] text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              collapsed ? 'justify-center px-0' : 'px-3',
              active ? 'bg-gold/15 text-gold' : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
              item.locked && 'opacity-60',
            )}
          >
            <span className="shrink-0">{item.icon}</span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
                {item.badge && (
                  <span className="shrink-0 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-bg">
                    {item.badge}
                  </span>
                )}
                {item.locked && (
                  <>
                    <LockIcon size={13} className="shrink-0 text-fg-muted" />
                    <span className="sr-only">Recurso bloqueado neste plano</span>
                  </>
                )}
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function Brand({ brandName, collapsed }: { brandName: string; collapsed: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-gold text-bg">
        <ScissorsIcon size={18} strokeWidth={2} />
      </span>
      {!collapsed && (
        <span className="truncate font-display text-base font-bold tracking-tight text-fg">
          {brandName}
        </span>
      )}
    </div>
  );
}

/**
 * Casca do dashboard — extraída do nav de `Dashboard.dc.html` /
 * `DashboardFuncionario.dc.html`, que são desktop-fixos.
 *
 * - **≥ lg**: sidebar fixa, recolhível para só ícones (o protótipo colapsa
 *   para 64px abaixo de 640px via `!important`; aqui vira botão explícito).
 * - **< lg**: a sidebar sai do fluxo e reaparece como drawer sobreposto,
 *   aberto pelo botão de menu da topbar, com trava de scroll, foco preso,
 *   ESC e clique no fundo.
 */
export function AppShell({
  nav,
  activeKey,
  brandName = 'Barber VP',
  sidebarFooter,
  topbarStart,
  topbarEnd,
  defaultCollapsed = false,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  useScrollLock(drawerOpen);
  useFocusTrap(drawerRef, drawerOpen);
  useEscapeKey(drawerOpen, () => setDrawerOpen(false));

  return (
    <div className="flex min-h-dvh w-full bg-bg">
      {/* ── ≥ lg: sidebar fixa ───────────────────────────────────────── */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface lg:flex',
          'transition-[width] duration-200',
          collapsed ? 'w-[72px]' : 'w-[248px]',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 items-center gap-2 border-b border-border px-4',
            collapsed && 'justify-center px-2',
          )}
        >
          <Brand brandName={brandName} collapsed={collapsed} />
          <IconButton
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-pressed={collapsed}
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            className={cn('ml-auto', collapsed && 'ml-0')}
          >
            <ChevronRightIcon size={16} className={cn('transition-transform', !collapsed && 'rotate-180')} />
          </IconButton>
        </div>

        <NavList nav={nav} activeKey={activeKey} collapsed={collapsed} />

        {sidebarFooter && !collapsed && (
          <div className="shrink-0 border-t border-border p-3">{sidebarFooter}</div>
        )}
      </aside>

      {/* ── < lg: drawer sobreposto ──────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-black opacity-60"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            tabIndex={-1}
            className="relative flex h-full w-[264px] max-w-[85vw] animate-bvp-in-left flex-col border-r border-border bg-surface outline-none"
          >
            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
              <Brand brandName={brandName} collapsed={false} />
              <IconButton
                aria-label="Fechar menu"
                size="sm"
                onClick={() => setDrawerOpen(false)}
                className="ml-auto"
              >
                <CloseIcon size={18} />
              </IconButton>
            </div>

            <NavList
              nav={nav}
              activeKey={activeKey}
              collapsed={false}
              onNavigate={() => setDrawerOpen(false)}
            />

            {sidebarFooter && <div className="shrink-0 border-t border-border p-3">{sidebarFooter}</div>}
          </div>
        </div>
      )}

      {/* ── Coluna de conteúdo ───────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-bg px-4 sm:px-6">
          <IconButton
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            size="sm"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden"
          >
            <MenuIcon size={20} />
          </IconButton>

          {topbarStart && <div className="flex min-w-0 items-center gap-3">{topbarStart}</div>}
          <div className="ml-auto flex shrink-0 items-center gap-2">{topbarEnd}</div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
