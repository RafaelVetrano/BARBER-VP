'use client';

import { useState } from 'react';
import { LockIcon, cn } from '@barbervp/ui';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { AccountsTab } from '@/components/dashboard/finance/accounts-tab';
import { BankAccountsTab } from '@/components/dashboard/finance/bank-accounts-tab';
import { CashFlowTab } from '@/components/dashboard/finance/cash-flow-tab';
import { CashTab } from '@/components/dashboard/finance/cash-tab';
import { ValesTab } from '@/components/dashboard/finance/vales-tab';
import { useBankAccountsQuery } from '@/lib/dashboard/api/finance';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import { useBarbersQuery } from '@/lib/dashboard/api/team';

type FinTab = 'caixa' | 'contas-pagar' | 'contas-receber' | 'vales' | 'contas-bancarias' | 'fluxo-caixa';

const TABS: { key: FinTab; label: string }[] = [
  { key: 'caixa', label: 'Caixa' },
  { key: 'contas-pagar', label: 'Contas a pagar' },
  { key: 'contas-receber', label: 'Contas a receber' },
  { key: 'vales', label: 'Vales' },
  { key: 'contas-bancarias', label: 'Contas bancárias' },
  { key: 'fluxo-caixa', label: 'Fluxo de caixa' },
];

/**
 * `LOCKED_FIN_TABS` do protótipo — as três, e SÓ as três, que ganham cadeado.
 * Caixa, Contas bancárias e Fluxo de caixa são de todo plano; trancá-las
 * escondia do Essencial telas que o protótipo lhe entrega.
 */
const LOCKED_TABS: FinTab[] = ['contas-pagar', 'contas-receber', 'vales'];

/** `finLockedFeatureBullets` (l.5485) — os mesmos três bullets do upsell. */
const LOCKED_BULLETS = [
  'Controle de contas a pagar e a receber',
  'Registro de vales e adiantamentos',
  'Descontado automaticamente nas comissões',
];

/**
 * Aba **Financeiro** (`Dashboard.dc.html` l.718–1088).
 *
 * A página monta só a moldura: barra de sub-abas com cadeado e o roteamento
 * para cada sub-aba, que é quem faz as próprias consultas. Sem isso, abrir
 * "Caixa" dispararia também as consultas de contas, vales e fluxo — cinco
 * requisições para uma tela que usa uma.
 */
export default function FinanceiroPage() {
  const [tab, setTab] = useState<FinTab>('caixa');

  const shellQuery = useDashboardShellQuery();
  const timezone = shellQuery.data?.tenant.timezone ?? 'America/Sao_Paulo';
  // Espelha o `FeatureGuard`: a casca já traz o mapa de features do plano, e o
  // 403 do servidor continua sendo a palavra final.
  const locked = shellQuery.data !== undefined && !shellQuery.data.features.contasPagarReceber;

  // Contas bancárias abastecem a própria sub-aba E os seletores "Conta de
  // saída/entrada" dos modais de conta — uma consulta só, no topo.
  const bankAccountsQuery = useBankAccountsQuery();
  const barbersQuery = useBarbersQuery();

  const showGate = locked && LOCKED_TABS.includes(tab);

  return (
    <DashboardChrome activeKey="financeiro">
      <h1 className="sr-only">Financeiro</h1>

      <div className="flex flex-col gap-5">
        {/* ── Barra de sub-abas (l.720) ─────────────────────────────────── */}
        <div
          role="tablist"
          aria-label="Financeiro"
          className="flex flex-wrap gap-0.5 self-start rounded-lg border border-border bg-surface-2 p-0.5"
        >
          {TABS.map((item) => {
            const isLocked = locked && LOCKED_TABS.includes(item.key);
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                role="tab"
                type="button"
                aria-selected={active}
                // A aba travada NÃO fica inerte: ela abre, e no lugar do
                // conteúdo entra o paywall com os bullets e o CTA de upgrade
                // (`isFinTabLockedContent`, l.815). Esconder o clique deixaria
                // o dono sem saber por que a aba não responde.
                onClick={() => setTab(item.key)}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[13px] font-semibold transition-colors md:min-h-[38px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                  active && !isLocked
                    ? 'bg-gold text-bg'
                    : isLocked
                      ? 'text-fg-subtle hover:text-fg-muted'
                      : 'text-fg-muted hover:text-fg',
                )}
              >
                {item.label}
                {isLocked && <LockIcon size={13} aria-label="Disponível no plano Profissional" />}
              </button>
            );
          })}
        </div>

        {/* ── Conteúdo bloqueado por plano (l.815) ──────────────────────── */}
        {showGate ? (
          <FeatureLocked
            title="Disponível no plano Profissional"
            description="Contas a pagar e a receber, vales e adiantamentos — com desconto automático na comissão."
            benefits={LOCKED_BULLETS}
            minPlanLabel="Profissional"
          />
        ) : tab === 'caixa' ? (
          <CashTab timezone={timezone} />
        ) : tab === 'contas-pagar' ? (
          <AccountsTab kind="payable" bankAccounts={bankAccountsQuery.data ?? []} />
        ) : tab === 'contas-receber' ? (
          <AccountsTab kind="receivable" bankAccounts={bankAccountsQuery.data ?? []} />
        ) : tab === 'vales' ? (
          <ValesTab barbers={barbersQuery.data ?? []} />
        ) : tab === 'contas-bancarias' ? (
          <BankAccountsTab
            accounts={bankAccountsQuery.data ?? []}
            isLoading={bankAccountsQuery.isLoading}
            isError={bankAccountsQuery.isError}
            onRetry={() => void bankAccountsQuery.refetch()}
          />
        ) : (
          <CashFlowTab />
        )}
      </div>
    </DashboardChrome>
  );
}
